from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request, BackgroundTasks
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.config import settings
from app.core.security import (
    verify_password, create_jwt_token, decode_jwt_token, get_current_user, get_password_hash
)
from app.core.utils import log_audit, send_email_background
from app.models.models import User
from app.schemas.schemas import LoginRequest, UserOut, UserUpdatePassword, ForgotPasswordRequest, MessageResponse
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/login")
@limiter.limit(settings.RATE_LIMIT_LOGIN)
def login(
    request: Request,
    response: Response,
    login_data: LoginRequest,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == login_data.email).first()
    if not user or not verify_password(login_data.password, user.hashed_password):
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

    # Generate tokens
    access_token = create_jwt_token(subject=user.id, role=user.role, is_refresh=False)
    refresh_token = create_jwt_token(subject=user.id, role=user.role, is_refresh=True)

    # Set HTTP Only Cookies
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

    log_audit(db, user.id, "LOGIN_SUCCESS", request.client.host if request.client else None, f"Role: {user.role}")

    return {
        "message": "Login successful",
        "user": {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "first_name": user.profile.first_name if user.profile else "",
            "last_name": user.profile.last_name if user.profile else "",
            "profile_image_url": user.profile.profile_image_url if user.profile else None
        },
        "access_token": access_token,
        "refresh_token": refresh_token
    }

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
            
        import uuid
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
            "access_token": access_token,
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

