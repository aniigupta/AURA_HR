import base64
import os
import uuid
from datetime import datetime, date, time, timedelta, timezone
from typing import Optional, List
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user, RoleChecker
from app.core.utils import (
    calculate_haversine_distance, is_wfh_active, log_audit, get_day_status_for_employee, get_safe_timezone,
    validate_image_bytes
)
from app.models.models import User, Attendance, BreakSession, OfficeSetting, Holiday, AttendanceCorrectionRequest
from app.schemas.schemas import AttendanceOut, ClockInRequest, AttendanceCorrectionCreate, AttendanceCorrectionReview, AttendanceCorrectionOut
from app.core.config import settings as app_settings

router = APIRouter(prefix="/attendance", tags=["Attendance Management"])

admin_required = RoleChecker(["Admin"])

@router.get("/today", response_model=Optional[AttendanceOut])
def get_today_attendance(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    today = date.today()
    attendance = db.query(Attendance).filter(
        Attendance.user_id == current_user.id,
        Attendance.date == today
    ).first()
    return attendance

@router.get("/history", response_model=List[AttendanceOut])
def get_attendance_history(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    user_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Attendance)

    if current_user.role == "Employee":
        query = query.filter(Attendance.user_id == current_user.id)
    else:
        if user_id:
            try:
                target_uuid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
                query = query.filter(Attendance.user_id == target_uuid)
            except (ValueError, TypeError):
                pass

    if start_date:
        query = query.filter(Attendance.date >= start_date)
    if end_date:
        query = query.filter(Attendance.date <= end_date)
    if status_filter:
        query = query.filter(Attendance.status == status_filter)

    return query.order_by(Attendance.date.desc(), Attendance.clock_in.desc()).all()

@router.post("/clock-in", response_model=AttendanceOut)
def clock_in(
    request: Request,
    payload: ClockInRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    today = date.today()
    now_utc = datetime.now(timezone.utc)

    # Prevent duplicate clock-in
    existing = db.query(Attendance).filter(
        Attendance.user_id == current_user.id,
        Attendance.date == today
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You have already clocked in for today"
        )

    # Fetch Office Settings
    settings = db.query(OfficeSetting).first()
    if not settings:
        settings = OfficeSetting()
        db.add(settings)
        db.commit()
        db.refresh(settings)

    # Enforce Selfie check for Employees
    if current_user.role == "Employee" and not payload.selfie_base64:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Selfie verification is required to clock in."
        )

    # Save Selfie image
    selfie_url = None
    if payload.selfie_base64:
        try:
            base64_data = payload.selfie_base64
            if "," in base64_data:
                _, base64_data = base64_data.split(",", 1)
            image_bytes = base64.b64decode(base64_data)

            if len(image_bytes) > app_settings.MAX_UPLOAD_SIZE_BYTES:
                raise HTTPException(status_code=400, detail="Selfie image exceeds maximum allowed size (5MB)")

            try:
                validate_image_bytes(image_bytes)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=f"Invalid selfie image: {e}")

            selfies_dir = os.path.join(app_settings.UPLOAD_DIR, "selfies")
            os.makedirs(selfies_dir, exist_ok=True)
            
            filename = f"{current_user.id}_{today}_{uuid.uuid4().hex[:8]}.jpg"
            filepath = os.path.join(selfies_dir, filename)
            
            with open(filepath, "wb") as f:
                f.write(image_bytes)
            
            selfie_url = f"/api/static/selfies/{filename}"
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to process selfie image verification: {str(e)}"
            )

    # Determine WFH status
    profile = current_user.profile
    wfh_active = is_wfh_active(profile, today)

    # Verify GPS location if WFH is not active
    if not wfh_active:
        distance = calculate_haversine_distance(
            payload.latitude,
            payload.longitude,
            settings.latitude,
            settings.longitude
        )
        if distance > settings.allowed_radius:
            log_audit(db, current_user.id, "CLOCK_IN_FAILED_OUTSIDE_RADIUS", request.client.host if request.client else None, f"Distance: {distance:.2f}m")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"You are outside office location. Distance: {distance:.1f} meters."
            )

    # Suspicious check (e.g. low GPS accuracy > 200m)
    is_suspicious = bool(payload.gps_accuracy and payload.gps_accuracy > 200.0)

    # Calculate late minutes based on local time of the office timezone
    office_tz = get_safe_timezone(settings.timezone)
    local_now = datetime.now(office_tz)
    office_start_dt = datetime.combine(today, settings.office_start_time).replace(tzinfo=office_tz)
    
    late_minutes = 0
    if local_now > office_start_dt:
        late_diff = local_now - office_start_dt
        late_minutes = int(late_diff.total_seconds() / 60)

    # Set status
    if wfh_active:
        status_str = "Work From Home"
    elif late_minutes > 15:  # 15 minutes grace period
        status_str = "Late"
    else:
        status_str = "Present"

    new_attendance = Attendance(
        user_id=current_user.id,
        date=today,
        clock_in=now_utc,
        status=status_str,
        is_wfh=wfh_active,
        late_minutes=late_minutes,
        selfie_url=selfie_url,
        latitude=payload.latitude,
        longitude=payload.longitude,
        gps_accuracy=payload.gps_accuracy,
        device_info=payload.device_info,
        is_suspicious=is_suspicious
    )
    
    db.add(new_attendance)
    db.commit()
    db.refresh(new_attendance)

    log_audit(db, current_user.id, "CLOCK_IN_SUCCESS", request.client.host if request.client else None, f"Status: {status_str}, Late: {late_minutes} min")
    return new_attendance

