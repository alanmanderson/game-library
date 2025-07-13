"""create deals table

Revision ID: xxxx
Revises: 
Create Date: 2025-07-13

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'xxxx'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.execute('CREATE SCHEMA IF NOT EXISTS spades')
    op.create_table(
        'deals',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('name', sa.String(50), nullable=False),
        schema='spades'
    )

def downgrade():
    op.drop_table('deals', schema='spades')
    op.execute('DROP SCHEMA IF EXISTS spades')
