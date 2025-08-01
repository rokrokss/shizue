import uuid

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.core.database import Base


class AuthToken(Base):
    __tablename__ = "auth_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    refresh_token_hash = Column(String(255), unique=True, nullable=False, index=True)
    device_id = Column(String(100))  # Optional device identifier

    # Expiration
    expires_at = Column(DateTime(timezone=True), nullable=False)

    # Revocation
    revoked_at = Column(DateTime(timezone=True))

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<AuthToken user_id={self.user_id}>"

    @property
    def is_expired(self):
        from datetime import datetime, timezone

        return datetime.now(timezone.utc) > self.expires_at

    @property
    def is_revoked(self):
        return self.revoked_at is not None
