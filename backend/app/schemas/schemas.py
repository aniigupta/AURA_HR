import re
from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator
from datetime import datetime, date, time
from typing import Optional, List, Any
from uuid import UUID

PASSWORD_MIN_LENGTH = 8

def validate_password_strength(password: str) -> str:
    if len(password) < PASSWORD_MIN_LENGTH:
        raise ValueError(f"Password must be at least {PASSWORD_MIN_LENGTH} characters long")
    if not re.search(r"[a-z]", password):
        raise ValueError("Password must contain at least one lowercase letter")
    if not re.search(r"[A-Z]", password):
        raise ValueError("Password must contain at least one uppercase letter")
    if not re.search(r"\d", password):
        raise ValueError("Password must contain at least one digit")
    return password

# Generic API Response Schemas
class StandardResponse(BaseModel):
    success: bool = True
    message: str
    data: Optional[Any] = None

class StandardErrorResponse(BaseModel):
    success: bool = False
    message: str
    errorCode: str = "GENERIC_ERROR"
    detail: Optional[Any] = None

class MessageResponse(BaseModel):
    message: str

# Organization / Tenant Schemas
class OrganizationBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    slug: str = Field(..., min_length=2, max_length=100, pattern="^[a-z0-9-]+$")
    logo_url: Optional[str] = None

class OrganizationCreate(OrganizationBase):
    plan: Optional[str] = Field("Starter", pattern="^(Starter|Growth|Enterprise)$")
    max_employees: Optional[int] = Field(25, ge=1)

class OrganizationUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=150)
    plan: Optional[str] = Field(None, pattern="^(Starter|Growth|Enterprise)$")
    max_employees: Optional[int] = Field(None, ge=1)
    is_active: Optional[bool] = None
    logo_url: Optional[str] = None

class OrganizationOut(OrganizationBase):
    id: UUID
    plan: str
    max_employees: int
    is_active: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

# Company Self-Service Registration Schema
class CompanyRegisterRequest(BaseModel):
    company_name: str = Field(..., min_length=2, max_length=150)
    company_slug: str = Field(..., min_length=2, max_length=100, pattern="^[a-z0-9-]+$")
    admin_name: str = Field(..., min_length=2, max_length=100)
    admin_email: EmailStr
    admin_password: str = Field(..., min_length=PASSWORD_MIN_LENGTH)
    admin_phone: Optional[str] = Field(None, max_length=30)
    designation: Optional[str] = Field("Founder & Managing Director", max_length=100)
    latitude: Optional[float] = Field(28.6139, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(77.2090, ge=-180.0, le=180.0)
    allowed_radius: Optional[float] = Field(150.0, ge=10.0, le=50000.0)

    _validate_password = field_validator("admin_password")(validate_password_strength)

# Department Schemas
class DepartmentBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=255)

class DepartmentCreate(DepartmentBase):
    pass

class DepartmentOut(DepartmentBase):
    id: int
    organization_id: UUID
    model_config = ConfigDict(from_attributes=True)

# Employee Profile Schemas
class EmployeeProfileBase(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    employee_id: str = Field(..., min_length=1, max_length=50)
    phone: Optional[str] = Field(None, max_length=30)
    designation: Optional[str] = Field(None, max_length=100)
    department_id: Optional[int] = None
    join_date: Optional[date] = None
    leave_balance_casual: Optional[int] = Field(12, ge=0)
    leave_balance_sick: Optional[int] = Field(10, ge=0)
    leave_balance_paid: Optional[int] = Field(15, ge=0)
    hourly_rate: Optional[float] = Field(0.0, ge=0.0)
    base_salary: Optional[float] = Field(0.0, ge=0.0)
    wfh_enabled: Optional[bool] = False
    wfh_start_date: Optional[date] = None
    wfh_end_date: Optional[date] = None
    wfh_reason: Optional[str] = Field(None, max_length=255)

class EmployeeProfileCreate(EmployeeProfileBase):
    pass

class EmployeeProfileUpdate(BaseModel):
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    employee_id: Optional[str] = Field(None, min_length=1, max_length=50)
    phone: Optional[str] = Field(None, max_length=30)
    designation: Optional[str] = Field(None, max_length=100)
    department_id: Optional[int] = None
    profile_image_url: Optional[str] = None
    leave_balance_casual: Optional[int] = Field(None, ge=0)
    leave_balance_sick: Optional[int] = Field(None, ge=0)
    leave_balance_paid: Optional[int] = Field(None, ge=0)
    hourly_rate: Optional[float] = Field(None, ge=0.0)
    base_salary: Optional[float] = Field(None, ge=0.0)
    wfh_enabled: Optional[bool] = None
    wfh_start_date: Optional[date] = None
    wfh_end_date: Optional[date] = None
    wfh_reason: Optional[str] = Field(None, max_length=255)

class EmployeeProfileOut(EmployeeProfileBase):
    id: UUID
    organization_id: UUID
    user_id: UUID
    profile_image_url: Optional[str] = None
    department: Optional[DepartmentOut] = None
    model_config = ConfigDict(from_attributes=True)

# User Schemas
class UserBase(BaseModel):
    email: EmailStr

class UserCreate(UserBase):
    password: str = Field(..., min_length=PASSWORD_MIN_LENGTH)
    role: str = Field(..., pattern="^(Admin|Employee)$")
    profile: EmployeeProfileCreate

    _validate_password = field_validator("password")(validate_password_strength)

class UserUpdatePassword(BaseModel):
    old_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=PASSWORD_MIN_LENGTH)

    _validate_password = field_validator("new_password")(validate_password_strength)

