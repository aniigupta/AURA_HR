import base64
import io
import uuid
from datetime import date, time
from typing import Optional
import pyotp
import qrcode
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request, BackgroundTasks
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.config import settings
from app.core.security import (
    verify_password, create_jwt_token, create_mfa_challenge_token, decode_jwt_token, get_current_user, get_password_hash
)
from app.core.utils import log_audit, send_email_background, is_login_locked_out, record_failed_login, clear_failed_logins
from app.core.limiter import limiter
from app.models.models import Organization, User, EmployeeProfile, Department, OfficeSetting, Holiday
from app.schemas.schemas import (
    LoginRequest, UserOut, UserUpdatePassword, ForgotPasswordRequest, MessageResponse,
    MfaLoginChallenge, MfaSetupResponse, MfaCodeRequest, MfaVerifyRequest, MfaDisableRequest,
    CompanyRegisterRequest
)
from app.seed import INDIAN_PUBLIC_HOLIDAYS

router = APIRouter(prefix="/auth", tags=["Authentication"])

def _issue_session(response: Response, user: User) -> dict:
    """
    Sets the httpOnly session cookies with organization_id payload and builds the standard login response.
    """
    access_token = create_jwt_token(subject=user.id, role=user.role, organization_id=user.organization_id, is_refresh=False)
    refresh_token = create_jwt_token(subject=user.id, role=user.role, organization_id=user.organization_id, is_refresh=True)

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        expires=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        samesite="lax",
        secure=settings.ENVIRONMENT == "production",
    )

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        max_age=settings.REFRESH_TOKEN_EXPIRE_MINUTES * 60,
        expires=settings.REFRESH_TOKEN_EXPIRE_MINUTES * 60,
        samesite="lax",
        secure=settings.ENVIRONMENT == "production",
    )

    org_name = user.organization.name if user.organization else "AuraWork Portal"
    org_slug = user.organization.slug if user.organization else "default"
    org_plan = user.organization.plan if user.organization else "Starter"

    return {
        "message": "Login successful",
        "user": {
            "id": user.id,
            "organization_id": user.organization_id,
            "organization_name": org_name,
            "organization_slug": org_slug,
            "plan": org_plan,
            "email": user.email,
            "role": user.role,
            "first_name": user.profile.first_name if user.profile else "",
            "last_name": user.profile.last_name if user.profile else "",
            "profile_image_url": user.profile.profile_image_url if user.profile else None
        }
    }

@router.post("/register-company")
@limiter.limit("10/minute")
def register_company(
    request: Request,
    response: Response,
    payload: CompanyRegisterRequest,
    db: Session = Depends(get_db)
):
    """
    Self-service multi-tenant onboarding: Creates an Organization, OfficeSetting,
    default departments, national holidays, and initial Admin user atomically.
    """
    slug_clean = payload.company_slug.lower().strip()
    
    # 1. Check if organization slug is already registered
    existing_org = db.query(Organization).filter(Organization.slug == slug_clean).first()
    if existing_org:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Company subdomain/slug '{slug_clean}' is already registered. Please pick another."
        )

    try:
        # 2. Create Organization
        org = Organization(
            name=payload.company_name.strip(),
            slug=slug_clean,
            plan="Starter",
            max_employees=25,
            is_active=True
        )
        db.add(org)
        db.flush()

        # 3. Create Office Settings & Geofence
        office_setting = OfficeSetting(
            organization_id=org.id,
            latitude=payload.latitude if payload.latitude is not None else 28.6139,
            longitude=payload.longitude if payload.longitude is not None else 77.2090,
            allowed_radius=payload.allowed_radius if payload.allowed_radius is not None else 150.0,
            office_start_time=time(9, 30),
            office_end_time=time(18, 30),
            lunch_break_hours=1.0,
            required_working_hours=8.0,
            weekends="Saturday,Sunday",
            timezone="Asia/Kolkata"
        )
        db.add(office_setting)
        db.flush()

        # 4. Bootstrap Starter Departments
        default_depts = [
            ("Engineering & Tech", "Software architecture, IT systems, and product development"),
            ("Human Resources", "Talent acquisition, payroll, and employee relations"),
            ("Finance & Accounts", "Bookkeeping, financial planning, and statutory tax"),
            ("Sales & Marketing", "Revenue growth, brand marketing, and client accounts"),
            ("Operations & General", "Daily workplace operations and facilities management")
        ]
        created_depts = {}
        for d_name, d_desc in default_depts:
            dept = Department(organization_id=org.id, name=d_name, description=d_desc)
            db.add(dept)
            db.flush()
            created_depts[d_name] = dept

        # 5. Bootstrap Official Indian Public Holidays
        for h in INDIAN_PUBLIC_HOLIDAYS:
            db.add(Holiday(organization_id=org.id, name=h["name"], date=h["date"], description=h["description"]))

        # 6. Create Initial Admin User & Employee Profile
        names = payload.admin_name.strip().split(" ", 1)
        first_name = names[0]
        last_name = names[1] if len(names) > 1 else "Admin"

        admin_user = User(
            organization_id=org.id,
            email=payload.admin_email.lower().strip(),
            hashed_password=get_password_hash(payload.admin_password),
            role="Admin",
            is_active=True
        )
        db.add(admin_user)
        db.flush()

        hr_dept = created_depts.get("Human Resources") or list(created_depts.values())[0]

        admin_profile = EmployeeProfile(
            organization_id=org.id,
            user_id=admin_user.id,
            first_name=first_name,
            last_name=last_name,
            employee_id="EMP000",
            phone=payload.admin_phone,
            designation=payload.designation or "Founder & Managing Director",
            department_id=hr_dept.id,
            join_date=date.today(),
            leave_balance_casual=12,
            leave_balance_sick=10,
            leave_balance_paid=15,
            hourly_rate=1200.0,
            base_salary=180000.0,
            wfh_enabled=False
        )
        db.add(admin_profile)
        db.flush()

        db.commit()

        # Log audit trail
        log_audit(
            db,
            admin_user.id,
            "ORGANIZATION_REGISTERED",
            request.client.host if request.client else None,
            f"Created Organization: {org.name} ({slug_clean})",
            organization_id=org.id
        )

        return _issue_session(response, admin_user)

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to complete company registration: {str(e)}"
        )

