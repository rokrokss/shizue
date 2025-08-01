"""AuthToken repository implementation."""

from datetime import datetime, timedelta, timezone
from typing import List, Optional
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import CacheKey, CacheTTL
from app.core.logging import logger
from app.models.auth_token import AuthToken
from app.repositories.base import BaseRepository
from app.schemas.auth import TokenCreate, TokenUpdate


class AuthTokenRepository(BaseRepository[AuthToken, TokenCreate, TokenUpdate]):
    """Repository for AuthToken entity operations."""

    def __init__(self, db: AsyncSession):
        super().__init__(AuthToken, db)

    async def get_by_token(self, token: str) -> Optional[AuthToken]:
        """Get auth token by token value."""
        # Check cache first
        import hashlib

        token_hash = hashlib.sha256(token.encode()).hexdigest()[:16]
        cache_key = CacheKey.auth_token(token_hash)

        cached_token = await self.cache.get(cache_key)
        if cached_token:
            return AuthToken(**cached_token)

        # Query database
        result = await self.db.execute(select(AuthToken).where(AuthToken.token == token))
        auth_token = result.scalar_one_or_none()

        # Cache the result if found and not expired
        if auth_token and not self._is_token_expired(auth_token):
            await self.cache.set(cache_key, auth_token.__dict__, ttl=CacheTTL.SHORT)  # Short TTL for auth tokens

        return auth_token

    async def get_active_token(self, token: str) -> Optional[AuthToken]:
        """Get active (non-expired, non-revoked) token."""
        auth_token = await self.get_by_token(token)

        if not auth_token:
            return None

        # Check if token is valid
        if auth_token.is_revoked or self._is_token_expired(auth_token):
            return None

        # Update last used timestamp
        await self.update_last_used(auth_token.id)

        return auth_token

    async def get_user_tokens(self, user_id: UUID, include_revoked: bool = False) -> List[AuthToken]:
        """Get all tokens for a user."""
        query = select(AuthToken).where(AuthToken.user_id == user_id)

        if not include_revoked:
            query = query.where(AuthToken.is_revoked is False)

        query = query.order_by(AuthToken.created_at.desc())

        result = await self.db.execute(query)
        return result.scalars().all()

    async def revoke_token(self, token_id: UUID) -> bool:
        """Revoke a token."""
        auth_token = await self.get(token_id, use_cache=False)
        if not auth_token:
            return False

        auth_token.is_revoked = True
        auth_token.revoked_at = datetime.now(timezone.utc)
        await self.db.commit()

        # Invalidate cache
        await self._invalidate_token_caches(auth_token)

        logger.info(f"Revoked token {token_id}")
        return True

    async def revoke_user_tokens(self, user_id: UUID) -> int:
        """Revoke all tokens for a user."""
        tokens = await self.get_user_tokens(user_id, include_revoked=False)

        count = 0
        for token in tokens:
            if await self.revoke_token(token.id):
                count += 1

        logger.info(f"Revoked {count} tokens for user {user_id}")
        return count

    async def cleanup_expired_tokens(self) -> int:
        """Remove expired tokens from database."""
        # Find expired tokens
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(AuthToken).where(and_(AuthToken.expires_at < now, AuthToken.is_revoked is False))
        )
        expired_tokens = result.scalars().all()

        # Mark as revoked (soft delete)
        count = 0
        for token in expired_tokens:
            token.is_revoked = True
            token.revoked_at = now
            await self._invalidate_token_caches(token)
            count += 1

        if count > 0:
            await self.db.commit()
            logger.info(f"Cleaned up {count} expired tokens")

        return count

    async def update_last_used(self, token_id: UUID) -> None:
        """Update token's last used timestamp."""
        auth_token = await self.get(token_id, use_cache=False)
        if not auth_token:
            return

        auth_token.last_used_at = datetime.now(timezone.utc)
        await self.db.commit()

        # Update cache with new timestamp
        await self._cache_record(auth_token)

    async def extend_token_expiry(self, token_id: UUID, additional_days: int = 30) -> Optional[AuthToken]:
        """Extend token expiration date."""
        auth_token = await self.get(token_id, use_cache=False)
        if not auth_token or auth_token.is_revoked:
            return None

        # Extend expiry
        auth_token.expires_at = datetime.now(timezone.utc) + timedelta(days=additional_days)
        await self.db.commit()

        # Update cache
        await self._invalidate_token_caches(auth_token)
        await self._cache_record(auth_token)

        logger.info(f"Extended token {token_id} expiry by {additional_days} days")
        return auth_token

    async def get_active_user_tokens_count(self, user_id: UUID) -> int:
        """Get count of active tokens for a user."""
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(AuthToken).where(
                and_(AuthToken.user_id == user_id, AuthToken.is_revoked is False, AuthToken.expires_at > now)
            )
        )
        return len(result.scalars().all())

    async def create_token_with_limits(
        self, user_id: UUID, token_data: TokenCreate, max_tokens_per_user: int = 10
    ) -> Optional[AuthToken]:
        """Create token with user limits."""
        # Check token limit
        active_count = await self.get_active_user_tokens_count(user_id)
        if active_count >= max_tokens_per_user:
            # Revoke oldest token
            tokens = await self.get_user_tokens(user_id)
            if tokens:
                oldest = tokens[-1]
                await self.revoke_token(oldest.id)

        # Create new token
        token_dict = token_data.dict()
        token_dict["user_id"] = user_id
        return await self.create(TokenCreate(**token_dict))

    def _is_token_expired(self, token: AuthToken) -> bool:
        """Check if token is expired."""
        if not token.expires_at:
            return False
        return datetime.now(timezone.utc) > token.expires_at

    async def _invalidate_token_caches(self, token: AuthToken) -> None:
        """Invalidate all caches related to a token."""
        import hashlib

        # Invalidate by ID
        await self._invalidate_cache(token.id)

        # Invalidate by token hash
        token_hash = hashlib.sha256(token.token.encode()).hexdigest()[:16]
        cache_key = CacheKey.auth_token(token_hash)
        await self.cache.delete(cache_key)

        # Invalidate pattern
        await self.cache.invalidate_pattern(f"auth:token:{token.user_id}")
