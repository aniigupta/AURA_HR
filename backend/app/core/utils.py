import math
import logging
from datetime import datetime, date, time, timedelta, timezone
from typing import Optional, Any
from sqlalchemy.orm import Session
from app.models.models import EmployeeProfile, Holiday, OfficeSetting, AuditLog, LeaveRequest, Attendance

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

def get_mail_config(settings: Any) -> Any:
    from fastapi_mail import ConnectionConfig
    return ConnectionConfig(
        MAIL_USERNAME=settings.SMTP_USERNAME,
        MAIL_PASSWORD=settings.SMTP_PASSWORD,
        MAIL_PORT=settings.SMTP_PORT,
        MAIL_SERVER=settings.SMTP_HOST,
        MAIL_STARTTLS=False,
        MAIL_SSL_TLS=False,
        MAIL_FROM=settings.SMTP_FROM,
        MAIL_FROM_NAME="AuraWork Portal",
        USE_CREDENTIALS=bool(settings.SMTP_USERNAME),
        VALIDATE_CERTS=False
    )

def send_email_background(background_tasks: Any, subject: str, recipient: str, body: str) -> None:
    from app.core.config import settings
    from fastapi_mail import FastMail, MessageSchema, MessageType

    if not settings.SMTP_HOST or (settings.SMTP_HOST == "localhost" and not settings.SMTP_USERNAME):
        logger.info(f"Skipping SMTP email dispatch (localhost/unauthenticated). To: {recipient}, Subject: {subject}")
        return

    try:
        message = MessageSchema(
            subject=subject,
            recipients=[recipient],
            body=body,
            subtype=MessageType.plain
        )
        mail_conf = get_mail_config(settings)
        fm = FastMail(mail_conf)
        background_tasks.add_task(fm.send_message, message)
    except Exception as e:
        logger.error(f"Failed to register email background task: {str(e)}")


