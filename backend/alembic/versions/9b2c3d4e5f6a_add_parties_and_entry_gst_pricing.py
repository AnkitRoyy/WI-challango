"""add parties and entry gst pricing

Revision ID: 9b2c3d4e5f6a
Revises: 8a1b2c3d4e5f
Create Date: 2026-09-30 15:35:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9b2c3d4e5f6a'
down_revision: Union[str, None] = '8a1b2c3d4e5f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create parties table
    op.create_table(
        'parties',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('gst_number', sa.String(length=15), nullable=True),
        sa.Column('address', sa.String(length=500), nullable=True),
        sa.Column('state', sa.String(length=100), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_by', sa.BigInteger(), nullable=True),
        sa.Column('updated_by', sa.BigInteger(), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['updated_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_parties_name', 'parties', ['name'])
    op.create_index('ix_parties_is_active', 'parties', ['is_active'])
    op.create_index(
        'uq_parties_gst_number_active',
        'parties',
        ['gst_number'],
        unique=True,
        postgresql_where=sa.text('gst_number IS NOT NULL AND is_active = true'),
    )

    # 2. Add columns to entries table
    op.add_column('entries', sa.Column('party_name', sa.String(length=255), nullable=True))
    op.add_column('entries', sa.Column('gst_type', sa.String(length=20), nullable=False, server_default='none'))
    op.add_column('entries', sa.Column('gst_rate', sa.Numeric(precision=5, scale=2), nullable=True))
    op.add_column('entries', sa.Column('subtotal', sa.Numeric(precision=14, scale=2), nullable=False, server_default='0.00'))
    op.add_column('entries', sa.Column('gst_amount', sa.Numeric(precision=14, scale=2), nullable=False, server_default='0.00'))

    op.create_index('ix_entries_party_name', 'entries', ['party_name'])

    # 3. Data migration: backfill subtotal = total_price, gst_type = 'none', gst_amount = 0.00
    op.execute(
        sa.text(
            """
            UPDATE entries
            SET subtotal = total_price,
                gst_type = 'none',
                gst_rate = NULL,
                gst_amount = 0.00
            WHERE subtotal = 0.00 OR subtotal IS NULL
            """
        )
    )


def downgrade() -> None:
    op.drop_index('ix_entries_party_name', table_name='entries')
    op.drop_column('entries', 'gst_amount')
    op.drop_column('entries', 'subtotal')
    op.drop_column('entries', 'gst_rate')
    op.drop_column('entries', 'gst_type')
    op.drop_column('entries', 'party_name')

    op.drop_index('uq_parties_gst_number_active', table_name='parties')
    op.drop_index('ix_parties_is_active', table_name='parties')
    op.drop_index('ix_parties_name', table_name='parties')
    op.drop_table('parties')
