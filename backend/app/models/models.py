import uuid
from datetime import datetime, date, time, timezone
from sqlalchemy import (
    Column, String, Boolean, DateTime, Date, Time, Float, Integer, ForeignKey, Text, CheckConstraint, Index
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base

def utc_now():
    return datetime.now(timezone.utc)

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, CheckConstraint("role IN ('Admin', 'Employee')"), nullable=False)  # "Admin" or "Employee"
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    # Relationships
    profile = relationship("EmployeeProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    attendances = relationship("Attendance", back_populates="user", cascade="all, delete-orphan")
    leave_requests = relationship("LeaveRequest", back_populates="user", foreign_keys="LeaveRequest.user_id", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="user", cascade="all, delete-orphan")
    correction_requests = relationship("AttendanceCorrectionRequest", back_populates="user", foreign_keys="AttendanceCorrectionRequest.user_id", cascade="all, delete-orphan")

class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    description = Column(String, nullable=True)

    # Relationships
    profiles = relationship("EmployeeProfile", back_populates="department")

class EmployeeProfile(Base):
    __tablename__ = "employee_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    employee_id = Column(String, unique=True, index=True, nullable=False)
    phone = Column(String, nullable=True)
    designation = Column(String, nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True, index=True)
    profile_image_url = Column(String, nullable=True)
    join_date = Column(Date, default=date.today)
    
    # Leave balances (defaults)
    leave_balance_casual = Column(Integer, default=12)
    leave_balance_sick = Column(Integer, default=10)
    leave_balance_paid = Column(Integer, default=15)
    
    # Compensation & Salary
    hourly_rate = Column(Float, default=0.0)
    base_salary = Column(Float, default=0.0)

    # WFH details
    wfh_enabled = Column(Boolean, default=False)
    wfh_start_date = Column(Date, nullable=True)
    wfh_end_date = Column(Date, nullable=True)
    wfh_reason = Column(String, nullable=True)

    # Relationships
    user = relationship("User", back_populates="profile")
    department = relationship("Department", back_populates="profiles")

class Attendance(Base):
    __tablename__ = "attendance"
    __table_args__ = (
        Index("ix_attendance_user_date", "user_id", "date"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(Date, default=date.today, index=True)
    clock_in = Column(DateTime(timezone=True), nullable=False)
    clock_out = Column(DateTime(timezone=True), nullable=True)
    working_hours = Column(Float, default=0.0)      # Net working hours
    break_duration = Column(Float, default=0.0)     # Total minutes or hours on break
    status = Column(String, nullable=False, index=True)  # "Present", "Absent", "Late", "Half Day", "Leave", "Work From Home", etc.
    is_wfh = Column(Boolean, default=False)
    late_minutes = Column(Integer, default=0)
    early_leaving_minutes = Column(Integer, default=0)
    overtime_minutes = Column(Integer, default=0)

    # Verification & Audit columns
    selfie_url = Column(String, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    gps_accuracy = Column(Float, nullable=True)
    device_info = Column(String, nullable=True)
    is_suspicious = Column(Boolean, default=False)
    modified_by_admin = Column(Boolean, default=False)
    modification_reason = Column(String, nullable=True)

    # Relationships
    user = relationship("User", back_populates="attendances")
    break_sessions = relationship("BreakSession", back_populates="attendance", cascade="all, delete-orphan")

class BreakSession(Base):
    __tablename__ = "break_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    attendance_id = Column(UUID(as_uuid=True), ForeignKey("attendance.id", ondelete="CASCADE"), nullable=False, index=True)
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=True)
    duration = Column(Float, default=0.0)  # minutes

    # Relationships
    attendance = relationship("Attendance", back_populates="break_sessions")

class LeaveRequest(Base):
    __tablename__ = "leave_requests"
    __table_args__ = (
        Index("ix_leave_user_dates", "user_id", "start_date", "end_date"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    leave_type = Column(String, nullable=False)  # "Casual", "Sick", "Paid", "Unpaid", "Emergency"
    start_date = Column(Date, nullable=False, index=True)
    end_date = Column(Date, nullable=False, index=True)
    reason = Column(String, nullable=False)
    status = Column(String, default="Pending", index=True)  # "Pending", "Approved", "Rejected"
    approved_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    comment = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    # Relationships
    user = relationship("User", back_populates="leave_requests", foreign_keys=[user_id])
    approver = relationship("User", foreign_keys=[approved_by])

class Holiday(Base):
    __tablename__ = "holidays"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    date = Column(Date, unique=True, index=True, nullable=False)
    description = Column(String, nullable=True)

class OfficeSetting(Base):
    __tablename__ = "office_settings"
    __table_args__ = (
        CheckConstraint("id = 1", name="single_row_constraint"),
    )

    id = Column(Integer, primary_key=True, index=True)
    latitude = Column(Float, default=28.6139)  # Default: New Delhi
    longitude = Column(Float, default=77.2090)
    allowed_radius = Column(Float, default=100.0)  # in meters
    office_start_time = Column(Time, default=time(10, 0))  # 10:00 AM
    office_end_time = Column(Time, default=time(19, 0))    # 07:00 PM
    lunch_break_hours = Column(Float, default=1.0)
    required_working_hours = Column(Float, default=8.0)
    weekends = Column(String, default="Saturday,Sunday")  # Comma-separated list
    timezone = Column(String, default="Asia/Kolkata")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action = Column(String, nullable=False, index=True)
    ip_address = Column(String, nullable=True)
    details = Column(Text, nullable=True)
    timestamp = Column(DateTime(timezone=True), default=utc_now, index=True)

    # Relationships
    user = relationship("User", back_populates="audit_logs")

class AttendanceCorrectionRequest(Base):
    __tablename__ = "attendance_correction_requests"
    __table_args__ = (
        Index("ix_correction_user_date", "user_id", "date"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    proposed_clock_in = Column(DateTime(timezone=True), nullable=True)
    proposed_clock_out = Column(DateTime(timezone=True), nullable=True)
    reason = Column(Text, nullable=False)
    status = Column(String, default="Pending", index=True)  # "Pending", "Approved", "Rejected"
    comment = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    # Relationships
    user = relationship("User", back_populates="correction_requests", foreign_keys=[user_id])

