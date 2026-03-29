"""v10: super_admin column, global audit sequence, performance indexes

Revision ID: 006
Revises: 005
Create Date: 2025-01-06
"""
from alembic import op
import sqlalchemy as sa

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # super_admin role
    op.add_column("users", sa.Column("is_super_admin", sa.Boolean, server_default="false"))
    op.create_index("ix_users_is_super_admin", "users", ["is_super_admin"])

    # Global audit sequence (lock-free ordering)
    op.execute("CREATE SEQUENCE IF NOT EXISTS audit_global_seq START 1 INCREMENT 1 NO CYCLE")

    # Add global_seq column to audit_logs
    op.add_column("audit_logs", sa.Column("global_seq", sa.BigInteger, nullable=True))
    op.create_index("ix_audit_global_seq", "audit_logs", ["global_seq"])

    # Promote first user to super_admin if SUPER_ADMIN_EMAIL is set
    # (handled in application startup, not in migration)


def downgrade() -> None:
    op.drop_index("ix_audit_global_seq", "audit_logs")
    op.drop_column("audit_logs", "global_seq")
    op.execute("DROP SEQUENCE IF EXISTS audit_global_seq")
    op.drop_index("ix_users_is_super_admin", "users")
    op.drop_column("users", "is_super_admin")
