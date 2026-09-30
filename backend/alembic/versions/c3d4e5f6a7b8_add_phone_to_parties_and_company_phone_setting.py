"""add phone to parties and company_phone setting

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-10-01 02:05:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add phone column to parties table
    op.add_column('parties', sa.Column('phone', sa.String(length=20), nullable=True))

    # 2. Seed company_phone in app_settings (default to WI's number)
    op.execute(
        sa.text(
            "INSERT INTO app_settings (key, value, description) "
            "VALUES ('company_phone', '9034218483', 'Company WhatsApp/contact number shown on challans') "
            "ON CONFLICT (key) DO NOTHING;"
        )
    )


def downgrade() -> None:
    op.drop_column('parties', 'phone')
    op.execute(sa.text("DELETE FROM app_settings WHERE key = 'company_phone';"))