@router.post("/clock-out", response_model=AttendanceOut)
def clock_out(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    today = date.today()
    now_utc = datetime.now(timezone.utc)

    attendance = db.query(Attendance).filter(
        Attendance.user_id == current_user.id,
        Attendance.date == today
    ).first()

    if not attendance:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must clock in first before clocking out"
        )

    if attendance.clock_out:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You have already clocked out for today"
        )

    # Close any open break session
    open_break = db.query(BreakSession).filter(
        BreakSession.attendance_id == attendance.id,
        BreakSession.end_time == None
    ).first()
    if open_break:
        open_break.end_time = now_utc
        start_tz = open_break.start_time if open_break.start_time.tzinfo else open_break.start_time.replace(tzinfo=timezone.utc)
        open_break.duration = (now_utc - start_tz).total_seconds() / 60.0

    attendance.clock_out = now_utc

    settings = db.query(OfficeSetting).first()
    if not settings:
        settings = OfficeSetting()

    # Calculate total duration in hours
    clock_in_tz = attendance.clock_in if attendance.clock_in.tzinfo else attendance.clock_in.replace(tzinfo=timezone.utc)
    total_seconds = (now_utc - clock_in_tz).total_seconds()
    total_hours = max(0.0, total_seconds / 3600.0)

    # Calculate breaks
    db.commit()
    break_sessions = db.query(BreakSession).filter(BreakSession.attendance_id == attendance.id).all()
    total_break_minutes = sum(b.duration for b in break_sessions if b.duration)
    attendance.break_duration = total_break_minutes / 60.0

    # Net working hours
    attendance.working_hours = max(0.0, total_hours - attendance.break_duration)

    # Early leaving calculation
    office_tz = get_safe_timezone(settings.timezone)
    local_now = datetime.now(office_tz)
    office_end_dt = datetime.combine(today, settings.office_end_time).replace(tzinfo=office_tz)
    early_leaving_minutes = 0
    if local_now < office_end_dt:
        early_diff = office_end_dt - local_now
        early_leaving_minutes = int(early_diff.total_seconds() / 60)
    attendance.early_leaving_minutes = early_leaving_minutes

    # Overtime calculation
    overtime_minutes = 0
    net_working_minutes = attendance.working_hours * 60.0
    required_minutes = settings.required_working_hours * 60.0
    if net_working_minutes > required_minutes:
        overtime_minutes = int(net_working_minutes - required_minutes)
    attendance.overtime_minutes = overtime_minutes

    # Recalculate status if working hours indicate a Half Day
    if attendance.working_hours < (settings.required_working_hours / 2.0):
        attendance.status = "Half Day"

    db.commit()
    db.refresh(attendance)

    log_audit(db, current_user.id, "CLOCK_OUT_SUCCESS", request.client.host if request.client else None, f"Hours: {attendance.working_hours:.2f}, OT: {overtime_minutes} min")
    return attendance

