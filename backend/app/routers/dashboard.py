from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, case
from sqlalchemy.orm import Session, joinedload
from app.core.database import get_db
from app.core.security import get_current_user, RoleChecker
from app.core.utils import get_safe_timezone
from app.models.models import User, Attendance, LeaveRequest, OfficeSetting, AttendanceCorrectionRequest, BreakSession

router = APIRouter(prefix="/dashboard", tags=["Dashboard Analytics"])

# Statuses that count as the employee having shown up for the day.
PRESENT_STATUSES = ["Present", "Late", "Half Day", "Work From Home"]

@router.get("/admin")
def get_admin_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker(["Admin"]))
):
    today = date.today()
    org_id = current_user.organization_id
    
    # 1. Total active employees in this organization
    total_employees = db.query(User).filter(
        User.organization_id == org_id,
        User.role == "Employee",
        User.is_active == True
    ).count()
    
    # Today's attendance records in this organization
    today_attendances = db.query(Attendance).options(
        joinedload(Attendance.user).joinedload(User.profile)
    ).filter(
        Attendance.organization_id == org_id,
        Attendance.date == today
    ).all()
    
    present_today = 0
    late_today = 0
    wfh_today = 0
    working_today = 0
    half_day_today = 0
    
    for att in today_attendances:
        if att.status in PRESENT_STATUSES:
            present_today += 1
        if att.status == "Late":
            late_today += 1
        if att.is_wfh or att.status == "Work From Home":
            wfh_today += 1
        if att.clock_in and not att.clock_out:
            working_today += 1
        if att.status == "Half Day":
            half_day_today += 1
            
    # Today's Leaves in this organization
    on_leave_today = db.query(LeaveRequest).filter(
        LeaveRequest.organization_id == org_id,
        LeaveRequest.status == "Approved",
        LeaveRequest.start_date <= today,
        LeaveRequest.end_date >= today
    ).count()

    absent_today = max(0, total_employees - present_today - on_leave_today)
    
    # Average Working Hours (This Month) in this organization
    start_of_month = today.replace(day=1)
    avg_working_hours_query = db.query(func.avg(Attendance.working_hours)).filter(
        Attendance.organization_id == org_id,
        Attendance.date >= start_of_month,
        Attendance.date <= today,
        Attendance.working_hours > 0
    ).scalar()
    avg_working_hours = round(float(avg_working_hours_query), 2) if avg_working_hours_query else 0.0

    # Monthly Attendance Percentage in this organization
    # Both figures come off the same rows, so count them in one pass rather
    # than scanning the month twice.
    total_attendance_records, present_records = db.query(
        func.count(Attendance.id),
        func.count(case((Attendance.status.in_(PRESENT_STATUSES), 1))),
    ).filter(
        Attendance.organization_id == org_id,
        Attendance.date >= start_of_month,
        Attendance.date <= today
    ).one()
    
    attendance_percentage = 0.0
    if total_attendance_records > 0:
        attendance_percentage = round((present_records / total_attendance_records) * 100, 1)

    # 2. Daily Attendance Graph (Last 7 days) in this organization
    seven_days_ago = today - timedelta(days=6)
    last_7_records = db.query(Attendance.date, Attendance.status, Attendance.is_wfh).filter(
        Attendance.organization_id == org_id,
        Attendance.date >= seven_days_ago,
        Attendance.date <= today
    ).all()

    daily_graph = []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        day_str = d.strftime("%a")
        
        day_recs = [r for r in last_7_records if r[0] == d]
        p_count = sum(1 for r in day_recs if r[1] in PRESENT_STATUSES)
        l_count = sum(1 for r in day_recs if r[1] == "Late")
        w_count = sum(1 for r in day_recs if r[2] or r[1] == "Work From Home")
        
        daily_graph.append({
            "date": d.isoformat(),
            "day": day_str,
            "present": p_count,
            "late": l_count,
            "wfh": w_count
        })

    # 3. Monthly Attendance Graph (Last 6 Months) in this organization
    #
    # The six buckets are stepped back a month at a time. Subtracting 30 days
    # per step (as this did before) skips a month whenever a 31-day month is
    # crossed - from 1 March, minus 30 days lands on 30 January, so February
    # never appeared and January was counted twice.
    month_starts = []
    cursor_month = today.replace(day=1)
    for _ in range(6):
        month_starts.append(cursor_month)
        cursor_month = (cursor_month - timedelta(days=1)).replace(day=1)
    month_starts.reverse()

    # One scan of the six-month window replaces the six separate COUNT queries
    # this used to run. Bucketing happens in Python so no dialect-specific
    # date_trunc/strftime is needed.
    month_counts: dict = {}
    present_month_rows = db.query(Attendance.date).filter(
        Attendance.organization_id == org_id,
        Attendance.date >= month_starts[0],
        Attendance.date <= today,
        Attendance.status.in_(PRESENT_STATUSES)
    ).all()
    for (rec_date,) in present_month_rows:
        key = (rec_date.year, rec_date.month)
        month_counts[key] = month_counts.get(key, 0) + 1

    monthly_graph = [
        {
            "month": month_start.strftime("%b %Y"),
            "present": month_counts.get((month_start.year, month_start.month), 0)
        }
        for month_start in month_starts
    ]

    # 4. Action Center (Needs Attention) in this organization
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
    missing_clockouts = db.query(Attendance).options(
        joinedload(Attendance.user).joinedload(User.profile)
    ).filter(
        Attendance.organization_id == org_id,
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

    # C. Pending leave requests in this organization
    pending_leave_requests = db.query(LeaveRequest).options(
        joinedload(LeaveRequest.user).joinedload(User.profile)
    ).filter(
        LeaveRequest.organization_id == org_id,
        LeaveRequest.status == "Pending"
    ).all()
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

    # D. Pending corrections in this organization
    pending_corrs = db.query(AttendanceCorrectionRequest).options(
        joinedload(AttendanceCorrectionRequest.user).joinedload(User.profile)
    ).filter(
        AttendanceCorrectionRequest.organization_id == org_id,
        AttendanceCorrectionRequest.status == "Pending"
    ).all()
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

    # 5. Currently Working List in this organization
    currently_working = []
    working_records = [att for att in today_attendances if att.clock_in is not None and att.clock_out is None]
    
    settings = db.query(OfficeSetting).filter(OfficeSetting.organization_id == org_id).first()
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
        Attendance.organization_id == current_user.organization_id,
        Attendance.user_id == current_user.id,
        Attendance.date == today
    ).first()

    # Attendance percentage and average hours all derive from this employee's
    # rows for the current month, so gather them in a single pass instead of
    # three separate scans of the same range.
    start_of_month = today.replace(day=1)
    total_possible_days, present_days, avg_working = db.query(
        func.count(Attendance.id),
        func.count(case((Attendance.status.in_(PRESENT_STATUSES), 1))),
        func.avg(case((Attendance.working_hours > 0, Attendance.working_hours))),
    ).filter(
        Attendance.organization_id == current_user.organization_id,
        Attendance.user_id == current_user.id,
        Attendance.date >= start_of_month,
        Attendance.date <= today
    ).one()

    attendance_percentage = 100.0
    if total_possible_days > 0:
        attendance_percentage = round((present_days / total_possible_days) * 100, 1)

    avg_hours = round(float(avg_working), 2) if avg_working else 0.0

    is_on_break = False
    if today_attendance:
        is_on_break = db.query(
            db.query(BreakSession).filter(
                BreakSession.attendance_id == today_attendance.id,
                BreakSession.end_time == None
            ).exists()
        ).scalar()

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