@router.post("/login")
@limiter.limit(settings.RATE_LIMIT_LOGIN)
def login(
    request: Request,
    response: Response,
    login_data: LoginRequest,
    db: Session = Depends(get_db)
):
    email_clean = login_data.email.strip().lower()
    
    if is_login_locked_out(email_clean):
        log_audit(db, None, "LOGIN_LOCKED", request.client.host if request.client else None, f"Email: {email_clean}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed login attempts. Please try again in {settings.FAILED_LOGIN_LOCKOUT_SECONDS // 60} minutes."
        )

    # 1. Multi-tenant User Resolution
    user: Optional[User] = None
    if login_data.company_slug:
        org = db.query(Organization).filter(Organization.slug == login_data.company_slug.lower().strip()).first()
        if not org:
            record_failed_login(email_clean)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Organization not found with the specified company slug"
            )
        user = db.query(User).filter(User.organization_id == org.id, User.email == email_clean).first()
    else:
        # Search by email across organizations
        users = db.query(User).filter(User.email == email_clean).all()
        if len(users) == 1:
            user = users[0]
        elif len(users) > 1:
            # Match password across tenants
            matched = [u for u in users if verify_password(login_data.password, u.hashed_password)]
            if len(matched) == 1:
                user = matched[0]
            elif len(matched) > 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Multiple company accounts found for this email. Please specify your company slug."
                )

    if not user or not verify_password(login_data.password, user.hashed_password):
        record_failed_login(email_clean)
        log_audit(db, None, "LOGIN_FAILED", request.client.host if request.client else None, f"Email: {email_clean}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect email or password"
        )

    if not user.is_active:
        log_audit(db, user.id, "LOGIN_INACTIVE", request.client.host if request.client else None, f"Inactive user: {user.email}", organization_id=user.organization_id)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account. Contact your administrator."
        )

    if user.organization and not user.organization.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization subscription is suspended or inactive."
        )

    clear_failed_logins(email_clean)

    # Admin accounts with MFA enabled
    if user.role == "Admin" and user.mfa_enabled:
        mfa_token = create_mfa_challenge_token(user.id, organization_id=user.organization_id)
        log_audit(db, user.id, "MFA_CHALLENGE_ISSUED", request.client.host if request.client else None, organization_id=user.organization_id)
        return MfaLoginChallenge(mfa_token=mfa_token)

    log_audit(db, user.id, "LOGIN_SUCCESS", request.client.host if request.client else None, f"Role: {user.role}", organization_id=user.organization_id)
    return _issue_session(response, user)

@router.post("/mfa/verify")
@limiter.limit(settings.RATE_LIMIT_AUTH)
def mfa_verify(
    request: Request,
    response: Response,
    payload: MfaVerifyRequest,
    db: Session = Depends(get_db)
):
    try:
        decoded = decode_jwt_token(payload.mfa_token)
    except HTTPException:
        raise

    if decoded.get("type") != "mfa_challenge":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired MFA session")

    try:
        user_uuid = uuid.UUID(decoded.get("sub"))
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired MFA session")

    user = db.query(User).filter(User.id == user_uuid).first()
    if not user or not user.is_active or not user.mfa_enabled or not user.totp_secret:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired MFA session")

    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(payload.code, valid_window=1):
        log_audit(db, user.id, "MFA_VERIFY_FAILED", request.client.host if request.client else None, organization_id=user.organization_id)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid authentication code")

    log_audit(db, user.id, "MFA_VERIFY_SUCCESS", request.client.host if request.client else None, organization_id=user.organization_id)
    return _issue_session(response, user)

