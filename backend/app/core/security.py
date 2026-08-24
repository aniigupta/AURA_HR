import uuid
import jwt
from datetime import datetime, timedelta, timezone
from typing import Optional, Union, List
from fastapi import Request, HTTPException, status, Depends
from fastapi.security import APIKeyCookie
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db
from app.models.models import User

# Crypt context for password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Cookie authentication schemas
access_token_cookie = APIKeyCookie(name="access_token", auto_error=False)
refresh_token_cookie = APIKeyCookie(name="refresh_token", auto_error=False)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_jwt_token(
    subject: Union[str, uuid.UUID],
    role: str,
    organization_id: Optional[Union[str, uuid.UUID]] = None,
    expires_delta: Optional[timedelta] = None,
    is_refresh: bool = False
) -> str:
    now_utc = datetime.now(timezone.utc)
    if expires_delta:
        expire = now_utc + expires_delta
    else:
        minutes = settings.REFRESH_TOKEN_EXPIRE_MINUTES if is_refresh else settings.ACCESS_TOKEN_EXPIRE_MINUTES
        expire = now_utc + timedelta(minutes=minutes)
    
    to_encode = {
        "exp": int(expire.timestamp()),
        "sub": str(subject),
        "role": role,
        "type": "refresh" if is_refresh else "access"
    }
    if organization_id:
        to_encode["org_id"] = str(organization_id)

    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def create_mfa_challenge_token(subject: Union[str, uuid.UUID], organization_id: Optional[Union[str, uuid.UUID]] = None) -> str:
    now_utc = datetime.now(timezone.utc)
    expire = now_utc + timedelta(minutes=5)
    to_encode = {
        "exp": int(expire.timestamp()),
        "sub": str(subject),
        "type": "mfa_challenge",
    }
    if organization_id:
        to_encode["org_id"] = str(organization_id)
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def decode_jwt_token(token: str) -> dict:
    try:
        decoded_token = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return decoded_token
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

# Dependency to get current user with tenant validation
def get_current_user(
    request: Request,
    db: Session = Depends(get_db)
) -> User:
    # First look in HTTP Only cookies
    token = request.cookies.get("access_token")
    
    # Fallback to Authorization Header if cookies are empty
    if not token:
        authorization: Optional[str] = request.headers.get("Authorization")
        if authorization and authorization.startswith("Bearer "):
            token = authorization.split(" ")[1]

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    payload = decode_jwt_token(token)
    user_id = payload.get("sub")
    token_type = payload.get("type")
    
    if not user_id or token_type != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    try:
        user_uuid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID in token",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    user = db.query(User).filter(User.id == user_uuid).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is inactive"
        )
    if user.organization and not user.organization.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization account is suspended or inactive"
        )
    return user

# Role enforcement dependencies
class RoleChecker:
    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Operation not permitted for this role"
            )
        return current_user
