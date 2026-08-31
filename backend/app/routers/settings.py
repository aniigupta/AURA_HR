import os
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user, RoleChecker
from app.core.utils import log_audit, validate_image_bytes
from app.models.models import User, OfficeSetting, Holiday, Organization
from app.schemas.schemas import (
    OfficeSettingOut, OfficeSettingUpdate, HolidayOut, HolidayCreate, MessageResponse,
    OrganizationOut, OrganizationUpdate
)

router = APIRouter(prefix="/settings", tags=["Office Settings & Holidays"])

admin_required = RoleChecker(["Admin"])

# --- Organization Settings Endpoints ---

@router.get("/organization", response_model=OrganizationOut)
def get_organization_details(
    db: Session = Depends(get_db),
    admin_user: User = Depends(admin_required)
):
    org = db.query(Organization).filter(Organization.id == admin_user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org

@router.put("/organization", response_model=OrganizationOut)
def update_organization_details(
    request: Request,
    payload: OrganizationUpdate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(admin_required)
):
    org = db.query(Organization).filter(Organization.id == admin_user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    update_dict = payload.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(org, key, value)
        
    db.commit()
    db.refresh(org)
    
    log_audit(db, admin_user.id, "ORGANIZATION_UPDATED", request.client.host if request.client else None, f"Org ID: {org.id}", organization_id=org.id)
    return org

@router.post("/organization/logo")
def upload_organization_logo(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin_user: User = Depends(admin_required)
):
    org = db.query(Organization).filter(Organization.id == admin_user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    file_ext = os.path.splitext(file.filename or "")[1].lower()
    if file_ext not in settings.ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only JPG, JPEG, PNG, and WebP files are allowed")

    if file.content_type not in settings.ALLOWED_UPLOAD_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Invalid image content type")

    contents = file.file.read()
    if len(contents) > settings.MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File size exceeds the 5 MB limit")

    try:
        validate_image_bytes(contents)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    unique_filename = f"org_{org.id}_{uuid.uuid4().hex}{file_ext}"

    if settings.S3_ACCESS_KEY:
        import boto3
        from botocore.exceptions import ClientError
        import io

        s3_kwargs = {
            "aws_access_key_id": settings.S3_ACCESS_KEY,
            "aws_secret_access_key": settings.S3_SECRET_KEY,
            "region_name": settings.S3_REGION,
        }
        if settings.S3_ENDPOINT:
            s3_kwargs["endpoint_url"] = settings.S3_ENDPOINT

        try:
            s3_client = boto3.client("s3", **s3_kwargs)
            s3_client.upload_fileobj(
                io.BytesIO(contents),
                settings.S3_BUCKET,
                unique_filename,
                ExtraArgs={"ContentType": file.content_type}
            )
            if settings.S3_ENDPOINT:
                image_url = f"{settings.S3_ENDPOINT}/{settings.S3_BUCKET}/{unique_filename}"
            else:
                image_url = f"https://{settings.S3_BUCKET}.s3.{settings.S3_REGION}.amazonaws.com/{unique_filename}"
        except ClientError as e:
            raise HTTPException(status_code=500, detail=f"S3 Upload failed: {str(e)}")
    else:
        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
        file_path = os.path.join(settings.UPLOAD_DIR, unique_filename)
        with open(file_path, "wb") as buffer:
            buffer.write(contents)
        image_url = f"/api/static/{unique_filename}"

    org.logo_url = image_url
    db.commit()
    db.refresh(org)

    log_audit(db, admin_user.id, "ORGANIZATION_LOGO_UPLOADED", request.client.host if request.client else None, f"Org ID: {org.id}", organization_id=org.id)
    return {"logo_url": org.logo_url}

# --- Office Settings Endpoints ---

@router.get("/office", response_model=OfficeSettingOut)
def get_office_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    settings = db.query(OfficeSetting).filter(OfficeSetting.organization_id == current_user.organization_id).first()
    if not settings:
        settings = OfficeSetting(organization_id=current_user.organization_id)
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
    settings = db.query(OfficeSetting).filter(OfficeSetting.organization_id == admin_user.organization_id).first()
    if not settings:
        settings = OfficeSetting(organization_id=admin_user.organization_id)
        db.add(settings)

    update_dict = payload.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(settings, key, value)
        
    db.commit()
    db.refresh(settings)
    
    log_audit(db, admin_user.id, "OFFICE_SETTINGS_UPDATED", request.client.host if request.client else None, organization_id=admin_user.organization_id)
    return settings

# --- Holiday List Endpoints ---

@router.get("/holidays", response_model=List[HolidayOut])
def get_holidays(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return db.query(Holiday).filter(
        Holiday.organization_id == current_user.organization_id
    ).order_by(Holiday.date.asc()).all()

@router.post("/holidays", response_model=HolidayOut)
def create_holiday(
    request: Request,
    payload: HolidayCreate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(admin_required)
):
    existing = db.query(Holiday).filter(
        Holiday.organization_id == admin_user.organization_id,
        Holiday.date == payload.date
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Holiday already configured for date: {payload.date}"
        )

    new_holiday = Holiday(
        organization_id=admin_user.organization_id,
        name=payload.name.strip(),
        date=payload.date,
        description=payload.description
    )
    db.add(new_holiday)
    db.commit()
    db.refresh(new_holiday)
    
    log_audit(db, admin_user.id, "HOLIDAY_CREATED", request.client.host if request.client else None, f"Holiday: {payload.name} on {payload.date}", organization_id=admin_user.organization_id)
    return new_holiday

@router.delete("/holidays/{holiday_id}", response_model=MessageResponse)
def delete_holiday(
    holiday_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin_user: User = Depends(admin_required)
):
    holiday = db.query(Holiday).filter(
        Holiday.id == holiday_id,
        Holiday.organization_id == admin_user.organization_id
    ).first()
    if not holiday:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Holiday not found"
        )
        
    db.delete(holiday)
    db.commit()
    log_audit(db, admin_user.id, "HOLIDAY_DELETED", request.client.host if request.client else None, f"Holiday ID: {holiday_id}", organization_id=admin_user.organization_id)
    return {"message": "Holiday deleted successfully"}
