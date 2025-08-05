import uuid
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, Column, DateTime, String, Text, Uuid
from sqlalchemy.orm import Mapped, relationship
from sqlalchemy.sql import func

from app.core.base import Base

if TYPE_CHECKING:
    from app.models.user_subscription import UserSubscription


class User(Base):
    __tablename__ = "users"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    google_id = Column(String(255), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255))
    profile_picture = Column(String(500))
    locale = Column(String(10), default="en")
    timezone = Column(String(50), default="UTC")

    # Settings stored as JSON
    settings = Column(Text)  # JSON string for user preferences

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_login_at = Column(DateTime(timezone=True))

    # Status
    is_active = Column(Boolean, default=True)
    deleted_at = Column(DateTime(timezone=True))  # Soft delete

    # Creation method
    created_via = Column(String(50), default="google_oauth")  # google_oauth, manual, etc.

    # Relationships
    subscriptions: Mapped[List["UserSubscription"]] = relationship(
        "UserSubscription", back_populates="user", order_by="desc(UserSubscription.created_at)"
    )

    def __repr__(self):
        return f"<User {self.email}>"

    @property
    def current_subscription(self) -> Optional["UserSubscription"]:
        """Get the current active subscription"""
        if not self.subscriptions:
            return None

        # Find the first active subscription
        for subscription in self.subscriptions:
            if subscription.is_active():
                return subscription

        return None

    @property
    def subscription_tier(self) -> str:
        """Get the current subscription tier name"""
        current = self.current_subscription
        if current and current.subscription_plan:
            return current.subscription_plan.name
        return "free"  # Default to free if no active subscription

    def has_subscription(self, *tier_names: str) -> bool:
        """Check if user has any of the specified subscription tiers"""
        current_tier = self.subscription_tier
        return current_tier in tier_names

    def to_dict(self):
        return {
            "id": str(self.id),
            "google_id": self.google_id,
            "email": self.email,
            "name": self.name,
            "profile_picture": self.profile_picture,
            "locale": self.locale,
            "timezone": self.timezone,
            "is_active": self.is_active,
            "subscription_tier": self.subscription_tier,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_login_at": (self.last_login_at.isoformat() if self.last_login_at else None),
        }
