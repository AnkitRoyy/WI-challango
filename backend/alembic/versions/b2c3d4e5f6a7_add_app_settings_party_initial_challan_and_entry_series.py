"""add app_settings, party initial_challan_no, and entry challan_series

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-09-30 23:35:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create app_settings table
    op.create_table(
        'app_settings',
        sa.Column('key', sa.String(length=100), nullable=False),
        sa.Column('value', sa.String(length=500), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_by', sa.BigInteger(), nullable=True),
        sa.ForeignKeyConstraint(['updated_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('key')
    )

    # Seed default WI challan starting number
    op.execute(
        sa.text(
            "INSERT INTO app_settings (key, value, description) "
            "VALUES ('wi_initial_challan_no', 'WI-001', 'Default starting challan number for WI company series') "
            "ON CONFLICT (key) DO NOTHING;"
        )
    )

    # 2. Add initial_challan_no to parties
    op.add_column('parties', sa.Column('initial_challan_no', sa.String(length=100), nullable=True))

    # 3. Add challan_series to entries
    op.add_column('entries', sa.Column('challan_series', sa.String(length=50), nullable=False, server_default='own'))
    op.create_index('ix_entries_challan_series', 'entries', ['challan_series'])


def downgrade() -> None:
    op.drop_index('ix_entries_challan_series', table_name='entries')
    op.drop_column('entries', 'challan_series')
    op.drop_column('parties', 'initial_challan_no')
    op.drop_table('app_settings')
