from datetime import datetime
from typing import Optional

from pydantic import UUID4, BaseModel, ConfigDict, Field


class SubscriptionPlanBase(BaseModel):
    """Base subscription plan schema"""

    name: str = Field(..., description="Unique plan identifier (e.g., 'free', 'pro', 'max')")
    display_name: str = Field(..., description="Display name for UI")


class SubscriptionPlanCreate(SubscriptionPlanBase):
    """Create subscription plan request"""

    is_active: bool = Field(True, description="Whether the plan is active")


class SubscriptionPlanResponse(SubscriptionPlanBase):
    """Subscription plan response"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID4
    is_active: bool
    created_at: datetime


class UserSubscriptionBase(BaseModel):
    """Base user subscription schema"""

    subscription_plan_id: UUID4
    status: str = Field("active", description="Subscription status")


class UserSubscriptionCreate(UserSubscriptionBase):
    """Create user subscription request"""

    payment_method: Optional[str] = Field(None, description="Payment method identifier")
    payment_id: Optional[str] = Field(None, description="External payment system ID")
    expires_at: Optional[datetime] = Field(None, description="Subscription expiration date")
    auto_renew: bool = Field(True, description="Auto-renewal enabled")


class UserSubscriptionUpdate(BaseModel):
    """Update user subscription request"""

    status: Optional[str] = None
    expires_at: Optional[datetime] = None
    auto_renew: Optional[bool] = None


class UserSubscriptionResponse(BaseModel):
    """User subscription response"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID4
    user_id: UUID4
    subscription_plan: SubscriptionPlanResponse
    status: str
    started_at: datetime
    expires_at: Optional[datetime]
    auto_renew: bool
    created_at: datetime


class SubscriptionUpgradeRequest(BaseModel):
    """Request to upgrade/downgrade subscription"""

    plan_name: str = Field(..., description="Target plan name (e.g., 'pro', 'max')")
    payment_method: Optional[str] = Field(None, description="Payment method for paid plans")
    payment_id: Optional[str] = Field(None, description="Payment transaction ID")