class UserResetPassword(BaseModel):
    new_password: str = Field(..., min_length=PASSWORD_MIN_LENGTH)

    _validate_password = field_validator("new_password")(validate_password_strength)

class UserOut(UserBase):
    id: UUID
    organization_id: UUID
    role: str
    is_active: bool
    mfa_enabled: bool
    created_at: datetime
    profile: Optional[EmployeeProfileOut] = None
    organization: Optional[OrganizationOut] = None
    model_config = ConfigDict(from_attributes=True)

# Token Schemas
class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    user_id: Optional[str] = None
    organization_id: Optional[str] = None
    role: Optional[str] = None

# Login Schema
class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    company_slug: Optional[str] = None

class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    company_slug: Optional[str] = None

# MFA (TOTP) Schemas
class MfaLoginChallenge(BaseModel):
    mfa_required: bool = True
    mfa_token: str
    message: str = "MFA verification required"

class MfaSetupResponse(BaseModel):
    secret: str
    qr_code_base64: str

class MfaCodeRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=6, pattern="^[0-9]{6}$")

class MfaVerifyRequest(BaseModel):
    mfa_token: str
    code: str = Field(..., min_length=6, max_length=6, pattern="^[0-9]{6}$")

class MfaDisableRequest(BaseModel):
    password: str = Field(..., min_length=1)

# Break Session Schemas
class BreakSessionBase(BaseModel):
    start_time: datetime
    end_time: Optional[datetime] = None
    duration: float = Field(0.0, ge=0.0)

class BreakSessionOut(BreakSessionBase):
    id: UUID
    attendance_id: UUID
    model_config = ConfigDict(from_attributes=True)

