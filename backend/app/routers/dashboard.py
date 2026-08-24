from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from app.core.database import get_db
from app.core.security import get_current_user, RoleChecker
from app.core.utils import get_safe_timezone
from app.models.models import User, Attendance, LeaveRequest, OfficeSetting, AttendanceCorrectionRequest, BreakSession

router = APIRouter(prefix="/dashboard", tags=["Dashboard Analytics"])

@router.get("/admin")
def get_admin_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker(["Admin"]))
):
    today = date.today()
    
    # 1. Total active employees
    total_employees = db.query(User).filter(User.role == "Employee", User.is_active == True).count()
    
    # Get today's attendance records with profiles joined
    today_attendances = db.query(Attendance).options(joinedload(Attendance.user).joinedload(User.profile)).filter(Attendance.date == today).all()
    
    present_today = 0
    late_today = 0
    wfh_today = 0
    working_today = 0
    half_day_today = 0
    
    for att in today_attendances:
        if att.status in ["Present", "Late", "Half Day", "Work From Home"]:
            present_today += 1
        if att.status == "Late":
            late_today += 1
        if att.is_wfh or att.status == "Work From Home":
            wfh_today += 1
        if att.clock_in and not att.clock_out:
            working_today += 1
        if att.status == "Half Day":
            half_day_today += 1
            
    # Today's Leaves
    on_leave_today = db.query(LeaveRequest).filter(
        LeaveRequest.status == "Approved",
        LeaveRequest.start_date <= today,
        LeaveRequest.end_date >= today
    ).count()

    absent_today = max(0, total_employees - present_today - on_leave_today)
    
    # Average Working Hours (This Month)
    start_of_month = today.replace(day=1)
    avg_working_hours_query = db.query(func.avg(Attendance.working_hours)).filter(
        Attendance.date >= start_of_month,
        Attendance.date <= today,
        Attendance.working_hours > 0
    ).scalar()
    avg_working_hours = round(float(avg_working_hours_query), 2) if avg_working_hours_query else 0.0

    # Monthly Attendance Percentage
    total_attendance_records = db.query(Attendance).filter(
        Attendance.date >= start_of_month,
        Attendance.date <= today
    ).count()
    
    present_records = db.query(Attendance).filter(
        Attendance.date >= start_of_month,
        Attendance.date <= today,
        Attendance.status.in_(["Present", "Late", "Half Day", "Work From Home"])
    ).count()
    
    attendance_percentage = 0.0
    if total_attendance_records > 0:
        attendance_percentage = round((present_records / total_attendance_records) * 100, 1)

    # 2. Daily Attendance Graph (Last 7 days)
    seven_days_ago = today - timedelta(days=6)
    last_7_records = db.query(Attendance.date, Attendance.status, Attendance.is_wfh).filter(
        Attendance.date >= seven_days_ago,
        Attendance.date <= today
    ).all()

    daily_graph = []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        day_str = d.strftime("%a")
        
        day_recs = [r for r in last_7_records if r[0] == d]
        p_count = sum(1 for r in day_recs if r[1] in ["Present", "Late", "Half Day", "Work From Home"])
        l_count = sum(1 for r in day_recs if r[1] == "Late")
        w_count = sum(1 for r in day_recs if r[2] or r[1] == "Work From Home")
        
        daily_graph.append({
            "date": d.isoformat(),
            "day": day_str,
            "present": p_count,
            "late": l_count,
            "wfh": w_count
        })

    # 3. Monthly Attendance Graph (Last 6 Months)
    monthly_graph = []
    for i in range(5, -1, -1):
        first_day_of_current_month = today.replace(day=1)
        target_month_date = first_day_of_current_month - timedelta(days=i*30)
        target_month_start = target_month_date.replace(day=1)
        if target_month_start.month == 12:
            target_month_end = target_month_start.replace(year=target_month_start.year + 1, month=1) - timedelta(days=1)
        else:
            target_month_end = target_month_start.replace(month=target_month_start.month + 1) - timedelta(days=1)
            
        month_label = target_month_start.strftime("%b %Y")
        
        m_present = db.query(Attendance).filter(
            Attendance.date >= target_month_start,
            Attendance.date <= target_month_end,
            Attendance.status.in_(["Present", "Late", "Half Day", "Work From Home"])
        ).count()
        
        monthly_graph.append({
            "month": month_label,
            "present": m_present
        })

    # 4. Action Center (Needs Attention)
    needs_attention = []
    
    # A. Late employees today
    late_records = [att for att in today_attendances if att.late_minutes > 0]
    for att in late_records:
        prof = att.user.profile if att.user else None
        name = f"{prof.first_name} {prof.last_name}" if prof else (att.user.email if att.user else "Unknown")
        emp_id = prof.employee_id if prof else ""
        needs_attention.append({
            "id": str(att.id),
            "employee_name": name,
            "employee_id": emp_id,
            "issue": f"Late {att.late_minutes} min",
            "type": "late",
            "details": "Clocked in late",
            "action": "View"
        })

    # B. Missing clock-outs yesterday
    yesterday = today - timedelta(days=1)
    missing_clockouts = db.query(Attendance).options(joinedload(Attendance.user).joinedload(User.profile)).filter(
        Attendance.date == yesterday,
        Attendance.clock_out == None
    ).all()
    for att in missing_clockouts:
        prof = att.user.profile if att.user else None
        name = f"{prof.first_name} {prof.last_name}" if prof else (att.user.email if att.user else "Unknown")
        emp_id = prof.employee_id if prof else ""
        in_time_disp = att.clock_in.strftime('%I:%M %p') if att.clock_in else "N/A"
        needs_attention.append({
            "id": str(att.id),
            "employee_name": name,
            "employee_id": emp_id,
            "issue": "No clock-out yesterday",
            "type": "no_clock_out",
            "details": f"Punch-in: {in_time_disp}",
            "action": "Remind"
        })

    # C. Pending leave requests
    pending_leave_requests = db.query(LeaveRequest).options(joinedload(LeaveRequest.user).joinedload(User.profile)).filter(LeaveRequest.status == "Pending").all()
    for lv in pending_leave_requests:
        prof = lv.user.profile if lv.user else None
        name = f"{prof.first_name} {prof.last_name}" if prof else (lv.user.email if lv.user else "Unknown")
        emp_id = prof.employee_id if prof else ""
        needs_attention.append({
            "id": str(lv.id),
            "employee_name": name,
            "employee_id": emp_id,
            "issue": "Leave pending",
            "type": "leave_pending",
            "details": f"{lv.leave_type} ({lv.start_date} to {lv.end_date})",
            "action": "Approve"
        })

    # D. Pending corrections
    pending_corrs = db.query(AttendanceCorrectionRequest).options(joinedload(AttendanceCorrectionRequest.user).joinedload(User.profile)).filter(AttendanceCorrectionRequest.status == "Pending").all()
    for corr in pending_corrs:
        prof = corr.user.profile if corr.user else None
        name = f"{prof.first_name} {prof.last_name}" if prof else (corr.user.email if corr.user else "Unknown")
        emp_id = prof.employee_id if prof else ""
        needs_attention.append({
            "id": str(corr.id),
            "employee_name": name,
            "employee_id": emp_id,
            "issue": "Correction pending",
            "type": "correction_pending",
            "details": f"Correction for {corr.date}",
            "action": "Review"
        })

    # 5. Currently Working List
    currently_working = []
    working_records = [att for att in today_attendances if att.clock_in is not None and att.clock_out is None]
    
    settings = db.query(OfficeSetting).first()
    timezone_str = settings.timezone if settings else "Asia/Kolkata"
    office_tz = get_safe_timezone(timezone_str)

    now_utc = datetime.now(timezone.utc)
    for att in working_records:
        prof = att.user.profile if att.user else None
        name = f"{prof.first_name} {prof.last_name}" if prof else (att.user.email if att.user else "Unknown")
        emp_id = prof.employee_id if prof else ""
        
        clock_in_tz = att.clock_in if att.clock_in.tzinfo else att.clock_in.replace(tzinfo=timezone.utc)
        elapsed_seconds = (now_utc - clock_in_tz).total_seconds()
        break_duration_seconds = att.break_duration * 3600.0
        
        working_seconds = max(0.0, elapsed_seconds - break_duration_seconds)
        h = int(working_seconds // 3600)
        m = int((working_seconds % 3600) // 60)
        duration_str = f"{h}h {m}m"
        
        clock_in_local = clock_in_tz.astimezone(office_tz)
        in_time_str = clock_in_local.strftime("%H:%M")
        
        currently_working.append({
            "employee_name": name,
            "employee_id": emp_id,
            "in_time": in_time_str,
            "duration": duration_str
        })

    return {
        "cards": {
            "total_employees": total_employees,
            "present_today": present_today,
            "absent_today": absent_today,
            "late_today": late_today,
            "working_today": working_today,
            "on_leave_today": on_leave_today,
            "wfh_today": wfh_today,
            "avg_working_hours": avg_working_hours,
            "attendance_percentage": attendance_percentage
        },
        "graphs": {
            "daily": daily_graph,
            "monthly": monthly_graph
        },
        "pending_leaves": len(pending_leave_requests),
        "needs_attention": needs_attention,
        "currently_working": currently_working
    }

@router.get("/employee")
def get_employee_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    today = date.today()
    profile = current_user.profile
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    # Today's attendance
    today_attendance = db.query(Attendance).filter(
        Attendance.user_id == current_user.id,
        Attendance.date == today
    ).first()

    # Calculate Monthly Attendance Percentage for this employee
    start_of_month = today.replace(day=1)
    total_possible_days = db.query(Attendance).filter(
        Attendance.user_id == current_user.id,
        Attendance.date >= start_of_month,
        Attendance.date <= today
    ).count()
    
    present_days = db.query(Attendance).filter(
        Attendance.user_id == current_user.id,
        Attendance.date >= start_of_month,
        Attendance.date <= today,
        Attendance.status.in_(["Present", "Late", "Half Day", "Work From Home"])
    ).count()

    attendance_percentage = 100.0
    if total_possible_days > 0:
        attendance_percentage = round((present_days / total_possible_days) * 100, 1)

    # Average working hours this month
    avg_working = db.query(func.avg(Attendance.working_hours)).filter(
        Attendance.user_id == current_user.id,
        Attendance.date >= start_of_month,
        Attendance.date <= today,
        Attendance.working_hours > 0
    ).scalar()
    avg_hours = round(float(avg_working), 2) if avg_working else 0.0

    is_on_break = False
    if today_attendance:
        is_on_break = db.query(BreakSession).filter(
            BreakSession.attendance_id == today_attendance.id,
            BreakSession.end_time == None
        ).count() > 0

    return {
        "today": {
            "clock_in": today_attendance.clock_in if today_attendance else None,
            "clock_out": today_attendance.clock_out if today_attendance else None,
            "status": today_attendance.status if today_attendance else "Absent",
            "working_hours": today_attendance.working_hours if today_attendance else 0.0,
            "break_duration": today_attendance.break_duration if today_attendance else 0.0,
            "is_on_break": is_on_break
        },
        "stats": {
            "attendance_percentage": attendance_percentage,
            "avg_working_hours": avg_hours,
            "leave_balances": {
                "casual": profile.leave_balance_casual,
                "sick": profile.leave_balance_sick,
                "paid": profile.leave_balance_paid
            }
        }
    }

