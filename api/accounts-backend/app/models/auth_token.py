import uuid

from sqlalchemy import Column, DateTime, ForeignKey, String, Uuid
from sqlalchemy.sql import func

from app.core.base import Base


class AuthToken(Base):
    __tablename__ = "auth_tokens"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(
        Uuid,
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