@router.post("/break/start")
def start_break(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    today = date.today()
    now_utc = datetime.now(timezone.utc)

    attendance = db.query(Attendance).filter(
        Attendance.user_id == current_user.id,
        Attendance.date == today
    ).first()

    if not attendance:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must clock in first before starting a break"
        )
        
    if attendance.clock_out:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot start break after clocking out"
        )

    active_break = db.query(BreakSession).filter(
        BreakSession.attendance_id == attendance.id,
        BreakSession.end_time == None
    ).first()
    
    if active_break:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You are already on a break"
        )

    new_break = BreakSession(
        attendance_id=attendance.id,
        start_time=now_utc
    )
    db.add(new_break)
    db.commit()
    
    log_audit(db, current_user.id, "BREAK_START", request.client.host if request.client else None)
    return {"message": "Break started successfully", "start_time": now_utc}

@router.post("/break/end")
def end_break(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    today = date.today()
    now_utc = datetime.now(timezone.utc)

    attendance = db.query(Attendance).filter(
        Attendance.user_id == current_user.id,
        Attendance.date == today
    ).first()

    if not attendance:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Attendance record not found for today"
        )

    active_break = db.query(BreakSession).filter(
        BreakSession.attendance_id == attendance.id,
        BreakSession.end_time == None
    ).first()

    if not active_break:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You are not on a break currently"
        )

    start_tz = active_break.start_time if active_break.start_time.tzinfo else active_break.start_time.replace(tzinfo=timezone.utc)
    active_break.end_time = now_utc
    active_break.duration = (now_utc - start_tz).total_seconds() / 60.0
    db.commit()

    # Recalculate break duration on main attendance
    break_sessions = db.query(BreakSession).filter(BreakSession.attendance_id == attendance.id).all()
    total_break_minutes = sum(b.duration for b in break_sessions if b.duration)
    attendance.break_duration = total_break_minutes / 60.0
    db.commit()

    log_audit(db, current_user.id, "BREAK_END", request.client.host if request.client else None, f"Duration: {active_break.duration:.1f} min")
    return {"message": "Break ended successfully", "duration_minutes": active_break.duration}

