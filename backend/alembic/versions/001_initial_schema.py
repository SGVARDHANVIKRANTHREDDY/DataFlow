"""Initial schema: users, datasets, pipelines, executions, jobs

Revision ID: 001
Revises:
Create Date: 2025-01-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── users ─────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # ── datasets ──────────────────────────────────────────────
    op.create_table(
        "datasets",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("original_filename", sa.String(500), nullable=False),
        sa.Column("s3_key", sa.String(1000), nullable=False),
        sa.Column("row_count", sa.Integer, server_default="0"),
        sa.Column("col_count", sa.Integer, server_default="0"),
        sa.Column("file_size_bytes", sa.BigInteger, server_default="0"),
        sa.Column("headers", sa.JSON, nullable=True),
        sa.Column("profile", sa.JSON, nullable=True),
        sa.Column("profiling_status", sa.String(20), server_default="'pending'"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_datasets_user_id", "datasets", ["user_id"])
    op.create_index("ix_datasets_user_created", "datasets", ["user_id", "created_at"])

    # ── pipelines ─────────────────────────────────────────────
    op.create_table(
        "pipelines",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("dataset_id", sa.Integer, sa.ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("steps", sa.JSON, server_default="'[]'"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_pipelines_user_id", "pipelines", ["user_id"])
    op.create_index("ix_pipelines_user_updated", "pipelines", ["user_id", "updated_at"])

    # ── pipeline_executions ───────────────────────────────────
    op.create_table(
        "pipeline_executions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("pipeline_id", sa.Integer, sa.ForeignKey("pipelines.id", ondelete="CASCADE"), nullable=False),
        sa.Column("input_dataset_id", sa.Integer, sa.ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("job_id", sa.String(255), nullable=True),
        sa.Column("status", sa.String(20), server_default="'pending'"),
        sa.Column("report", sa.JSON, nullable=True),
        sa.Column("output_s3_key", sa.String(1000), nullable=True),
        sa.Column("output_row_count", sa.Integer, nullable=True),
        sa.Column("duration_ms", sa.Float, nullable=True),
        sa.Column("schema_warnings", sa.JSON, nullable=True),
        sa.Column("error_detail", sa.Text, nullable=True),
        sa.Column("retry_count", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_executions_pipeline_id", "pipeline_executions", ["pipeline_id"])
    op.create_index("ix_executions_pipeline_created", "pipeline_executions", ["pipeline_id", "created_at"])
    op.create_index("ix_executions_job_id", "pipeline_executions", ["job_id"])

    # ── jobs ──────────────────────────────────────────────────
    op.create_table(
        "jobs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("celery_task_id", sa.String(255), nullable=True),
        sa.Column("job_type", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), server_default="'pending'"),
        sa.Column("payload", sa.JSON, server_default="'{}'"),
        sa.Column("result", sa.JSON, nullable=True),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("progress", sa.Integer, server_default="0"),
        sa.Column("retry_count", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_jobs_user_id", "jobs", ["user_id"])
    op.create_index("ix_jobs_user_created", "jobs", ["user_id", "created_at"])
    op.create_index("ix_jobs_celery_task_id", "jobs", ["celery_task_id"], unique=True)
    op.create_index("ix_jobs_status", "jobs", ["status"])


def downgrade() -> None:
    op.drop_table("jobs")
    op.drop_table("pipeline_executions")
    op.drop_table("pipelines")
    op.drop_table("datasets")
    op.drop_table("users")
