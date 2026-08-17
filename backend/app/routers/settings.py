from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user, RoleChecker
from app.core.utils import log_audit
from app.models.models import User, OfficeSetting, Holiday
from app.schemas.schemas import OfficeSettingOut, OfficeSettingUpdate, HolidayOut, HolidayCreate, MessageResponse

router = APIRouter(prefix="/settings", tags=["Office Settings & Holidays"])

admin_required = RoleChecker(["Admin"])

# --- Office Settings Endpoints ---

@router.get("/office", response_model=OfficeSettingOut)
def get_office_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    settings = db.query(OfficeSetting).first()
    if not settings:
        settings = OfficeSetting()
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings

@router.put("/office", response_model=OfficeSettingOut)
def update_office_settings(
    request: Request,
    payload: OfficeSettingUpdate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(admin_required)
):
    settings = db.query(OfficeSetting).first()
    if not settings:
        settings = OfficeSetting()
        db.add(settings)

    update_dict = payload.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(settings, key, value)
        
    db.commit()
    db.refresh(settings)
    
    log_audit(db, admin_user.id, "OFFICE_SETTINGS_UPDATED", request.client.host if request.client else None)
    return settings

# --- Holiday List Endpoints ---

@router.get("/holidays", response_model=List[HolidayOut])
def get_holidays(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return db.query(Holiday).order_by(Holiday.date.asc()).all()

@router.post("/holidays", response_model=HolidayOut)
def create_holiday(
    request: Request,
    payload: HolidayCreate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(admin_required)
):
    existing = db.query(Holiday).filter(Holiday.date == payload.date).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Holiday already configured for date: {payload.date}"
        )

    new_holiday = Holiday(
        name=payload.name,
        date=payload.date,
        description=payload.description
    )
    db.add(new_holiday)
    db.commit()
    db.refresh(new_holiday)
    
    log_audit(db, admin_user.id, "HOLIDAY_CREATED", request.client.host if request.client else None, f"Holiday: {payload.name} on {payload.date}")
    return new_holiday

@router.delete("/holidays/{holiday_id}", response_model=MessageResponse)
def delete_holiday(
    holiday_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin_user: User = Depends(admin_required)
):
    holiday = db.query(Holiday).filter(Holiday.id == holiday_id).first()
    if not holiday:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Holiday not found"
        )
        
    db.delete(holiday)
    db.commit()
    log_audit(db, admin_user.id, "HOLIDAY_DELETED", request.client.host if request.client else None, f"Holiday ID: {holiday_id}")
    return {"message": "Holiday deleted successfully"}

