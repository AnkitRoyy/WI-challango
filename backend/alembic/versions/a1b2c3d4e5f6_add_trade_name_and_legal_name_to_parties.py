"""add trade_name and legal_name to parties
 
Revision ID: a1b2c3d4e5f6
Revises: 9b2c3d4e5f6a
Create Date: 2026-09-30 22:50:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '9b2c3d4e5f6a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('parties', sa.Column('trade_name', sa.String(length=255), nullable=True))
    op.add_column('parties', sa.Column('legal_name', sa.String(length=255), nullable=True))
    op.create_index('ix_parties_trade_name', 'parties', ['trade_name'])
    op.create_index('ix_parties_legal_name', 'parties', ['legal_name'])


def downgrade() -> None:
    op.drop_index('ix_parties_legal_name', table_name='parties')
    op.drop_index('ix_parties_trade_name', table_name='parties')
    op.drop_column('parties', 'legal_name')
    op.drop_column('parties', 'trade_name')
