import logging
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import verify_token
from app.core.unified_cache import cache
from app.models.user import User

logger = logging.getLogger(__name__)

# Security scheme
security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Get current authenticated user"""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify token
    payload = verify_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    # Try to get user from cache first
    cached_user = await cache.get_user_profile(user_id)
    if cached_user:
        # Check if user is active
        if not cached_user.get("is_active", True):
            await cache.delete_user_profile(user_id)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        # Optimized user object creation
        try:
            # Convert string IDs to UUID if necessary
            if isinstance(cached_user.get("id"), str):
                import uuid

                cached_user["id"] = uuid.UUID(cached_user["id"])

            # Remove computed properties
            cached_user_data = {k: v for k, v in cached_user.items() if k != "subscription_tier"}

            return User(**cached_user_data)
        except Exception as e:
            logger.warning(f"Failed to create user from cache: {e}")
            # Clear corrupted cache and fall through to DB

    # Get user from database
    import uuid

    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.models.user_subscription import UserSubscription

    # Convert user_id string to UUID
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID format",
        )

    result = await db.execute(
        select(User)
        .where(User.id == user_uuid)
        .options(
            selectinload(User.subscriptions).selectinload(UserSubscription.subscription_plan)
        )  # Eager load subscriptions and plans
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Check if user is active (optimized)
    if not user.is_active:
        await cache.delete_user_profile(user_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Cache user profile efficiently
    try:
        user_dict = user.to_dict()
        await cache.set_user_profile(user_id, user_dict)
        logger.debug(f"Cached user profile for {user_id}")
    except Exception as e:
        logger.warning(f"Failed to cache user profile: {e}")

    return user


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """Get current authenticated user (optional)"""
    if not credentials:
        return None

    try:
        return await get_current_user(credentials, db)
    except HTTPException:
        return None