@router.post("/mfa/setup", response_model=MfaSetupResponse)
def mfa_setup(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    secret = pyotp.random_base32()
    current_user.totp_secret = secret
    current_user.mfa_enabled = False
    db.commit()

    org_name = current_user.organization.name if current_user.organization else "AuraWork Portal"
    provisioning_uri = pyotp.TOTP(secret).provisioning_uri(
        name=current_user.email, issuer_name=f"AuraWork ({org_name})"
    )
    qr_img = qrcode.make(provisioning_uri)
    buf = io.BytesIO()
    qr_img.save(buf, format="PNG")
    qr_b64 = base64.b64encode(buf.getvalue()).decode()

    return MfaSetupResponse(secret=secret, qr_code_base64=f"data:image/png;base64,{qr_b64}")

@router.post("/mfa/enable", response_model=MessageResponse)
def mfa_enable(
    request: Request,
    payload: MfaCodeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not current_user.totp_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Run MFA setup first")

    totp = pyotp.TOTP(current_user.totp_secret)
    if not totp.verify(payload.code, valid_window=1):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid authentication code")

    current_user.mfa_enabled = True
    db.commit()
    log_audit(db, current_user.id, "MFA_ENABLED", request.client.host if request.client else None, organization_id=current_user.organization_id)
    return {"message": "MFA enabled successfully"}

@router.post("/mfa/disable", response_model=MessageResponse)
def mfa_disable(
    request: Request,
    payload: MfaDisableRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not verify_password(payload.password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect password")

    current_user.mfa_enabled = False
    current_user.totp_secret = None
    db.commit()
    log_audit(db, current_user.id, "MFA_DISABLED", request.client.host if request.client else None, organization_id=current_user.organization_id)
    return {"message": "MFA disabled successfully"}

@router.post("/refresh")
@limiter.limit(settings.RATE_LIMIT_AUTH)
def refresh(
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        authorization = request.headers.get("Authorization")
        if authorization and authorization.startswith("Bearer "):
            refresh_token = authorization.split(" ")[1]

    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing"
        )
    
    try:
        payload = decode_jwt_token(refresh_token)
        user_id = payload.get("sub")
        token_type = payload.get("type")
        
        if not user_id or token_type != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )
            
        user_uuid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
        user = db.query(User).filter(User.id == user_uuid).first()
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive"
            )
            
        access_token = create_jwt_token(subject=user.id, role=user.role, organization_id=user.organization_id, is_refresh=False)
        
        response.set_cookie(
            key="access_token",
            value=access_token,
            httponly=True,
            max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            expires=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            samesite="lax",
            secure=settings.ENVIRONMENT == "production",
        )
        
        return {
            "message": "Token refreshed successfully"
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token session"
        )

@router.post("/logout", response_model=MessageResponse)
def logout(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    log_audit(db, current_user.id, "LOGOUT", request.client.host if request.client else None, organization_id=current_user.organization_id)
    return {"message": "Logout successful"}

@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.post("/change-password", response_model=MessageResponse)
@limiter.limit(settings.RATE_LIMIT_AUTH)
def change_password(
    request: Request,
    pwd_data: UserUpdatePassword,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not verify_password(pwd_data.old_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password"
        )
        
    current_user.hashed_password = get_password_hash(pwd_data.new_password)
    db.commit()
    log_audit(db, current_user.id, "PASSWORD_CHANGED", request.client.host if request.client else None, organization_id=current_user.organization_id)
    return {"message": "Password changed successfully"}

@router.post("/forgot-password", response_model=MessageResponse)
@limiter.limit(settings.RATE_LIMIT_AUTH)
def forgot_password(
    request: Request,
    email_data: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    email = email_data.email.strip().lower()
    query = db.query(User).filter(User.email == email)
    if email_data.company_slug:
        org = db.query(Organization).filter(Organization.slug == email_data.company_slug.lower().strip()).first()
        if org:
            query = query.filter(User.organization_id == org.id)
    
    user = query.first()
    if user:
        org_name = user.organization.name if user.organization else "AuraWork"
        subject = f"{org_name} - Password Reset Request"
        body = (
            f"Hello,\n\n"
            f"You are receiving this email because a password reset request was made for your account on {org_name}.\n\n"
            f"If you did not request a password reset, please ignore this email. Otherwise, please contact your "
            f"organization administrator to complete the reset.\n\n"
            f"Regards,\n"
            f"{org_name} Administration"
        )
        send_email_background(background_tasks, subject, email, body)
        log_audit(db, user.id, "FORGOT_PASSWORD_REQUESTED", request.client.host if request.client else None, f"Email: {email}", organization_id=user.organization_id)
        
    return {"message": f"Password reset instructions have been sent to {email}"}
