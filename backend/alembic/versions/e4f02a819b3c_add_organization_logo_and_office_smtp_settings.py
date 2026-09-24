"""add organization logo and office smtp settings

Revision ID: e4f02a819b3c
Revises: c3d91e7a4f52
Create Date: 2026-09-24 14:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e4f02a819b3c'
down_revision: Union[str, None] = 'c3d91e7a4f52'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add logo_url to organizations
    op.add_column(
        'organizations',
        sa.Column('logo_url', sa.String(), nullable=True),
    )

    # 2. Add SMTP settings to office_settings
    op.add_column('office_settings', sa.Column('smtp_host', sa.String(), nullable=True))
    op.add_column('office_settings', sa.Column('smtp_port', sa.Integer(), nullable=True, server_default='587'))
    op.add_column('office_settings', sa.Column('smtp_username', sa.String(), nullable=True))
    op.add_column('office_settings', sa.Column('smtp_password', sa.String(), nullable=True))
    op.add_column('office_settings', sa.Column('smtp_from_email', sa.String(), nullable=True))
    op.add_column('office_settings', sa.Column('smtp_from_name', sa.String(), nullable=True))
    op.add_column('office_settings', sa.Column('smtp_use_tls', sa.Boolean(), nullable=True, server_default=sa.true()))


def downgrade() -> None:
    op.drop_column('office_settings', 'smtp_use_tls')
    op.drop_column('office_settings', 'smtp_from_name')
    op.drop_column('office_settings', 'smtp_from_email')
    op.drop_column('office_settings', 'smtp_password')
    op.drop_column('office_settings', 'smtp_username')
    op.drop_column('office_settings', 'smtp_port')
    op.drop_column('office_settings', 'smtp_host')
    op.drop_column('organizations', 'logo_url')
