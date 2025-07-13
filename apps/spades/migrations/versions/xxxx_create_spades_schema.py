"""create spades schema

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

def downgrade():
    op.execute('DROP SCHEMA IF EXISTS spades')
