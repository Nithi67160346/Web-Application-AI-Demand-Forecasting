"""Keep new actuals separate from forecasts of a replaced dataset."""
from alembic import op
import sqlalchemy as sa
revision='0002_data_lineage'
down_revision='0001_workspace'
branch_labels=None
depends_on=None

def upgrade():
    inspector=sa.inspect(op.get_bind())
    if 'data_generation' not in {c['name'] for c in inspector.get_columns('workspaces')}:
        op.add_column('workspaces',sa.Column('data_generation',sa.Integer(),nullable=False,server_default='0'))
    legacy='data_generation' not in {c['name'] for c in inspector.get_columns('forecast_runs')}
    if legacy:
        op.add_column('forecast_runs',sa.Column('data_generation',sa.Integer(),nullable=False,server_default='0'))
    # Earlier versions did not record replacement lineage. Never silently score
    # those legacy forecasts against an unrelated, subsequently replaced dataset.
    if legacy:
        op.execute('UPDATE forecast_runs SET data_generation = -1')

def downgrade():
    op.drop_column('forecast_runs','data_generation')
    op.drop_column('workspaces','data_generation')
