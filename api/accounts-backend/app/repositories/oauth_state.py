"""OAuth state repository."""

import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger
from app.models.oauth_state import OAuthState


class OAuthStateRepository:
    """Repository for OAuth state management."""

    def __init__(self, db: AsyncSession):
        """Initialize repository with database session."""
        self.db = db

    async def create_state(self, redirect_uri: Optional[str] = None, code_verifier: Optional[str] = None) -> str:
        """Create a new OAuth state."""
        state = secrets.token_urlsafe(32)

        oauth_state = OAuthState(
            state=state,
            redirect_uri=redirect_uri,
            code_verifier=code_verifier,
            created_at=datetime.now(timezone.utc),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
        )

        self.db.add(oauth_state)
        await self.db.commit()

        logger.debug(f"Created OAuth state: {state}")
        return state

    async def get_state(self, state: str) -> Optional[dict]:
        """Get OAuth state data."""
        result = await self.db.execute(select(OAuthState).where(OAuthState.state == state))
        oauth_state = result.scalar_one_or_none()

        if oauth_state:
            if oauth_state.is_expired():
                # Delete expired state
                await self.delete_state(state)
                logger.warning(f"OAuth state expired: {state}")
                return None

            return oauth_state.to_dict()

        return None

    async def delete_state(self, state: str) -> bool:
        """Delete OAuth state."""
        try:
            await self.db.execute(delete(OAuthState).where(OAuthState.state == state))
            await self.db.commit()
            logger.debug(f"Deleted OAuth state: {state}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete OAuth state {state}: {e}")
            await self.db.rollback()
            return False

    async def cleanup_expired_states(self) -> int:
        """Clean up expired OAuth states."""
        try:
            result = await self.db.execute(delete(OAuthState).where(OAuthState.expires_at < datetime.now(timezone.utc)))
            await self.db.commit()

            deleted_count = result.rowcount
            if deleted_count > 0:
                logger.info(f"Cleaned up {deleted_count} expired OAuth states")

            return deleted_count
        except Exception as e:
            logger.error(f"Failed to cleanup expired OAuth states: {e}")
            await self.db.rollback()
            return 0
