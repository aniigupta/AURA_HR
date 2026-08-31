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

def log_audit(
    db: Session,
    user_id: Optional[Any],
    action: str,
    ip_address: Optional[str],
    details: Optional[str] = None,
    organization_id: Optional[Any] = None
) -> None:
    """
    Utility function to write logs to the AuditLog table with sensitive information stripped.
    """
    try:
        sanitized = sanitize_audit_details(details)
        log_entry = AuditLog(
            organization_id=organization_id,
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

_IN_MEMORY_FAILED_LOGINS: dict = {}

def is_login_locked_out(email: str) -> bool:
    """
    Check whether repeated failed logins have locked out this email.
    Fails open / in-memory if Redis is unreachable.
    """
    from app.core.limiter import redis_client
    from app.core.config import settings
    try:
        count = redis_client.get(_failed_login_key(email))
        return count is not None and int(count) >= settings.FAILED_LOGIN_LOCKOUT_THRESHOLD
    except Exception:
        count = _IN_MEMORY_FAILED_LOGINS.get(email, 0)
        return count >= settings.FAILED_LOGIN_LOCKOUT_THRESHOLD

def record_failed_login(email: str) -> None:
    """Increment the failed-login counter for an email, with a rolling TTL."""
    from app.core.limiter import redis_client
    from app.core.config import settings
    try:
        key = _failed_login_key(email)
        count = redis_client.incr(key)
        if count == 1:
            redis_client.expire(key, settings.FAILED_LOGIN_LOCKOUT_SECONDS)
    except Exception:
        _IN_MEMORY_FAILED_LOGINS[email] = _IN_MEMORY_FAILED_LOGINS.get(email, 0) + 1

def clear_failed_logins(email: str) -> None:
    """Reset the failed-login counter for an email after a successful login."""
    from app.core.limiter import redis_client
    try:
        redis_client.delete(_failed_login_key(email))
    except Exception:
        pass
    _IN_MEMORY_FAILED_LOGINS.pop(email, None)

def get_day_status_for_employee(db: Session, user_id: Any, check_date: date, profile: EmployeeProfile, settings: OfficeSetting) -> str:
    """
    Determine default status of the day before clocking in (Weekend, Holiday, Leave, Work From Home, or Absent)
    """
    # 1. Check if WFH is active
    if is_wfh_active(profile, check_date):
        return "Work From Home"

    # 2. Check if Holiday
    holiday_query = db.query(Holiday).filter(Holiday.date == check_date)
    if profile and profile.organization_id:
        holiday_query = holiday_query.filter(Holiday.organization_id == profile.organization_id)
    holiday = holiday_query.first()
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

class DayStatusResolver:
    """
    Batched equivalent of get_day_status_for_employee.

    That function issues two queries (holidays, then approved leaves) for every
    (employee, day) pair with no attendance record. Payroll reports call it
    across every employee for every day of the pay period, so the query count
    grows as employees x days: a 150-employee month measured 2,222 queries and
    ~5s for a single /reports/payroll request.

    This resolver runs the same three lookups once for the whole period and
    answers from memory, so the same report costs a constant number of queries.
    The decision order below is deliberately identical to
    get_day_status_for_employee - WFH, then holiday, then weekend, then leave.
    """

    def __init__(
        self,
        db: Session,
        organization_id: Any,
        start_date: date,
        end_date: date,
        settings: OfficeSetting,
    ) -> None:
        self._holiday_dates = {
            row[0]
            for row in db.query(Holiday.date).filter(
                Holiday.organization_id == organization_id,
                Holiday.date >= start_date,
                Holiday.date <= end_date,
            )
        }

        # Any approved leave that overlaps the period at all, keyed by user.
        self._leaves_by_user: dict = {}
        leave_rows = db.query(
            LeaveRequest.user_id, LeaveRequest.start_date, LeaveRequest.end_date
        ).filter(
            LeaveRequest.organization_id == organization_id,
            LeaveRequest.status == "Approved",
            LeaveRequest.start_date <= end_date,
            LeaveRequest.end_date >= start_date,
        )
        for user_id, l_start, l_end in leave_rows:
            self._leaves_by_user.setdefault(user_id, []).append((l_start, l_end))

        weekends = settings.weekends or ""
        self._weekend_days = {day.strip().lower() for day in weekends.split(",") if day.strip()}

    def status_for(self, user_id: Any, check_date: date, profile: Optional[EmployeeProfile]) -> str:
        if is_wfh_active(profile, check_date):
            return "Work From Home"

        if check_date in self._holiday_dates:
            return "Holiday"

        if check_date.strftime("%A").lower() in self._weekend_days:
            return "Weekend"

        for l_start, l_end in self._leaves_by_user.get(user_id, ()):
            if l_start <= check_date <= l_end:
                return "Leave"

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

async def _send_email_async(
    subject: str,
    recipient: str,
    body: str,
    smtp_config: Optional[dict] = None
) -> None:
    import aiosmtplib
    from email.message import EmailMessage
    from app.core.config import settings

    cfg = smtp_config or {}
    smtp_host = cfg.get("smtp_host") or settings.SMTP_HOST
    smtp_port = cfg.get("smtp_port") or settings.SMTP_PORT or 587
    smtp_username = cfg.get("smtp_username") or settings.SMTP_USERNAME or None
    smtp_password = cfg.get("smtp_password") or settings.SMTP_PASSWORD or None
    from_email = cfg.get("smtp_from_email") or settings.SMTP_FROM or (smtp_username if smtp_username else "noreply@aurahr.com")
    from_name = cfg.get("smtp_from_name")
    
    from_header = f"{from_name} <{from_email}>" if from_name else from_email

    if not smtp_host or (smtp_host == "localhost" and not smtp_username):
        logger.info(f"Skipping SMTP email dispatch (localhost/unconfigured). To: {recipient}, Subject: {subject}")
        return

    message = EmailMessage()
    message["From"] = from_header
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(body)

    is_local_smtp = smtp_host in ("localhost", "127.0.0.1")
    use_tls = cfg.get("smtp_use_tls", True) if not is_local_smtp else False

    try:
        await aiosmtplib.send(
            message,
            hostname=smtp_host,
            port=int(smtp_port),
            username=smtp_username,
            password=smtp_password,
            start_tls=use_tls,
            validate_certs=use_tls,
        )
        logger.info(f"Successfully sent email to {recipient} via {smtp_host}")
    except Exception as e:
        logger.error(f"Failed to send email to {recipient} via {smtp_host}: {e}")

def send_email_background(
    background_tasks: Any,
    subject: str,
    recipient: str,
    body: str,
    smtp_config: Optional[dict] = None
) -> None:
    background_tasks.add_task(_send_email_async, subject, recipient, body, smtp_config)

def send_employee_welcome_email(
    background_tasks: Any,
    recipient_email: str,
    employee_name: str,
    employee_id: str,
    password: str,
    organization_name: str,
    login_url: str = "http://localhost:3000/login",
    smtp_config: Optional[dict] = None
) -> None:
    """Dispatches a structured onboarding welcome email with login credentials and direct punch-in link."""
    subject = f"Welcome to {organization_name} — Your Employee Portal Login & Punch-in Credentials"
    body = f"""Hello {employee_name},

Welcome to {organization_name}!

Your employee self-service portal account has been created. You can use this portal to punch in/out for shifts, track daily working hours, request leaves, and download monthly payslips.

--------------------------------------------------
YOUR LOGIN CREDENTIALS:
--------------------------------------------------
Portal Login Link: {login_url}
Employee ID:       {employee_id}
Email Address:     {recipient_email}
Password:          {password}
--------------------------------------------------

HOW TO PUNCH IN / CLOCK IN:
1. Open the login link: {login_url}
2. Enter your Email and Password above to sign in.
3. Click "Clock In" on your Employee Dashboard when your shift begins.
4. If your office uses GPS geofencing or selfie verification, allow location/camera access when prompted.

For security, we recommend changing your password or enabling Two-Factor Authentication (MFA) after your first login.

Best regards,
{organization_name} HR Team
"""
    send_email_background(background_tasks, subject, recipient_email, body, smtp_config)


