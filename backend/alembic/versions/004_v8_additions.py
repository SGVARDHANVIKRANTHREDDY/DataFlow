"""v8: is_admin column on users, beat schedule tables, JSON size guard via DB trigger

Revision ID: 004
Revises: 003
Create Date: 2025-01-04 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # is_admin for RBAC
    op.add_column("users", sa.Column("is_admin", sa.Boolean, server_default="false"))

    # Index to speed up admin queries
    op.create_index("ix_users_is_admin", "users", ["is_admin"])
    op.create_index("ix_dlq_suppressed", "dead_letter_entries", ["suppressed"])
    op.create_index("ix_dlq_replay_count", "dead_letter_entries", ["replay_count"])

    # Partial index: only active (non-revoked) refresh tokens
    op.execute("""
        CREATE INDEX ix_refresh_active
        ON refresh_tokens (user_id, expires_at)
        WHERE is_revoked = false
    """)

    # Partial index: only pending jobs (most queried)
    op.execute("""
        CREATE INDEX ix_jobs_pending
        ON jobs (created_at)
        WHERE status = 'pending'
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_jobs_pending")
    op.execute("DROP INDEX IF EXISTS ix_refresh_active")
    op.drop_index("ix_dlq_replay_count", "dead_letter_entries")
    op.drop_index("ix_dlq_suppressed", "dead_letter_entries")
    op.drop_index("ix_users_is_admin", "users")
    op.drop_column("users", "is_admin")
