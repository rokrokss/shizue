"""OAuth state model for secure state management."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import Column, DateTime, String, Text

from app.core.base import Base


class OAuthState(Base):
    """OAuth state storage for secure authentication flow."""

    __tablename__ = "oauth_states"

    state = Column(String(255), primary_key=True, index=True)
    redirect_uri = Column(Text, nullable=True)
    code_verifier = Column(String(255), nullable=True)  # For PKCE
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc) + timedelta(minutes=10))

    def is_expired(self) -> bool:
        """Check if the state has expired."""
        return datetime.now(timezone.utc) > self.expires_at

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "state": self.state,
            "redirect_uri": self.redirect_uri,
            "code_verifier": self.code_verifier,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
        }
