"""v6: AuditLog, IdempotencyKey, LoginAttempt, DeadLetterEntry + lockout fields

Revision ID: 002
Revises: 001
Create Date: 2025-01-02 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # users: lockout fields
    op.add_column("users", sa.Column("is_locked", sa.Boolean, server_default="false"))
    op.add_column("users", sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("failed_login_count", sa.Integer, server_default="0"))

    # datasets: security fields
    op.add_column("datasets", sa.Column("file_hash", sa.String(64), nullable=True))
    op.add_column("datasets", sa.Column("is_quarantined", sa.Boolean, server_default="false"))

    # pipelines: optimistic locking
    op.add_column("pipelines", sa.Column("version", sa.Integer, server_default="1"))

    # pipeline_executions: idempotency + tracing
    op.add_column("pipeline_executions", sa.Column("idempotency_key", sa.String(255), nullable=True))
    op.add_column("pipeline_executions", sa.Column("trace_id", sa.String(64), nullable=True))
    op.create_unique_constraint("uq_execution_idempotency", "pipeline_executions", ["idempotency_key"])

    # jobs: idempotency
    op.add_column("jobs", sa.Column("idempotency_key", sa.String(255), nullable=True))
    op.create_index("ix_jobs_idempotency", "jobs", ["idempotency_key"])

    # audit_logs
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("resource_type", sa.String(50), nullable=True),
        sa.Column("resource_id", sa.Integer, nullable=True),
        sa.Column("detail", sa.JSON, nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("request_id", sa.String(64), nullable=True),
        sa.Column("trace_id", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_audit_user_created", "audit_logs", ["user_id", "created_at"])
    op.create_index("ix_audit_action",        "audit_logs", ["action"])
    op.create_index("ix_audit_resource",      "audit_logs", ["resource_type", "resource_id"])

    # idempotency_keys
    op.create_table(
        "idempotency_keys",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("key", sa.String(255), nullable=False),
        sa.Column("endpoint", sa.String(255), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("response_status", sa.Integer, nullable=True),
        sa.Column("response_body", sa.JSON, nullable=True),
        sa.Column("processing", sa.Boolean, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_unique_constraint("uq_idempotency_user_key", "idempotency_keys", ["user_id", "key"])
    op.create_index("ix_idempotency_expires", "idempotency_keys", ["expires_at"])

    # login_attempts
    op.create_table(
        "login_attempts",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=False),
        sa.Column("success", sa.Boolean, nullable=False),
        sa.Column("attempted_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_login_attempt_email_time", "login_attempts", ["email", "attempted_at"])

    # dead_letter_entries
    op.create_table(
        "dead_letter_entries",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("celery_task_id", sa.String(255), nullable=False),
        sa.Column("task_name", sa.String(255), nullable=False),
        sa.Column("queue", sa.String(100), nullable=False),
        sa.Column("args", sa.JSON, nullable=True),
        sa.Column("kwargs", sa.JSON, nullable=True),
        sa.Column("error", sa.Text, nullable=False),
        sa.Column("traceback", sa.Text, nullable=True),
        sa.Column("retry_count", sa.Integer, server_default="0"),
        sa.Column("replayed", sa.Boolean, server_default="false"),
        sa.Column("replayed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_dlq_task_id", "dead_letter_entries", ["celery_task_id"])
    op.create_index("ix_dlq_created", "dead_letter_entries", ["created_at"])


def downgrade() -> None:
    op.drop_table("dead_letter_entries")
    op.drop_table("login_attempts")
    op.drop_table("idempotency_keys")
    op.drop_table("audit_logs")
    op.drop_column("jobs", "idempotency_key")
    op.drop_column("pipeline_executions", "trace_id")
    op.drop_column("pipeline_executions", "idempotency_key")
    op.drop_column("pipelines", "version")
    op.drop_column("datasets", "is_quarantined")
    op.drop_column("datasets", "file_hash")
    op.drop_column("users", "failed_login_count")
    op.drop_column("users", "locked_until")
    op.drop_column("users", "is_locked")
