"""v7: RefreshToken table, execution lock columns, audit hash chain, DLQ replay fields

Revision ID: 003
Revises: 002
Create Date: 2025-01-03 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── refresh_tokens table ──────────────────────────────────
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), unique=True, nullable=False),
        sa.Column("family_id", sa.String(64), nullable=False),
        sa.Column("is_revoked", sa.Boolean, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_refresh_user_created", "refresh_tokens", ["user_id", "created_at"])
    op.create_index("ix_refresh_token_hash",   "refresh_tokens", ["token_hash"])
    op.create_index("ix_refresh_family",       "refresh_tokens", ["family_id"])
    op.create_index("ix_refresh_expires",      "refresh_tokens", ["expires_at"])

    # ── pipeline_executions: worker crash recovery ────────────
    op.add_column("pipeline_executions", sa.Column("locked_by", sa.String(100), nullable=True))
    op.add_column("pipeline_executions", sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_exec_locked", "pipeline_executions", ["locked_by", "locked_at"])

    # ── audit_logs: hash chain ────────────────────────────────
    op.add_column("audit_logs", sa.Column("entry_hash", sa.String(64), nullable=True))
    op.add_column("audit_logs", sa.Column("prev_hash", sa.String(64), nullable=True))

    # ── dead_letter_entries: replay hardening ─────────────────
    op.add_column("dead_letter_entries", sa.Column("replay_count", sa.Integer, server_default="0"))
    op.add_column("dead_letter_entries", sa.Column("last_replayed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("dead_letter_entries", sa.Column("suppressed", sa.Boolean, server_default="false"))
    op.add_column("dead_letter_entries", sa.Column("suppressed_reason", sa.Text, nullable=True))


def downgrade() -> None:
    op.drop_column("dead_letter_entries", "suppressed_reason")
    op.drop_column("dead_letter_entries", "suppressed")
    op.drop_column("dead_letter_entries", "last_replayed_at")
    op.drop_column("dead_letter_entries", "replay_count")
    op.drop_column("audit_logs", "prev_hash")
    op.drop_column("audit_logs", "entry_hash")
    op.drop_index("ix_exec_locked", "pipeline_executions")
    op.drop_column("pipeline_executions", "locked_at")
    op.drop_column("pipeline_executions", "locked_by")
    op.drop_table("refresh_tokens")
