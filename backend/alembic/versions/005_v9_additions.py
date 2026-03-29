"""v9: execution dedup index, admin rate limit tracking index

Revision ID: 005
Revises: 004
Create Date: 2025-01-05
"""
from alembic import op
import sqlalchemy as sa

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Index for execution dedup key lookups (fast clock)
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_idem_keys_endpoint_user
        ON idempotency_keys (user_id, endpoint, expires_at)
        WHERE processing = false
    """)
    # Partial index for pending executions (what the exactly-once check queries)
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_exec_pending_pipeline
        ON pipeline_executions (pipeline_id, input_dataset_id)
        WHERE status = 'pending'
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_exec_pending_pipeline")
    op.execute("DROP INDEX IF EXISTS ix_idem_keys_endpoint_user")
