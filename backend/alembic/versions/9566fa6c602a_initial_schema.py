"""Initial schema

Revision ID: 9566fa6c602a
Revises: 
Create Date: 2026-08-07 15:27:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9566fa6c602a'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create users table
    op.create_table(
        'users',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('role', sa.String(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)

    # 2. Create departments table
    op.create_table(
        'departments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_departments_id'), 'departments', ['id'], unique=False)
    op.create_index(op.f('ix_departments_name'), 'departments', ['name'], unique=True)

    # 3. Create employee_profiles table
    op.create_table(
        'employee_profiles',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('first_name', sa.String(), nullable=False),
        sa.Column('last_name', sa.String(), nullable=False),
        sa.Column('employee_id', sa.String(), nullable=False),
        sa.Column('phone', sa.String(), nullable=True),
        sa.Column('designation', sa.String(), nullable=True),
        sa.Column('department_id', sa.Integer(), nullable=True),
        sa.Column('profile_image_url', sa.String(), nullable=True),
        sa.Column('join_date', sa.Date(), nullable=True),
        sa.Column('leave_balance_casual', sa.Integer(), nullable=True),
        sa.Column('leave_balance_sick', sa.Integer(), nullable=True),
        sa.Column('leave_balance_paid', sa.Integer(), nullable=True),
        sa.Column('wfh_enabled', sa.Boolean(), nullable=True),
        sa.Column('wfh_start_date', sa.Date(), nullable=True),
        sa.Column('wfh_end_date', sa.Date(), nullable=True),
        sa.Column('wfh_reason', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['department_id'], ['departments.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id')
    )
    op.create_index(op.f('ix_employee_profiles_employee_id'), 'employee_profiles', ['employee_id'], unique=True)
    op.create_index(op.f('ix_employee_profiles_id'), 'employee_profiles', ['id'], unique=False)

    # 4. Create attendance table
    op.create_table(
        'attendance',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('date', sa.Date(), nullable=True),
        sa.Column('clock_in', sa.DateTime(), nullable=False),
        sa.Column('clock_out', sa.DateTime(), nullable=True),
        sa.Column('working_hours', sa.Float(), nullable=True),
        sa.Column('break_duration', sa.Float(), nullable=True),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('is_wfh', sa.Boolean(), nullable=True),
        sa.Column('late_minutes', sa.Integer(), nullable=True),
        sa.Column('early_leaving_minutes', sa.Integer(), nullable=True),
        sa.Column('overtime_minutes', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_attendance_date'), 'attendance', ['date'], unique=False)
    op.create_index(op.f('ix_attendance_id'), 'attendance', ['id'], unique=False)

    # 5. Create break_sessions table
    op.create_table(
        'break_sessions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('attendance_id', sa.UUID(), nullable=False),
        sa.Column('start_time', sa.DateTime(), nullable=False),
        sa.Column('end_time', sa.DateTime(), nullable=True),
        sa.Column('duration', sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(['attendance_id'], ['attendance.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_break_sessions_id'), 'break_sessions', ['id'], unique=False)

    # 6. Create leave_requests table
    op.create_table(
        'leave_requests',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('leave_type', sa.String(), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('reason', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('approved_by', sa.UUID(), nullable=True),
        sa.Column('comment', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['approved_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_leave_requests_id'), 'leave_requests', ['id'], unique=False)

    # 7. Create holidays table
    op.create_table(
        'holidays',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_holidays_date'), 'holidays', ['date'], unique=True)
    op.create_index(op.f('ix_holidays_id'), 'holidays', ['id'], unique=False)

    # 8. Create office_settings table
    op.create_table(
        'office_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=True),
        sa.Column('longitude', sa.Float(), nullable=True),
        sa.Column('allowed_radius', sa.Float(), nullable=True),
        sa.Column('office_start_time', sa.Time(), nullable=True),
        sa.Column('office_end_time', sa.Time(), nullable=True),
        sa.Column('lunch_break_hours', sa.Float(), nullable=True),
        sa.Column('required_working_hours', sa.Float(), nullable=True),
        sa.Column('weekends', sa.String(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_office_settings_id'), 'office_settings', ['id'], unique=False)

    # 9. Create audit_logs table
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('ip_address', sa.String(), nullable=True),
        sa.Column('details', sa.Text(), nullable=True),
        sa.Column('timestamp', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_audit_logs_id'), 'audit_logs', ['id'], unique=False)


def downgrade() -> None:
    op.drop_table('audit_logs')
    op.drop_table('office_settings')
    op.drop_table('holidays')
    op.drop_table('leave_requests')
    op.drop_table('break_sessions')
    op.drop_table('attendance')
    op.drop_table('employee_profiles')
    op.drop_table('departments')
    op.drop_table('users')
