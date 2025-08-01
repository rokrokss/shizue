"""User repository implementation."""

from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import CacheTTL
from app.core.logging import logger
from app.models.user import User
from app.repositories.base import BaseRepository
from app.schemas.user import UserCreate, UserUpdate


class UserRepository(BaseRepository[User, UserCreate, UserUpdate]):
    """Repository for User entity operations."""

    def __init__(self, db: AsyncSession):
        super().__init__(User, db)

    async def get_by_email(self, email: str) -> Optional[User]:
        """Get user by email address."""
        # Check cache first
        cache_key = f"user:email:{email}"
        cached_user = await self.cache.get(cache_key)
        if cached_user:
            return User(**cached_user)

        # Query database
        result = await self.db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        # Cache the result
        if user:
            await self.cache.set(cache_key, user.__dict__, ttl=CacheTTL.MEDIUM)
            # Also cache by ID
            await self._cache_record(user)

        return user

    async def get_by_google_id(self, google_id: str) -> Optional[User]:
        """Get user by Google ID."""
        # Check cache first
        cache_key = f"user:google:{google_id}"
        cached_user = await self.cache.get(cache_key)
        if cached_user:
            return User(**cached_user)

        # Query database
        result = await self.db.execute(select(User).where(User.google_id == google_id))
        user = result.scalar_one_or_none()

        # Cache the result
        if user:
            await self.cache.set(cache_key, user.__dict__, ttl=CacheTTL.MEDIUM)
            # Also cache by ID
            await self._cache_record(user)

        return user

    async def get_premium_users(self, skip: int = 0, limit: int = 100):
        """Get all premium users."""
        return await self.get_all(skip=skip, limit=limit, is_premium=True)

    async def get_active_users(self, skip: int = 0, limit: int = 100):
        """Get all active users."""
        return await self.get_all(skip=skip, limit=limit, is_active=True)

    async def update_last_login(self, user_id: UUID) -> Optional[User]:
        """Update user's last login timestamp."""
        from datetime import datetime, timezone

        user = await self.get(user_id, use_cache=False)
        if not user:
            return None

        user.last_login = datetime.now(timezone.utc)
        await self.db.commit()

        # Invalidate caches
        await self._invalidate_cache(user_id)
        await self.cache.delete(f"user:email:{user.email}")
        if user.google_id:
            await self.cache.delete(f"user:google:{user.google_id}")

        # Cache updated user
        await self._cache_record(user)

        logger.info(f"Updated last login for user {user_id}")
        return user

    async def increment_api_calls(self, user_id: UUID) -> Optional[User]:
        """Increment user's API call count."""
        user = await self.get(user_id, use_cache=False)
        if not user:
            return None

        user.total_api_calls = (user.total_api_calls or 0) + 1
        await self.db.commit()

        # Update cache with new value
        await self._cache_record(user)

        return user

    async def search_users(self, search_term: str, skip: int = 0, limit: int = 100):
        """Search users by name or email."""
        return await self.search(search_term=search_term, search_fields=["email", "name"], skip=skip, limit=limit)

    async def invalidate_user_caches(self, user: User) -> None:
        """Invalidate all caches related to a user."""
        await self._invalidate_cache(user.id)
        await self.cache.delete(f"user:email:{user.email}")
        if user.google_id:
            await self.cache.delete(f"user:google:{user.google_id}")
        await self.cache.invalidate_pattern(f"user:{user.id}")

        logger.info(f"Invalidated all caches for user {user.id}")
