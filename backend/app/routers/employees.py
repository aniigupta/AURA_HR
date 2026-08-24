import os
import uuid
from datetime import date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import RoleChecker, get_password_hash, get_current_user
from app.core.utils import log_audit, validate_image_bytes
from app.models.models import User, EmployeeProfile, Department
from app.schemas.schemas import (
    UserOut, UserCreate, EmployeeProfileUpdate, DepartmentOut, DepartmentCreate, UserResetPassword, MessageResponse
)
from app.core.config import settings

router = APIRouter(prefix="/employees", tags=["Employee Management"])

admin_required = RoleChecker(["Admin"])

# Both "" and "/" are registered for the collection routes below (get/create
# employees) — see the matching comment in app/routers/leaves.py for why:
# the Next.js rewrite strips a trailing slash before proxying here, so a
# bare @router.get("/") alone would never actually match what arrives.

# --- Department Endpoints ---

@router.get("/departments", response_model=List[DepartmentOut])
def get_departments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return db.query(Department).order_by(Department.name.asc()).all()

@router.post("/departments", response_model=DepartmentOut)
def create_department(
    dept: DepartmentCreate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(admin_required)
):
    existing = db.query(Department).filter(Department.name == dept.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Department already exists")
    new_dept = Department(name=dept.name, description=dept.description)
    db.add(new_dept)
    db.commit()
    db.refresh(new_dept)
    return new_dept

# --- Employee Endpoints ---

@router.get("", response_model=List[UserOut])
@router.get("/", response_model=List[UserOut], include_in_schema=False)
def get_employees(
    search: Optional[str] = None,
    department_id: Optional[int] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Employees are not allowed to view other employee list")

    query = db.query(User).join(EmployeeProfile).filter(User.role == "Employee")
    
    if search:
        search_filter = f"%{search.strip()}%"
        query = query.filter(
            (EmployeeProfile.first_name.ilike(search_filter)) | 
            (EmployeeProfile.last_name.ilike(search_filter)) | 
            (EmployeeProfile.employee_id.ilike(search_filter)) |
            (User.email.ilike(search_filter))
        )
        
    if department_id is not None:
        query = query.filter(EmployeeProfile.department_id == department_id)
        
    if is_active is not None:
        query = query.filter(User.is_active == is_active)
        
    return query.order_by(EmployeeProfile.first_name.asc()).all()

@router.get("/{employee_id}", response_model=UserOut)
def get_employee_by_id(
    employee_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role == "Employee" and current_user.id != employee_id:
        raise HTTPException(status_code=403, detail="You can only view your own profile")
        
    user = db.query(User).filter(User.id == employee_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")
    return user

@router.post("", response_model=UserOut)
@router.post("/", response_model=UserOut, include_in_schema=False)
def create_employee(
    request: Request,
    emp_data: UserCreate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(admin_required)
):
    # Verify unique email
    existing_user = db.query(User).filter(User.email == emp_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email is already registered")

    # Verify unique employee ID
    existing_profile = db.query(EmployeeProfile).filter(EmployeeProfile.employee_id == emp_data.profile.employee_id).first()
    if existing_profile:
        raise HTTPException(status_code=400, detail="Employee ID is already registered")

    # Create User
    new_user = User(
        email=emp_data.email,
        hashed_password=get_password_hash(emp_data.password),
        role=emp_data.role,
        is_active=True
    )
    db.add(new_user)
    db.flush()

    # Create Profile
    new_profile = EmployeeProfile(
        user_id=new_user.id,
        first_name=emp_data.profile.first_name,
        last_name=emp_data.profile.last_name,
        employee_id=emp_data.profile.employee_id,
        phone=emp_data.profile.phone,
        designation=emp_data.profile.designation,
        department_id=emp_data.profile.department_id,
        join_date=emp_data.profile.join_date or date.today(),
        leave_balance_casual=emp_data.profile.leave_balance_casual or 12,
        leave_balance_sick=emp_data.profile.leave_balance_sick or 10,
        leave_balance_paid=emp_data.profile.leave_balance_paid or 15,
        hourly_rate=emp_data.profile.hourly_rate or 0.0,
        base_salary=emp_data.profile.base_salary or 0.0,
        wfh_enabled=emp_data.profile.wfh_enabled or False,
        wfh_start_date=emp_data.profile.wfh_start_date,
        wfh_end_date=emp_data.profile.wfh_end_date,
        wfh_reason=emp_data.profile.wfh_reason
    )
    db.add(new_profile)
    db.commit()
    db.refresh(new_user)
    
    log_audit(db, admin_user.id, "EMPLOYEE_CREATED", request.client.host if request.client else None, f"Email: {new_user.email}")
    return new_user

@router.put("/{employee_id}", response_model=UserOut)
def update_employee(
    employee_id: uuid.UUID,
    request: Request,
    update_data: EmployeeProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    update_dict = update_data.model_dump(exclude_unset=True)

    # Employees can only update limited fields of themselves, admin can update all
    if current_user.role == "Employee":
        if current_user.id != employee_id:
            raise HTTPException(status_code=403, detail="You cannot update other employee's profile")
        
        # Enforce that employees cannot change leave balances, WFH, employee_id, or salary rates
        restricted_fields = [
            "leave_balance_casual", "leave_balance_sick", "leave_balance_paid",
            "hourly_rate", "base_salary",
            "wfh_enabled", "wfh_start_date", "wfh_end_date", "wfh_reason",
            "employee_id", "department_id"
        ]
        for field in restricted_fields:
            update_dict.pop(field, None)

    user = db.query(User).filter(User.id == employee_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")

    profile = user.profile
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    # Update profile fields
    for field, value in update_dict.items():
        setattr(profile, field, value)

    db.commit()
    db.refresh(user)
    
    log_audit(db, current_user.id, "EMPLOYEE_UPDATED", request.client.host if request.client else None, f"User ID: {employee_id}")
    return user

@router.delete("/{employee_id}", response_model=MessageResponse)
def delete_employee(
    employee_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    admin_user: User = Depends(admin_required)
):
    user = db.query(User).filter(User.id == employee_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")
        
    db.delete(user)
    db.commit()
    log_audit(db, admin_user.id, "EMPLOYEE_DELETED", request.client.host if request.client else None, f"User ID: {employee_id}")
    return {"message": "Employee deleted successfully"}

@router.patch("/{employee_id}/toggle-status", response_model=MessageResponse)
def toggle_employee_status(
    employee_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    admin_user: User = Depends(admin_required)
):
    user = db.query(User).filter(User.id == employee_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")

    user.is_active = not user.is_active
    db.commit()
    
    action = "EMPLOYEE_ACTIVATED" if user.is_active else "EMPLOYEE_DEACTIVATED"
    log_audit(db, admin_user.id, action, request.client.host if request.client else None, f"User ID: {employee_id}")
    return {"message": f"Employee status updated. Active: {user.is_active}"}

@router.post("/{employee_id}/reset-password", response_model=MessageResponse)
def reset_employee_password(
    employee_id: uuid.UUID,
    request: Request,
    pass_data: UserResetPassword,
    db: Session = Depends(get_db),
    admin_user: User = Depends(admin_required)
):
    new_password = pass_data.new_password

    user = db.query(User).filter(User.id == employee_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")
        
    user.hashed_password = get_password_hash(new_password)
    db.commit()
    
    log_audit(db, admin_user.id, "EMPLOYEE_PASSWORD_RESET", request.client.host if request.client else None, f"User ID: {employee_id}")
    return {"message": "Employee password has been reset successfully"}

@router.post("/{employee_id}/upload-avatar")
async def upload_employee_avatar(
    employee_id: uuid.UUID,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role == "Employee" and current_user.id != employee_id:
        raise HTTPException(status_code=403, detail="You cannot upload avatars for other employees")
        
    user = db.query(User).filter(User.id == employee_id).first()
    if not user or not user.profile:
        raise HTTPException(status_code=404, detail="Employee profile not found")

    # Validate file extension and MIME type
    file_ext = os.path.splitext(file.filename or "")[1].lower()
    if file_ext not in settings.ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only JPG, JPEG, PNG, and WebP files are allowed")

    if file.content_type not in settings.ALLOWED_UPLOAD_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Invalid image content type")

    # Read and validate file size (max 5 MB)
    contents = await file.read()
    if len(contents) > settings.MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File size exceeds the 5 MB limit")

    # Verify the bytes are actually a decodable image of an allowed format —
    # extension and Content-Type are client-supplied and can be spoofed.
    try:
        validate_image_bytes(contents)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    unique_filename = f"{employee_id}_{uuid.uuid4().hex}{file_ext}"

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
        # Local fallback
        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
        file_path = os.path.join(settings.UPLOAD_DIR, unique_filename)
        with open(file_path, "wb") as buffer:
            buffer.write(contents)
        image_url = f"/api/static/{unique_filename}"

    # Update profile image url
    user.profile.profile_image_url = image_url
    db.commit()
    
    log_audit(db, current_user.id, "AVATAR_UPLOADED", request.client.host if request.client else None, f"User ID: {employee_id}")
    return {"profile_image_url": user.profile.profile_image_url}

