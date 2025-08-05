"""Initial schema

Revision ID: 001
Revises:
Create Date: 2024-01-01 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create subscription_plans table first (referenced by user_subscriptions)
    op.create_table(
        "subscription_plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("display_name", sa.String(length=100), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=True, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_subscription_plans_name"), "subscription_plans", ["name"], unique=True)

    # Create users table
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("google_id", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("profile_picture", sa.String(length=500), nullable=True),
        sa.Column("locale", sa.String(length=10), nullable=True, server_default="en"),
        sa.Column(
            "timezone", sa.String(length=50), nullable=True, server_default="UTC"
        ),
        sa.Column("settings", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True, server_default="true"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_via",
            sa.String(length=50),
            nullable=True,
            server_default="google_oauth",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_google_id"), "users", ["google_id"], unique=True)

    # Create auth_tokens table
    op.create_table(
        "auth_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("device_id", sa.String(length=100), nullable=True),
        sa.Column("user_agent", sa.String(length=500), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True, server_default="true"),
        sa.Column("usage_count", sa.Integer(), nullable=True, server_default="0"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_auth_tokens_token_hash"), "auth_tokens", ["token_hash"], unique=True
    )
    op.create_index(
        op.f("ix_auth_tokens_user_id"), "auth_tokens", ["user_id"], unique=False
    )

    # Create api_usage table
    op.create_table(
        "api_usage",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("model", sa.String(length=100), nullable=False),
        sa.Column("endpoint", sa.String(length=255), nullable=False),
        sa.Column("tokens_input", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("tokens_output", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("request_metadata", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_api_usage_created_at"), "api_usage", ["created_at"], unique=False
    )
    op.create_index(op.f("ix_api_usage_model"), "api_usage", ["model"], unique=False)
    op.create_index(
        op.f("ix_api_usage_user_id"), "api_usage", ["user_id"], unique=False
    )

    # Create user_subscriptions table
    op.create_table(
        "user_subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("subscription_plan_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM('active', 'cancelled', 'expired', 'pending', 'trial', name='subscription_status', create_type=True),
            nullable=False,
            server_default="active"
        ),
        sa.Column("payment_method", sa.String(length=50), nullable=True),
        sa.Column("payment_id", sa.String(length=255), nullable=True),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()")
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("auto_renew", sa.Boolean(), nullable=True, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subscription_plan_id"], ["subscription_plans.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_user_subscriptions_user_id"), "user_subscriptions", ["user_id"], unique=False
    )
    op.create_index(
        op.f("ix_user_subscriptions_subscription_plan_id"), "user_subscriptions", ["subscription_plan_id"], unique=False
    )
    op.create_index(
        "idx_user_subscriptions_user_status", "user_subscriptions", ["user_id", "status"]
    )
    op.create_index(
        "idx_user_subscriptions_expires_at", "user_subscriptions", ["expires_at"],
        postgresql_where=sa.text("expires_at IS NOT NULL")
    )

    # Insert default subscription plans
    op.execute("""
        INSERT INTO subscription_plans (id, name, display_name, is_active)
        VALUES
        (gen_random_uuid(), 'free', 'Free', true),
        (gen_random_uuid(), 'pro', 'Pro', true),
        (gen_random_uuid(), 'max', 'Max', true),
        (gen_random_uuid(), 'enterprise', 'Enterprise', true)
    """)


def downgrade() -> None:
    # Drop tables in reverse order
    op.drop_index("idx_user_subscriptions_expires_at", table_name="user_subscriptions")
    op.drop_index("idx_user_subscriptions_user_status", table_name="user_subscriptions")
    op.drop_index(op.f("ix_user_subscriptions_subscription_plan_id"), table_name="user_subscriptions")
    op.drop_index(op.f("ix_user_subscriptions_user_id"), table_name="user_subscriptions")
    op.drop_table("user_subscriptions")

    # Drop enum type
    op.execute("DROP TYPE IF EXISTS subscription_status")

    op.drop_index(op.f("ix_api_usage_user_id"), table_name="api_usage")
    op.drop_index(op.f("ix_api_usage_model"), table_name="api_usage")
    op.drop_index(op.f("ix_api_usage_created_at"), table_name="api_usage")
    op.drop_table("api_usage")

    op.drop_index(op.f("ix_auth_tokens_user_id"), table_name="auth_tokens")
    op.drop_index(op.f("ix_auth_tokens_token_hash"), table_name="auth_tokens")
    op.drop_table("auth_tokens")

    op.drop_index(op.f("ix_users_google_id"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")

    op.drop_index(op.f("ix_subscription_plans_name"), table_name="subscription_plans")
    op.drop_table("subscription_plans")
