import base64
import io
import uuid
from datetime import timedelta
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
from app.models.models import User
from app.schemas.schemas import (
    LoginRequest, UserOut, UserUpdatePassword, ForgotPasswordRequest, MessageResponse,
    MfaLoginChallenge, MfaSetupResponse, MfaCodeRequest, MfaVerifyRequest, MfaDisableRequest
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

def _issue_session(response: Response, user: User) -> dict:
    """
    Sets the real httpOnly session cookies and builds the standard login
    response body. Shared by the direct-login path (non-MFA accounts) and
    the MFA verification path — both end the same way once the caller's
    identity is fully established.
    """
    access_token = create_jwt_token(subject=user.id, role=user.role, is_refresh=False)
    refresh_token = create_jwt_token(subject=user.id, role=user.role, is_refresh=True)

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

    # Tokens are only ever set as httpOnly cookies, never echoed back in the
    # JSON body — that would defeat the purpose of httpOnly (JS-inaccessible)
    # cookies by handing the raw token to anything that can read the response.
    return {
        "message": "Login successful",
        "user": {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "first_name": user.profile.first_name if user.profile else "",
            "last_name": user.profile.last_name if user.profile else "",
            "profile_image_url": user.profile.profile_image_url if user.profile else None
        }
    }

@router.post("/login")
@limiter.limit(settings.RATE_LIMIT_LOGIN)
def login(
    request: Request,
    response: Response,
    login_data: LoginRequest,
    db: Session = Depends(get_db)
):
    if is_login_locked_out(login_data.email):
        log_audit(db, None, "LOGIN_LOCKED", request.client.host if request.client else None, f"Email: {login_data.email}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed login attempts. Please try again in {settings.FAILED_LOGIN_LOCKOUT_SECONDS // 60} minutes."
        )

    user = db.query(User).filter(User.email == login_data.email).first()
    if not user or not verify_password(login_data.password, user.hashed_password):
        record_failed_login(login_data.email)
        log_audit(db, None, "LOGIN_FAILED", request.client.host if request.client else None, f"Email: {login_data.email}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect email or password"
        )

    if not user.is_active:
        log_audit(db, user.id, "LOGIN_INACTIVE", request.client.host if request.client else None, f"Inactive user: {user.email}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user. Contact your administrator."
        )

    clear_failed_logins(user.email)

    # Admin accounts with MFA enabled don't get a session yet — password is
    # only the first factor. Issue a short-lived, narrowly-scoped challenge
    # token instead; the real session is issued by /mfa/verify.
    if user.role == "Admin" and user.mfa_enabled:
        mfa_token = create_mfa_challenge_token(user.id)
        log_audit(db, user.id, "MFA_CHALLENGE_ISSUED", request.client.host if request.client else None)
        return MfaLoginChallenge(mfa_token=mfa_token)

    log_audit(db, user.id, "LOGIN_SUCCESS", request.client.host if request.client else None, f"Role: {user.role}")
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
        log_audit(db, user.id, "MFA_VERIFY_FAILED", request.client.host if request.client else None)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid authentication code")

    log_audit(db, user.id, "MFA_VERIFY_SUCCESS", request.client.host if request.client else None)
    return _issue_session(response, user)

@router.post("/mfa/setup", response_model=MfaSetupResponse)
def mfa_setup(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generates a new TOTP secret and returns it (as a QR code + manual-entry
    string) for enrollment. Storing it here does NOT enable MFA yet — that
    only happens once the user proves possession of the authenticator via
    /mfa/enable, so an abandoned setup attempt can't lock anyone out.
    """
    secret = pyotp.random_base32()
    current_user.totp_secret = secret
    current_user.mfa_enabled = False
    db.commit()

    provisioning_uri = pyotp.TOTP(secret).provisioning_uri(
        name=current_user.email, issuer_name="AuraWork Portal"
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
    log_audit(db, current_user.id, "MFA_ENABLED", request.client.host if request.client else None)
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
    log_audit(db, current_user.id, "MFA_DISABLED", request.client.host if request.client else None)
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
        # Fallback to authorization header or payload
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
            
        access_token = create_jwt_token(subject=user.id, role=user.role, is_refresh=False)
        
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
    log_audit(db, current_user.id, "LOGOUT", request.client.host if request.client else None)
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
    log_audit(db, current_user.id, "PASSWORD_CHANGED", request.client.host if request.client else None)
    return {"message": "Password changed successfully"}

@router.post("/forgot-password", response_model=MessageResponse)
@limiter.limit(settings.RATE_LIMIT_AUTH)
def forgot_password(
    request: Request,
    email_data: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    email = email_data.email
    user = db.query(User).filter(User.email == email).first()
    if user:
        subject = "AuraWork Portal - Password Reset Request"
        body = (
            f"Hello,\n\n"
            f"You are receiving this email because a password reset request was made for your AuraWork account.\n\n"
            f"If you did not request a password reset, please ignore this email. Otherwise, please contact your "
            f"administrator to complete the reset procedure.\n\n"
            f"Regards,\n"
            f"AuraWork Administration"
        )
        send_email_background(background_tasks, subject, email, body)
        log_audit(db, user.id, "FORGOT_PASSWORD_REQUESTED", request.client.host if request.client else None, f"Email: {email}")
        
    return {"message": f"Password reset instructions have been sent to {email}"}

