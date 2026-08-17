"""add timezone to settings

Revision ID: a5f80b9f1d0a
Revises: 9566fa6c602a
Create Date: 2026-08-07 15:35:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a5f80b9f1d0a'
down_revision: Union[str, None] = '9566fa6c602a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('office_settings', sa.Column('timezone', sa.String(), nullable=True, server_default='Asia/Kolkata'))


def downgrade() -> None:
    op.drop_column('office_settings', 'timezone')
