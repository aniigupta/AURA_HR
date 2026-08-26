"""add require_selfie to office settings

Lets HR turn off the clock-in selfie requirement per organization. Added with
server_default=true so every existing tenant keeps the behaviour it already
had — this is an opt-out, not a change of default.

Revision ID: c3d91e7a4f52
Revises: 9b2c28a36f34
Create Date: 2026-08-26 22:40:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d91e7a4f52'
down_revision: Union[str, None] = '9b2c28a36f34'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'office_settings',
        sa.Column('require_selfie', sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column('office_settings', 'require_selfie')
