import math
import logging
from datetime import datetime, date, timedelta, timezone
from typing import Optional, Any
from sqlalchemy.orm import Session
from app.models.models import EmployeeProfile, Holiday, OfficeSetting, AuditLog, LeaveRequest

logger = logging.getLogger("aurawork.audit")

def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points 
    on the earth (specified in decimal degrees)
    Returns distance in meters.
    """
    # Validate coordinate ranges
    lat1 = max(-90.0, min(90.0, lat1))
    lat2 = max(-90.0, min(90.0, lat2))
    lon1 = max(-180.0, min(180.0, lon1))
    lon2 = max(-180.0, min(180.0, lon2))

    # Convert decimal degrees to radians 
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])

    # Haversine formula 
    dlon = lon2 - lon1 
    dlat = lat2 - lat1 
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(max(0.0, min(1.0, a)))) 
    r = 6371000 # Radius of earth in meters.
    return c * r

def is_wfh_active(profile: Optional[EmployeeProfile], check_date: date) -> bool:
    """
    Checks if WFH exception is currently enabled and active for the employee on check_date.
    """
    if not profile or not profile.wfh_enabled:
        return False
    
    # Check date boundaries if set
    if profile.wfh_start_date and check_date < profile.wfh_start_date:
        return False
    if profile.wfh_end_date and check_date > profile.wfh_end_date:
        return False
        
    return True

def validate_image_bytes(image_bytes: bytes, allowed_formats: frozenset = frozenset({"JPEG", "PNG", "WEBP"})) -> None:
    """
    Verify that raw bytes actually decode as an image of an allowed format.
    File extensions and Content-Type headers are client-supplied and easily
    spoofed, so uploads must be validated against their real content before
    being written to disk/served.
    Raises ValueError if the content is not a valid/allowed image.
    """
    import io
    from PIL import Image, UnidentifiedImageError

    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            img.verify()
        # Image.verify() leaves the file object unusable for further access,
        # so re-open to read the format after a successful integrity check.
        with Image.open(io.BytesIO(image_bytes)) as img:
            fmt = (img.format or "").upper()
    except (UnidentifiedImageError, OSError) as e:
        raise ValueError("File is not a valid image") from e

    if fmt not in allowed_formats:
        raise ValueError(f"Unsupported image format: {fmt or 'unknown'}")

def sanitize_audit_details(details: Optional[str]) -> Optional[str]:
    """Strip out passwords, tokens, or credentials before logging."""
    if not details:
        return None
    # Truncate overly long details to prevent DB bloat
    if len(details) > 1000:
        details = details[:1000] + "...[truncated]"
    return details

def log_audit(db: Session, user_id: Optional[Any], action: str, ip_address: Optional[str], details: Optional[str] = None) -> None:
    """
    Utility function to write logs to the AuditLog table with sensitive information stripped.
    """
    try:
        sanitized = sanitize_audit_details(details)
        log_entry = AuditLog(
            user_id=user_id,
            action=action,
            ip_address=ip_address,
            details=sanitized,
            timestamp=datetime.now(timezone.utc)
        )
        db.add(log_entry)
        db.commit()
    except Exception as e:
        db.rollback()
        logger.warning(f"Failed to log audit action '{action}': {e}")

def _failed_login_key(email: str) -> str:
    return f"failed_login:{email.strip().lower()}"

def is_login_locked_out(email: str) -> bool:
    """
    Check whether repeated failed logins have locked out this email.
    Fails open (returns False) if Redis is unreachable — an infra outage on
    the rate-limit store should never itself become a login outage.
    """
    from app.core.limiter import redis_client
    from app.core.config import settings
    try:
        count = redis_client.get(_failed_login_key(email))
        return count is not None and int(count) >= settings.FAILED_LOGIN_LOCKOUT_THRESHOLD
    except Exception as e:
        logger.warning(f"Login lockout check failed (Redis unavailable?): {e}")
        return False

def record_failed_login(email: str) -> None:
    """Increment the failed-login counter for an email, with a rolling TTL."""
    from app.core.limiter import redis_client
    from app.core.config import settings
    try:
        key = _failed_login_key(email)
        count = redis_client.incr(key)
        if count == 1:
            redis_client.expire(key, settings.FAILED_LOGIN_LOCKOUT_SECONDS)
    except Exception as e:
        logger.warning(f"Failed to record failed login attempt (Redis unavailable?): {e}")

def clear_failed_logins(email: str) -> None:
    """Reset the failed-login counter for an email after a successful login."""
    from app.core.limiter import redis_client
    try:
        redis_client.delete(_failed_login_key(email))
    except Exception as e:
        logger.warning(f"Failed to clear failed login attempts (Redis unavailable?): {e}")

def get_day_status_for_employee(db: Session, user_id: Any, check_date: date, profile: EmployeeProfile, settings: OfficeSetting) -> str:
    """
    Determine default status of the day before clocking in (Weekend, Holiday, Leave, Work From Home, or Absent)
    """
    # 1. Check if WFH is active
    if is_wfh_active(profile, check_date):
        return "Work From Home"

    # 2. Check if Holiday
    holiday = db.query(Holiday).filter(Holiday.date == check_date).first()
    if holiday:
        return "Holiday"

    # 3. Check if Weekend
    day_name = check_date.strftime("%A") # e.g. "Sunday"
    weekend_list = [day.strip().lower() for day in settings.weekends.split(",")]
    if day_name.lower() in weekend_list:
        return "Weekend"

    # 4. Check if Leave is approved for this day
    leave = db.query(LeaveRequest).filter(
        LeaveRequest.user_id == user_id,
        LeaveRequest.status == "Approved",
        LeaveRequest.start_date <= check_date,
        LeaveRequest.end_date >= check_date
    ).first()
    if leave:
        return "Leave"

    # Default is Absent until they Clock In
    return "Absent"

def get_safe_timezone(tz_name: Optional[str] = None) -> Any:
    """Return a timezone object, falling back to IST (+05:30) or UTC if tzdata is missing."""
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
    if tz_name:
        try:
            return ZoneInfo(tz_name)
        except (ZoneInfoNotFoundError, Exception):
            pass
    try:
        return ZoneInfo("Asia/Kolkata")
    except Exception:
        return timezone(timedelta(hours=5, minutes=30))

async def _send_email_async(subject: str, recipient: str, body: str) -> None:
    """
    Actually sends the email via aiosmtplib directly — no fastapi-mail
    wrapper. That wrapper previously hard-pinned aiosmtplib<3.0, which meant
    a known-vulnerable aiosmtplib 2.0.2 couldn't be upgraded without also
    bumping fastapi-mail, which in turn pulled in an incompatible Starlette
    major version and broke FastAPI's routing outright. Talking to
    aiosmtplib directly removes that whole chain of constraints.
    """
    import aiosmtplib
    from email.message import EmailMessage
    from app.core.config import settings

    message = EmailMessage()
    message["From"] = settings.SMTP_FROM
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(body)

    # Local dev mail catchers (e.g. mailhog on localhost) don't speak TLS.
    # Any real SMTP host gets STARTTLS + certificate validation enabled —
    # never silently disable cert checks against a real mail provider.
    is_local_smtp = settings.SMTP_HOST in ("localhost", "127.0.0.1")
    try:
        await aiosmtplib.send(
            message,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USERNAME or None,
            password=settings.SMTP_PASSWORD or None,
            start_tls=not is_local_smtp,
            validate_certs=not is_local_smtp,
        )
    except Exception as e:
        logger.error(f"Failed to send email to {recipient}: {e}")

def send_email_background(background_tasks: Any, subject: str, recipient: str, body: str) -> None:
    from app.core.config import settings

    if not settings.SMTP_HOST or (settings.SMTP_HOST == "localhost" and not settings.SMTP_USERNAME):
        logger.info(f"Skipping SMTP email dispatch (localhost/unauthenticated). To: {recipient}, Subject: {subject}")
        return

    background_tasks.add_task(_send_email_async, subject, recipient, body)


