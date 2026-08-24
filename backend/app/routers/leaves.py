import uuid
from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user, RoleChecker
from app.core.utils import log_audit, send_email_background
from app.models.models import User, LeaveRequest, EmployeeProfile
from app.schemas.schemas import LeaveRequestOut, LeaveRequestCreate, LeaveRequestReview

router = APIRouter(prefix="/leaves", tags=["Leave Management"])

admin_required = RoleChecker(["Admin"])

@router.get("", response_model=List[LeaveRequestOut])
@router.get("/", response_model=List[LeaveRequestOut], include_in_schema=False)
def get_leaves(
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(LeaveRequest).filter(LeaveRequest.organization_id == current_user.organization_id)
    
    if current_user.role == "Employee":
        query = query.filter(LeaveRequest.user_id == current_user.id)
    else:
        if status_filter:
            query = query.filter(LeaveRequest.status == status_filter)
            
    return query.order_by(LeaveRequest.created_at.desc()).all()

@router.post("", response_model=LeaveRequestOut)
@router.post("/", response_model=LeaveRequestOut, include_in_schema=False)
def apply_leave(
    request: Request,
    leave_data: LeaveRequestCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if leave_data.start_date < date.today():
        raise HTTPException(
            status_code=400,
            detail="Start date cannot be in the past"
        )
        
    if leave_data.end_date < leave_data.start_date:
        raise HTTPException(
            status_code=400,
            detail="End date must be on or after start date"
        )

    leave_days = (leave_data.end_date - leave_data.start_date).days + 1

    profile = current_user.profile
    if not profile:
        raise HTTPException(status_code=404, detail="Employee profile not found")

    # Double-spend validation: account for existing Pending leave requests of the same type
    pending_leaves = db.query(LeaveRequest).filter(
        LeaveRequest.organization_id == current_user.organization_id,
        LeaveRequest.user_id == current_user.id,
        LeaveRequest.status == "Pending",
        LeaveRequest.leave_type == leave_data.leave_type
    ).all()
    pending_days = sum((req.end_date - req.start_date).days + 1 for req in pending_leaves)
    total_requested_days = leave_days + pending_days

    if leave_data.leave_type == "Casual" and profile.leave_balance_casual < total_requested_days:
        raise HTTPException(status_code=400, detail=f"Insufficient Casual Leave balance. Requested: {leave_days} days, Pending: {pending_days} days, Available: {profile.leave_balance_casual} days.")
    elif leave_data.leave_type == "Sick" and profile.leave_balance_sick < total_requested_days:
        raise HTTPException(status_code=400, detail=f"Insufficient Sick Leave balance. Requested: {leave_days} days, Pending: {pending_days} days, Available: {profile.leave_balance_sick} days.")
    elif leave_data.leave_type == "Paid" and profile.leave_balance_paid < total_requested_days:
        raise HTTPException(status_code=400, detail=f"Insufficient Paid Leave balance. Requested: {leave_days} days, Pending: {pending_days} days, Available: {profile.leave_balance_paid} days.")

    # Check for overlapping leave requests
    overlapping = db.query(LeaveRequest).filter(
        LeaveRequest.organization_id == current_user.organization_id,
        LeaveRequest.user_id == current_user.id,
        LeaveRequest.status.in_(["Pending", "Approved"]),
        LeaveRequest.start_date <= leave_data.end_date,
        LeaveRequest.end_date >= leave_data.start_date
    ).first()
    
    if overlapping:
        raise HTTPException(status_code=400, detail="You already have a pending or approved leave request for these dates")

    new_leave = LeaveRequest(
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        leave_type=leave_data.leave_type,
        start_date=leave_data.start_date,
        end_date=leave_data.end_date,
        reason=leave_data.reason,
        status="Pending"
    )
    
    db.add(new_leave)
    db.commit()
    db.refresh(new_leave)

    log_audit(db, current_user.id, "LEAVE_APPLIED", request.client.host if request.client else None, f"Type: {leave_data.leave_type}, Days: {leave_days}", organization_id=current_user.organization_id)

    # Send email notification to Organization Admins in background
    admins = db.query(User).filter(
        User.organization_id == current_user.organization_id,
        User.role == "Admin"
    ).all()
    emp_name = f"{profile.first_name} {profile.last_name}" if profile else current_user.email
    org_name = current_user.organization.name if current_user.organization else "AuraWork"
    subject = f"{org_name} - Leave Application Submitted ({emp_name})"
    body = (
        f"Hello Admin,\n\n"
        f"Employee {emp_name} has applied for a {leave_data.leave_type} Leave.\n"
        f"Duration: {leave_data.start_date} to {leave_data.end_date}\n"
        f"Reason: {leave_data.reason}\n\n"
        f"Please log in to the {org_name} Admin Portal to review this request.\n\n"
        f"Regards,\n"
        f"{org_name} Notification System"
    )
    for admin in admins:
        send_email_background(background_tasks, subject, admin.email, body)

    return new_leave

@router.patch("/{leave_id}/review", response_model=LeaveRequestOut)
def review_leave(
    leave_id: str,
    request: Request,
    review_data: LeaveRequestReview,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin_user: User = Depends(admin_required)
):
    try:
        uuid_leave_id = uuid.UUID(leave_id) if isinstance(leave_id, str) else leave_id
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid leave ID format")

    leave = db.query(LeaveRequest).filter(
        LeaveRequest.id == uuid_leave_id,
        LeaveRequest.organization_id == admin_user.organization_id
    ).first()
    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")

    if leave.status != "Pending":
        raise HTTPException(status_code=400, detail=f"Leave request is already {leave.status}")

    # If approved, deduct from balances
    if review_data.status == "Approved":
        profile = db.query(EmployeeProfile).filter(
            EmployeeProfile.user_id == leave.user_id,
            EmployeeProfile.organization_id == admin_user.organization_id
        ).first()
        if profile:
            leave_days = (leave.end_date - leave.start_date).days + 1
            if leave.leave_type == "Casual":
                if profile.leave_balance_casual < leave_days:
                    raise HTTPException(status_code=400, detail=f"Cannot approve leave. Insufficient Casual Leave balance (Requested: {leave_days}, Available: {profile.leave_balance_casual})")
                profile.leave_balance_casual -= leave_days
            elif leave.leave_type == "Sick":
                if profile.leave_balance_sick < leave_days:
                    raise HTTPException(status_code=400, detail=f"Cannot approve leave. Insufficient Sick Leave balance (Requested: {leave_days}, Available: {profile.leave_balance_sick})")
                profile.leave_balance_sick -= leave_days
            elif leave.leave_type == "Paid":
                if profile.leave_balance_paid < leave_days:
                    raise HTTPException(status_code=400, detail=f"Cannot approve leave. Insufficient Paid Leave balance (Requested: {leave_days}, Available: {profile.leave_balance_paid})")
                profile.leave_balance_paid -= leave_days

    leave.status = review_data.status
    leave.comment = review_data.comment
    leave.approved_by = admin_user.id
                
    db.commit()
    db.refresh(leave)

    action = "LEAVE_APPROVED" if review_data.status == "Approved" else "LEAVE_REJECTED"
    log_audit(db, admin_user.id, action, request.client.host if request.client else None, f"Leave ID: {leave_id}, User: {leave.user_id}", organization_id=admin_user.organization_id)

    # Send email notification to Employee in background
    employee = db.query(User).filter(
        User.id == leave.user_id,
        User.organization_id == admin_user.organization_id
    ).first()
    if employee:
        emp_name = f"{employee.profile.first_name} {employee.profile.last_name}" if employee.profile else employee.email
        org_name = admin_user.organization.name if admin_user.organization else "AuraWork"
        subject = f"{org_name} - Leave Request Updated ({review_data.status})"
        body = (
            f"Hello {emp_name},\n\n"
            f"Your leave request has been reviewed by your administrator.\n\n"
            f"Leave Details:\n"
            f"Type: {leave.leave_type}\n"
            f"Duration: {leave.start_date} to {leave.end_date}\n"
            f"Status: {review_data.status}\n"
            f"Comments: {review_data.comment or 'None'}\n\n"
            f"Regards,\n"
            f"{org_name} Notification System"
        )
        send_email_background(background_tasks, subject, employee.email, body)
    
    return leave
