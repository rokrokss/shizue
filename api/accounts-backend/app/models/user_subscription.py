import uuid
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Column, DateTime
from sqlalchemy import Enum as SQLEnum
from sqlalchemy import ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, relationship
from sqlalchemy.sql import func

from app.core.base import Base

if TYPE_CHECKING:
    from app.models.subscription_plan import SubscriptionPlan
    from app.models.user import User


class SubscriptionStatus(str, Enum):
    ACTIVE = "active"
    CANCELLED = "cancelled"
    EXPIRED = "expired"
    PENDING = "pending"  # 결제 대기 중
    TRIAL = "trial"  # 체험 기간


class UserSubscription(Base):
    __tablename__ = "user_subscriptions"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)

    # Foreign keys
    user_id = Column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
    subscription_plan_id = Column(Uuid, ForeignKey("subscription_plans.id"), nullable=False, index=True)

    # Subscription details
    status = Column(SQLEnum(SubscriptionStatus), nullable=False, default=SubscriptionStatus.ACTIVE, index=True)

    # Payment info (optional)
    payment_method = Column(String(50))  # 'stripe', 'paddle', 'manual', etc.
    payment_id = Column(String(255))  # External payment system ID

    # Period
    started_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expires_at = Column(DateTime(timezone=True))  # NULL means no expiration
    cancelled_at = Column(DateTime(timezone=True))  # When user cancelled

    # Auto-renewal
    auto_renew = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="subscriptions")
    subscription_plan: Mapped["SubscriptionPlan"] = relationship(
        "SubscriptionPlan", back_populates="user_subscriptions"
    )

    def __repr__(self):
        return f"<UserSubscription user_id={self.user_id} plan={self.subscription_plan_id} status={self.status}>"

    def is_active(self):
        """Check if subscription is currently active"""
        from datetime import datetime, timezone

        if self.status not in [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL]:
            return False

        if self.expires_at and self.expires_at < datetime.now(timezone.utc):
            return False

        return True

    def to_dict(self):
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "subscription_plan_id": str(self.subscription_plan_id),
            "status": self.status.value if self.status else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "auto_renew": self.auto_renew,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
