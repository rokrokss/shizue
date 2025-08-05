import uuid
from typing import TYPE_CHECKING, List

from sqlalchemy import Boolean, Column, DateTime, String, Uuid
from sqlalchemy.orm import Mapped, relationship
from sqlalchemy.sql import func

from app.core.base import Base

if TYPE_CHECKING:
    from app.models.user_subscription import UserSubscription


class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    name = Column(String(50), unique=True, nullable=False, index=True)  # 'free', 'pro', 'max', 'enterprise'
    display_name = Column(String(100), nullable=False)  # '무료', 'Pro', 'Max', 'Enterprise'

    # 상태
    is_active = Column(Boolean, default=True)  # 활성 플랜 여부

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    user_subscriptions: Mapped[List["UserSubscription"]] = relationship(
        "UserSubscription", back_populates="subscription_plan"
    )

    def __repr__(self):
        return f"<SubscriptionPlan {self.name}>"

    def to_dict(self):
        return {
            "id": str(self.id),
            "name": self.name,
            "display_name": self.display_name,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
