import uuid

from sqlalchemy import Boolean, Column, DateTime, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
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
    is_premium = Column(Boolean, default=False)
    deleted_at = Column(DateTime(timezone=True))  # Soft delete

    # Creation method
    created_via = Column(String(50), default="google_oauth")  # google_oauth, manual, etc.

    def __repr__(self):
        return f"<User {self.email}>"

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
            "is_premium": self.is_premium,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_login_at": (self.last_login_at.isoformat() if self.last_login_at else None),
        }
