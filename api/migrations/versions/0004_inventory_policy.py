"""Add per-product review period and service level for forecast-based safety stock."""
from alembic import op
import sqlalchemy as sa

revision = '0004_inventory_policy'
down_revision = '0003_replenishment'
branch_labels = None
depends_on = None


def upgrade():
    # Existing products get a weekly review and 95% service level; safety_stock stays as the manual minimum.
    op.add_column('products', sa.Column('review_period_days', sa.Integer(), nullable=False, server_default='7'))
    op.add_column('products', sa.Column('service_level_percent', sa.Integer(), nullable=False, server_default='95'))


def downgrade():
    op.drop_column('products', 'service_level_percent')
    op.drop_column('products', 'review_period_days')
