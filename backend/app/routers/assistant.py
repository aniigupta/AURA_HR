import uuid
from datetime import date
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user, RoleChecker
from app.core.utils import log_audit
from app.core.ai import generate_ai_chat_response
from app.models.models import User, CompanyPolicy, OfficeSetting, Holiday, Attendance
from app.schemas.schemas import (
    CompanyPolicyOut, CompanyPolicyCreate, CompanyPolicyUpdate,
    AIChatRequest, AIChatResponse, MessageResponse
)

router = APIRouter(prefix="/assistant", tags=["AI HR Policy Assistant"])

admin_required = RoleChecker(["Admin"])

# --- Company Policy Knowledge Base Management ---

@router.get("/policies", response_model=List[CompanyPolicyOut])
def get_company_policies(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(CompanyPolicy).filter(
        CompanyPolicy.organization_id == current_user.organization_id
    )
    if current_user.role == "Employee":
        query = query.filter(CompanyPolicy.is_published == True)
    return query.order_by(CompanyPolicy.category.asc(), CompanyPolicy.title.asc()).all()

@router.post("/policies", response_model=CompanyPolicyOut)
def create_company_policy(
    request: Request,
    payload: CompanyPolicyCreate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(admin_required)
):
    new_policy = CompanyPolicy(
        organization_id=admin_user.organization_id,
        title=payload.title.strip(),
        category=payload.category.strip(),
        content=payload.content.strip(),
        is_published=payload.is_published
    )
    db.add(new_policy)
    db.commit()
    db.refresh(new_policy)

    log_audit(db, admin_user.id, "POLICY_CREATED", request.client.host if request.client else None, f"Title: {payload.title}", organization_id=admin_user.organization_id)
    return new_policy

@router.put("/policies/{policy_id}", response_model=CompanyPolicyOut)
def update_company_policy(
    policy_id: str,
    request: Request,
    payload: CompanyPolicyUpdate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(admin_required)
):
    try:
        uuid_id = uuid.UUID(policy_id) if isinstance(policy_id, str) else policy_id
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid policy ID format")

    policy = db.query(CompanyPolicy).filter(
        CompanyPolicy.id == uuid_id,
        CompanyPolicy.organization_id == admin_user.organization_id
    ).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Company policy not found")

    update_dict = payload.model_dump(exclude_unset=True)
    for k, v in update_dict.items():
        setattr(policy, k, v.strip() if isinstance(v, str) else v)

    db.commit()
    db.refresh(policy)

    log_audit(db, admin_user.id, "POLICY_UPDATED", request.client.host if request.client else None, f"Policy ID: {policy_id}", organization_id=admin_user.organization_id)
    return policy

@router.delete("/policies/{policy_id}", response_model=MessageResponse)
def delete_company_policy(
    policy_id: str,
    request: Request,
    db: Session = Depends(get_db),
    admin_user: User = Depends(admin_required)
):
    try:
        uuid_id = uuid.UUID(policy_id) if isinstance(policy_id, str) else policy_id
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid policy ID format")

    policy = db.query(CompanyPolicy).filter(
        CompanyPolicy.id == uuid_id,
        CompanyPolicy.organization_id == admin_user.organization_id
    ).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Company policy not found")

    db.delete(policy)
    db.commit()

    log_audit(db, admin_user.id, "POLICY_DELETED", request.client.host if request.client else None, f"Policy ID: {policy_id}", organization_id=admin_user.organization_id)
    return {"message": "Policy deleted successfully"}

# --- AI Assistant Q&A Chatbot Endpoint ---

@router.post("/chat", response_model=AIChatResponse)
def chat_with_hr_assistant(
    payload: AIChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = current_user.organization_id
    company_name = current_user.organization.name if current_user.organization else "AuraWork"

    # 1. Fetch Employee Live Profile Context
    profile = current_user.profile
    dept_name = profile.department.name if profile and profile.department else "General"
    emp_name = f"{profile.first_name} {profile.last_name}".strip() if profile else current_user.email
    
    today = date.today()
    today_attendance = db.query(Attendance).filter(
        Attendance.organization_id == org_id,
        Attendance.user_id == current_user.id,
        Attendance.date == today
    ).first()
    today_status = today_attendance.status if today_attendance else "Not Clocked In"

    employee_context = {
        "name": emp_name,
        "email": current_user.email,
        "role": current_user.role,
        "department": dept_name,
        "designation": profile.designation if profile and profile.designation else "Employee",
        "leave_balance_casual": profile.leave_balance_casual if profile else 0,
        "leave_balance_sick": profile.leave_balance_sick if profile else 0,
        "leave_balance_paid": profile.leave_balance_paid if profile else 0,
        "wfh_enabled": profile.wfh_enabled if profile else False,
        "today_status": today_status
    }

    # 2. Fetch Tenant Policies (only published)
    policies_query = db.query(CompanyPolicy).filter(
        CompanyPolicy.organization_id == org_id,
        CompanyPolicy.is_published == True
    ).all()
    policies_data = [
        {"title": p.title, "category": p.category, "content": p.content}
        for p in policies_query
    ]

    # 3. Fetch Tenant Office Settings
    setting = db.query(OfficeSetting).filter(OfficeSetting.organization_id == org_id).first()
    office_settings_data = None
    if setting:
        office_settings_data = {
            "office_start_time": setting.office_start_time.strftime("%H:%M"),
            "office_end_time": setting.office_end_time.strftime("%H:%M"),
            "lunch_break_hours": setting.lunch_break_hours,
            "required_working_hours": setting.required_working_hours,
            "weekends": setting.weekends,
            "timezone": setting.timezone
        }

    # 4. Fetch Holidays
    holidays_query = db.query(Holiday).filter(
        Holiday.organization_id == org_id,
        Holiday.date >= today
    ).order_by(Holiday.date.asc()).limit(10).all()
    holidays_data = [
        {"name": h.name, "date": str(h.date), "description": h.description}
        for h in holidays_query
    ]

    # 5. Generate AI Chat Response
    chat_history_dicts = [
        {"role": m.role, "content": m.content}
        for m in (payload.history or [])
    ]

    result = generate_ai_chat_response(
        user_message=payload.message.strip(),
        company_name=company_name,
        employee_context=employee_context,
        policies=policies_data,
        office_settings=office_settings_data,
        holidays=holidays_data,
        chat_history=chat_history_dicts
    )

    return AIChatResponse(
        reply=result["reply"],
        sources=result.get("sources", [])
    )
