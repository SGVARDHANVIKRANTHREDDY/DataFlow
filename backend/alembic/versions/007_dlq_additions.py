from alembic import op
import sqlalchemy as sa

revision = '007_dlq_additions'
down_revision = '006_v10_additions'

def upgrade() -> None:
    op.create_table(
        'dead_letter_queue',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('task_id', sa.String(length=255), nullable=True),
        sa.Column('task_name', sa.String(length=255), nullable=True),
        sa.Column('payload', sa.Text(), nullable=True),
        sa.Column('error_class', sa.String(length=255), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('stack_trace', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=True),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

def downgrade() -> None:
    op.drop_table('dead_letter_queue')
