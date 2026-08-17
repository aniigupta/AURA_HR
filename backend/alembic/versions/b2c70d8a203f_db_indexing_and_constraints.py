"""db indexing and constraints

Revision ID: b2c70d8a203f
Revises: a5f80b9f1d0a
Create Date: 2026-08-07 15:40:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c70d8a203f'
down_revision: Union[str, None] = 'a5f80b9f1d0a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create check constraints
    op.create_check_constraint('role_check', 'users', "role IN ('Admin', 'Employee')")
    op.create_check_constraint('single_row_constraint', 'office_settings', "id = 1")

    # 2. Create index operations on foreign keys
    op.create_index('ix_employee_profiles_department_id', 'employee_profiles', ['department_id'], unique=False)
    op.create_index('ix_attendance_user_id', 'attendance', ['user_id'], unique=False)
    op.create_index('ix_break_sessions_attendance_id', 'break_sessions', ['attendance_id'], unique=False)
    op.create_index('ix_leave_requests_user_id', 'leave_requests', ['user_id'], unique=False)
    op.create_index('ix_leave_requests_approved_by', 'leave_requests', ['approved_by'], unique=False)
    op.create_index('ix_audit_logs_user_id', 'audit_logs', ['user_id'], unique=False)


def downgrade() -> None:
    # 1. Drop index operations
    op.drop_index('ix_audit_logs_user_id', table_name='audit_logs')
    op.drop_index('ix_leave_requests_approved_by', table_name='leave_requests')
    op.drop_index('ix_leave_requests_user_id', table_name='leave_requests')
    op.drop_index('ix_break_sessions_attendance_id', table_name='break_sessions')
    op.drop_index('ix_attendance_user_id', table_name='attendance')
    op.drop_index('ix_employee_profiles_department_id', table_name='employee_profiles')

    # 2. Drop check constraints
    op.drop_constraint('single_row_constraint', 'office_settings', type_='check')
    op.drop_constraint('role_check', 'users', type_='check')
