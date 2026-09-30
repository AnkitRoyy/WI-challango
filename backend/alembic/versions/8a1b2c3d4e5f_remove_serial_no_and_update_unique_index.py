"""remove serial_no and update unique constraint to challan_no and product

Revision ID: 8a1b2c3d4e5f
Revises: e07794d45bfa
Create Date: 2026-09-30 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8a1b2c3d4e5f'
down_revision: Union[str, None] = 'e07794d45bfa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop old unique index on (challan_no, serial_no)
    op.drop_index('uq_challan_serial_active', table_name='entries', postgresql_where=sa.text('is_deleted IS false'))

    # Create new unique index on (challan_no, product) among non-deleted entries
    op.create_index(
        'uq_challan_product_active',
        'entries',
        ['challan_no', 'product'],
        unique=True,
        postgresql_where=sa.text('is_deleted IS false')
    )

    # Drop serial_no column from entries table
    op.drop_column('entries', 'serial_no')


def downgrade() -> None:
    op.add_column('entries', sa.Column('serial_no', sa.String(length=100), nullable=True))
    op.drop_index('uq_challan_product_active', table_name='entries', postgresql_where=sa.text('is_deleted IS false'))
    op.create_index(
        'uq_challan_serial_active',
        'entries',
        ['challan_no', 'serial_no'],
        unique=True,
        postgresql_where=sa.text('is_deleted IS false')
    )
