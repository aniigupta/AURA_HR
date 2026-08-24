import os
import secrets
import logging
from typing import List, Set
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("aurawork.config")

_environment = os.getenv("ENVIRONMENT", "development")

_secret_key = os.getenv("SECRET_KEY", "")
if not _secret_key:
    if _environment == "production":
        raise RuntimeError(
            "SECRET_KEY environment variable is required in production. "
            "Generate one with: openssl rand -hex 32"
        )
    _secret_key = secrets.token_hex(32)
    logger.warning(
        "SECRET_KEY not set — generated a temporary development key. "
        "All sessions will be invalidated on restart. Set SECRET_KEY in backend/.env to avoid this."
    )

_database_url = os.getenv("DATABASE_URL", "")
if _database_url and _database_url.startswith("postgres://"):
    _database_url = _database_url.replace("postgres://", "postgresql://", 1)
if not _database_url:
    if _environment == "production":
        raise RuntimeError("DATABASE_URL environment variable is required in production.")
    _database_url = "postgresql://postgres:admin@localhost:5432/attendance_db"

_redis_url = os.getenv("REDIS_URL", "")
if not _redis_url:
    if _environment == "production":
        logger.warning(
            "REDIS_URL not set in production — slowapi rate-limiter will use in-memory fallback. "
            "Configure an Upstash or Redis instance if running multiple replicas."
        )
    _redis_url = "redis://localhost:6379/0"

class Settings:
    PROJECT_NAME: str = "AuraWork Enterprise HRMS Portal"
    API_V1_STR: str = "/api"
    ENVIRONMENT: str = _environment
    SECRET_KEY: str = _secret_key
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60  # 1 hour
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Database
    DATABASE_URL: str = _database_url

    # Redis (shared rate-limit storage + login-lockout counters)
    REDIS_URL: str = _redis_url

    # CORS Origins
    ALLOWED_ORIGINS: str = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,http://frontend:3000")

    # Uploads and File Security
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "uploads")
    MAX_UPLOAD_SIZE_BYTES: int = 5 * 1024 * 1024  # 5 MB max
    ALLOWED_UPLOAD_EXTENSIONS: Set[str] = {".jpg", ".jpeg", ".png", ".webp"}
    ALLOWED_UPLOAD_MIME_TYPES: Set[str] = {"image/jpeg", "image/png", "image/webp"}

    # Rate Limiting
    RATE_LIMIT_LOGIN: str = "10/minute"
    RATE_LIMIT_AUTH: str = "20/minute"
    RATE_LIMIT_DEFAULT: str = "120/minute"

    # Account lockout (Redis-backed failed-login counters, see app/core/utils.py)
    FAILED_LOGIN_LOCKOUT_THRESHOLD: int = 5
    FAILED_LOGIN_LOCKOUT_SECONDS: int = 15 * 60  # 15 minutes

    # AWS S3 Settings
    S3_BUCKET: str = os.getenv("S3_BUCKET", "aurawork-uploads-bucket")
    S3_ACCESS_KEY: str = os.getenv("S3_ACCESS_KEY", "")
    S3_SECRET_KEY: str = os.getenv("S3_SECRET_KEY", "")
    S3_ENDPOINT: str = os.getenv("S3_ENDPOINT", "")  # Optional
    S3_REGION: str = os.getenv("S3_REGION", "us-east-1")

    # SMTP Email Settings
    SMTP_HOST: str = os.getenv("SMTP_HOST", "localhost")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "1025"))
    SMTP_USERNAME: str = os.getenv("SMTP_USERNAME", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM: str = os.getenv("SMTP_FROM", "noreply@company.com")

    # Error tracking (optional — Sentry-protocol DSN, e.g. from a self-hosted
    # GlitchTip instance; see docker-compose.observability.yml). Left blank
    # by default so dev/test environments don't try to report anything.
    SENTRY_DSN: str = os.getenv("SENTRY_DSN", "")

    # AI HR Assistant (Google Gemini 1.5 Flash API Key)
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

    @property
    def cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

settings = Settings()

