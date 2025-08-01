from datetime import datetime
from typing import Optional

from pydantic import UUID4, BaseModel, EmailStr, Field


class UserBase(BaseModel):
    """Base user schema"""

    email: EmailStr
    name: Optional[str] = None
    locale: str = Field(default="en", description="User's preferred language")


class UserProfile(UserBase):
    """User profile response"""

    id: UUID4
    google_id: str
    profile_picture: Optional[str] = None
    is_active: bool = True
    is_premium: bool = False
    created_at: datetime
    last_login_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    """User update request"""

    name: Optional[str] = None
    locale: Optional[str] = None
    profile_picture: Optional[str] = None


class UserStats(BaseModel):
    """User usage statistics"""

    total_messages: int = Field(default=0, description="Total messages sent")
    total_tokens: int = Field(default=0, description="Total tokens used")
    models_used: dict = Field(default_factory=dict, description="Token usage by model")
    last_30_days: dict = Field(
        default_factory=dict, description="Usage in last 30 days"
    )
