import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError, HTTPException
from sqlalchemy.exc import SQLAlchemyError
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from app.core.config import settings
from app.core.database import engine, Base
from app.core.limiter import limiter
from app.routers import auth, employees, attendance, leaves, settings as office_settings, dashboard, reports
from app.seed import seed_db

logger = logging.getLogger("aurawork")

# Error tracking (optional — no-ops if SENTRY_DSN isn't configured). Works
# with any Sentry-protocol-compatible ingest, including a self-hosted
# GlitchTip instance (see docker-compose.observability.yml).
if settings.SENTRY_DSN:
    import sentry_sdk
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        traces_sample_rate=0.1,
    )

# Ensure DB tables are created
Base.metadata.create_all(bind=engine)

# Create static uploads directory
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(os.path.join(settings.UPLOAD_DIR, "selfies"), exist_ok=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Seed database with initial demo data (in development, or when explicitly requested via AUTO_SEED=true)
    auto_seed = os.getenv("AUTO_SEED", "").lower() in ("true", "1", "yes")
    if settings.ENVIRONMENT == "development" or auto_seed:
        try:
            seed_db()
        except Exception as e:
            logger.error(f"Failed to run startup database seeder: {e}")
    else:
        logger.info("Skipping demo data seeding (ENVIRONMENT is not 'development' and AUTO_SEED is not set).")
    yield
    # Shutdown logic if needed

# Initialize FastAPI
# redirect_slashes=False: Starlette's default trailing-slash redirect builds
# the Location header from this process's own perceived host — behind the
# nginx/Next.js proxy in front of this app, that's an internal-only address
# (e.g. the Docker service name) a real browser can never reach. A live e2e
# test caught exactly this: POST /api/leaves (missing the trailing slash the
# route actually requires) 307-redirected straight to the backend's own
# address instead of back through the proxy. Disabling the auto-redirect
# turns any future path/route mismatch into a clean 404 instead of a
# silently-broken cross-origin redirect.
app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
    redirect_slashes=False,
)

app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)

# Prometheus metrics at /metrics — never exposed publicly (nginx only proxies
# /, /api/, and /health; see nginx/nginx.conf). Scraped internally by the
# optional Prometheus service in docker-compose.observability.yml.
Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

# Centralized Exception Handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "message": str(exc.detail),
            "detail": exc.detail,
            "errorCode": f"HTTP_{exc.status_code}",
        },
        headers=getattr(exc, "headers", None),
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    first_error_msg = errors[0].get("msg", "Validation error") if errors else "Invalid request data"
    # Pydantic v2 error dicts can carry a raw exception object in "ctx" (e.g.
    # from a field_validator that raises ValueError) which json.dumps can't
    # serialize on its own — route through jsonable_encoder like FastAPI's
    # own default handler does.
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "success": False,
            "message": first_error_msg,
            "detail": jsonable_encoder(errors),
            "errorCode": "VALIDATION_ERROR",
        },
    )

@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={
            "success": False,
            "message": "Rate limit exceeded. Please wait a moment before trying again.",
            "detail": "Too many requests",
            "errorCode": "RATE_LIMIT_EXCEEDED",
        },
    )

@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    logger.error(f"Database error on {request.method} {request.url.path}: {str(exc)}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "message": "A database error occurred. Please try again later.",
            "detail": "Database error",
            "errorCode": "DATABASE_ERROR",
        },
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled server exception on {request.method} {request.url.path}: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "message": "An unexpected error occurred on the server.",
            "detail": "Internal server error",
            "errorCode": "INTERNAL_SERVER_ERROR",
        },
    )

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none'"
    return response

# Mount router endpoints
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(employees.router, prefix=settings.API_V1_STR)
app.include_router(attendance.router, prefix=settings.API_V1_STR)
app.include_router(leaves.router, prefix=settings.API_V1_STR)
app.include_router(office_settings.router, prefix=settings.API_V1_STR)
app.include_router(dashboard.router, prefix=settings.API_V1_STR)
app.include_router(reports.router, prefix=settings.API_V1_STR)

# Serve uploaded profile images
app.mount("/api/static", StaticFiles(directory=settings.UPLOAD_DIR), name="static")

@app.get("/")
def read_root():
    return {"message": "Welcome to the AuraWork Enterprise Attendance API"}

@app.get("/health")
@app.get("/api/health")
def health_check():
    return {"status": "healthy", "environment": settings.ENVIRONMENT}