# Attendance Schemas
class ClockInRequest(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    selfie_base64: Optional[str] = None
    device_info: Optional[str] = Field(None, max_length=255)
    gps_accuracy: Optional[float] = Field(None, ge=0.0)

class ClockOutRequest(BaseModel):
    pass

class AttendanceBase(BaseModel):
    date: date
    clock_in: datetime
    clock_out: Optional[datetime] = None
    working_hours: float = Field(0.0, ge=0.0)
    break_duration: float = Field(0.0, ge=0.0)
    status: str
    is_wfh: bool = False
    late_minutes: int = Field(0, ge=0)
    early_leaving_minutes: int = Field(0, ge=0)
    overtime_minutes: int = Field(0, ge=0)
    selfie_url: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    gps_accuracy: Optional[float] = None
    device_info: Optional[str] = None
    is_suspicious: bool = False
    modified_by_admin: bool = False
    modification_reason: Optional[str] = None

class AttendanceOut(AttendanceBase):
    id: UUID
    organization_id: UUID
    user_id: UUID
    break_sessions: List[BreakSessionOut] = []
    model_config = ConfigDict(from_attributes=True)

# Attendance Correction Request Schemas
class AttendanceCorrectionCreate(BaseModel):
    date: date
    proposed_clock_in: Optional[datetime] = None
    proposed_clock_out: Optional[datetime] = None
    reason: str = Field(..., min_length=3, max_length=500)

class AttendanceCorrectionReview(BaseModel):
    status: str = Field(..., pattern="^(Approved|Rejected)$")
    comment: Optional[str] = Field(None, max_length=255)

class AttendanceCorrectionOut(BaseModel):
    id: UUID
    organization_id: UUID
    user_id: UUID
    date: date
    proposed_clock_in: Optional[datetime] = None
    proposed_clock_out: Optional[datetime] = None
    reason: str
    status: str
    comment: Optional[str] = None
    created_at: datetime
    user: Optional[UserOut] = None
    model_config = ConfigDict(from_attributes=True)

class AttendanceImportResponse(BaseModel):
    total_rows: int
    imported_count: int
    updated_count: int
    skipped_count: int
    errors: List[str] = []

# Leave Request Schemas
class LeaveRequestCreate(BaseModel):
    leave_type: str = Field(..., pattern="^(Casual|Sick|Paid|Unpaid|Emergency)$")
    start_date: date
    end_date: date
    reason: str = Field(..., min_length=2, max_length=500)

class LeaveRequestReview(BaseModel):
    status: str = Field(..., pattern="^(Approved|Rejected)$")
    comment: Optional[str] = Field(None, max_length=255)

class LeaveRequestOut(BaseModel):
    id: UUID
    organization_id: UUID
    user_id: UUID
    leave_type: str
    start_date: date
    end_date: date
    reason: str
    status: str
    approved_by: Optional[UUID] = None
    comment: Optional[str] = None
    created_at: datetime
    user: Optional[UserOut] = None
    model_config = ConfigDict(from_attributes=True)

# Holiday Schemas
class HolidayBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    date: date
    description: Optional[str] = Field(None, max_length=255)

class HolidayCreate(HolidayBase):
    pass

class HolidayOut(HolidayBase):
    id: int
    organization_id: UUID
    model_config = ConfigDict(from_attributes=True)

# Office Settings Schemas
class OfficeSettingUpdate(BaseModel):
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0)
    allowed_radius: Optional[float] = Field(None, ge=1.0, le=50000.0)
    office_start_time: Optional[time] = None
    office_end_time: Optional[time] = None
    lunch_break_hours: Optional[float] = Field(None, ge=0.0, le=5.0)
    required_working_hours: Optional[float] = Field(None, ge=1.0, le=24.0)
    weekends: Optional[str] = Field(None, max_length=100)
    timezone: Optional[str] = Field(None, max_length=50)
    require_selfie: Optional[bool] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = Field(None, ge=1, le=65535)
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from_email: Optional[str] = None
    smtp_from_name: Optional[str] = None
    smtp_use_tls: Optional[bool] = None

class OfficeSettingOut(BaseModel):
    id: int
    organization_id: UUID
    latitude: float
    longitude: float
    allowed_radius: float
    office_start_time: time
    office_end_time: time
    lunch_break_hours: float
    required_working_hours: float
    weekends: str
    timezone: str
    require_selfie: bool = True
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = 587
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from_email: Optional[str] = None
    smtp_from_name: Optional[str] = None
    smtp_use_tls: Optional[bool] = True
    model_config = ConfigDict(from_attributes=True)

# Audit Log Schema
class AuditLogOut(BaseModel):
    id: UUID
    organization_id: Optional[UUID] = None
    user_id: Optional[UUID] = None
    action: str
    ip_address: Optional[str] = None
    details: Optional[str] = None
    timestamp: datetime
    user: Optional[UserOut] = None
    model_config = ConfigDict(from_attributes=True)

# Company Policy Schemas
class CompanyPolicyBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    category: str = Field("General", max_length=50)
    content: str = Field(..., min_length=1)
    is_published: bool = True

class CompanyPolicyCreate(CompanyPolicyBase):
    pass

class CompanyPolicyUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    category: Optional[str] = Field(None, max_length=50)
    content: Optional[str] = Field(None, min_length=1)
    is_published: Optional[bool] = None

class CompanyPolicyOut(CompanyPolicyBase):
    id: UUID
    organization_id: UUID
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class DocumentExtractResponse(BaseModel):
    title: str
    suggested_category: str
    content: str
    filename: str
    character_count: int

# AI Assistant Chat Schemas
class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant|model)$")
    content: str = Field(..., min_length=1)

class AIChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: Optional[List[ChatMessage]] = Field(default_factory=list)

class AIChatResponse(BaseModel):
    reply: str
    sources: List[str] = Field(default_factory=list)