@router.post("/corrections", response_model=AttendanceCorrectionOut)
def create_correction_request(
    payload: AttendanceCorrectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    existing = db.query(AttendanceCorrectionRequest).filter(
        AttendanceCorrectionRequest.user_id == current_user.id,
        AttendanceCorrectionRequest.date == payload.date,
        AttendanceCorrectionRequest.status == "Pending"
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"You already have a pending correction request for {payload.date}."
        )
    
    new_request = AttendanceCorrectionRequest(
        user_id=current_user.id,
        date=payload.date,
        proposed_clock_in=payload.proposed_clock_in,
        proposed_clock_out=payload.proposed_clock_out,
        reason=payload.reason,
        status="Pending"
    )
    db.add(new_request)
    db.commit()
    db.refresh(new_request)
    return new_request

@router.get("/corrections", response_model=List[AttendanceCorrectionOut])
def get_correction_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role == "Admin":
        return db.query(AttendanceCorrectionRequest).order_by(AttendanceCorrectionRequest.created_at.desc()).all()
    else:
        return db.query(AttendanceCorrectionRequest).filter(
            AttendanceCorrectionRequest.user_id == current_user.id
        ).order_by(AttendanceCorrectionRequest.created_at.desc()).all()

@router.patch("/corrections/{id}/review", response_model=AttendanceCorrectionOut)
def review_correction_request(
    id: str,
    payload: AttendanceCorrectionReview,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _admin_only = Depends(admin_required)
):
    import uuid as py_uuid
    try:
        corr_uuid = py_uuid.UUID(id) if isinstance(id, str) else id
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid correction request ID format")

    corr = db.query(AttendanceCorrectionRequest).filter(AttendanceCorrectionRequest.id == corr_uuid).first()
    if not corr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Correction request not found."
        )
    
    if corr.status != "Pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Request is already {corr.status}."
        )
    
    corr.status = payload.status
    corr.comment = payload.comment
    
    if payload.status == "Approved":
        attendance = db.query(Attendance).filter(
            Attendance.user_id == corr.user_id,
            Attendance.date == corr.date
        ).first()
        
        settings = db.query(OfficeSetting).first()
        if not settings:
            settings = OfficeSetting()
            db.add(settings)
            db.commit()
            db.refresh(settings)
            
        wfh_active = is_wfh_active(corr.user.profile if corr.user else None, corr.date)
        
        c_in = corr.proposed_clock_in if corr.proposed_clock_in else (attendance.clock_in if attendance else datetime.combine(corr.date, settings.office_start_time).replace(tzinfo=timezone.utc))
        c_out = corr.proposed_clock_out if corr.proposed_clock_out else (attendance.clock_out if attendance else datetime.combine(corr.date, settings.office_end_time).replace(tzinfo=timezone.utc))
        
        total_hours = 0.0
        if c_in and c_out:
            c_in_t = c_in if c_in.tzinfo else c_in.replace(tzinfo=timezone.utc)
            c_out_t = c_out if c_out.tzinfo else c_out.replace(tzinfo=timezone.utc)
            total_hours = max(0.0, (c_out_t - c_in_t).total_seconds() / 3600.0)
            
        break_dur = attendance.break_duration if attendance else settings.lunch_break_hours
        working_hours = max(0.0, total_hours - break_dur)
        
        office_tz = get_safe_timezone(settings.timezone)
        
        c_in_local = c_in.astimezone(office_tz) if c_in.tzinfo else c_in.replace(tzinfo=timezone.utc).astimezone(office_tz)
        office_start_dt = datetime.combine(corr.date, settings.office_start_time).replace(tzinfo=office_tz)
        
        late_minutes = 0
        if c_in_local > office_start_dt:
            late_diff = c_in_local - office_start_dt
            late_minutes = int(late_diff.total_seconds() / 60)
            
        c_out_local = c_out.astimezone(office_tz) if c_out.tzinfo else c_out.replace(tzinfo=timezone.utc).astimezone(office_tz)
        office_end_dt = datetime.combine(corr.date, settings.office_end_time).replace(tzinfo=office_tz)
        early_leaving_minutes = 0
        if c_out_local < office_end_dt:
            early_diff = office_end_dt - c_out_local
            early_leaving_minutes = int(early_diff.total_seconds() / 60)
            
        overtime_minutes = 0
        required_minutes = settings.required_working_hours * 60.0
        if (working_hours * 60.0) > required_minutes:
            overtime_minutes = int((working_hours * 60.0) - required_minutes)
            
        if wfh_active:
            status_str = "Work From Home"
        elif working_hours < (settings.required_working_hours / 2.0):
            status_str = "Half Day"
        elif late_minutes > 15:
            status_str = "Late"
        else:
            status_str = "Present"
            
        if not attendance:
            attendance = Attendance(
                user_id=corr.user_id,
                date=corr.date,
                clock_in=c_in,
                clock_out=c_out,
                working_hours=working_hours,
                break_duration=break_dur,
                status=status_str,
                is_wfh=wfh_active,
                late_minutes=late_minutes,
                early_leaving_minutes=early_leaving_minutes,
                overtime_minutes=overtime_minutes,
                modified_by_admin=True,
                modification_reason=corr.reason
            )
            db.add(attendance)
        else:
            attendance.clock_in = c_in
            attendance.clock_out = c_out
            attendance.working_hours = working_hours
            attendance.break_duration = break_dur
            attendance.status = status_str
            attendance.is_wfh = wfh_active
            attendance.late_minutes = late_minutes
            attendance.early_leaving_minutes = early_leaving_minutes
            attendance.overtime_minutes = overtime_minutes
            attendance.modified_by_admin = True
            attendance.modification_reason = corr.reason
            
    db.commit()
    db.refresh(corr)
    
    log_action = "CORRECTION_APPROVED" if payload.status == "Approved" else "CORRECTION_REJECTED"
    log_audit(db, current_user.id, log_action, request.client.host if request.client else None, f"Request ID: {corr.id}, Employee ID: {corr.user_id}")
    return corr

