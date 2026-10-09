"""Persist replenishment proposals and human review separately from inventory."""
from alembic import op
import sqlalchemy as sa

revision = '0003_replenishment'
down_revision = '0002_data_lineage'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('replenishment_plans',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('workspace_id', sa.Integer(), sa.ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False),
        sa.Column('forecast_id', sa.Integer(), sa.ForeignKey('forecast_runs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('calculation', sa.JSON(), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('note', sa.Text(), nullable=False),
        sa.Column('reviewed_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('review_note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False))
    op.create_index('ix_replenishment_plans_workspace_id', 'replenishment_plans', ['workspace_id'])


def downgrade():
    op.drop_table('replenishment_plans')
