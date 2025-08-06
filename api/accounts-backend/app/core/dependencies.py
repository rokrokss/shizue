import logging
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis import cache
from app.core.security import verify_token
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
        # Check if user is active (important for soft-deleted users)
        if cached_user.get("is_active") is False:
            # User is soft-deleted, clear cache and treat as not found
            await cache.delete_user_profile(user_id)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        # Convert string IDs to UUID if necessary
        if isinstance(cached_user.get("id"), str):
            import uuid

            cached_user["id"] = uuid.UUID(cached_user["id"])

        # Remove computed properties that don't have setters
        cached_user_data = cached_user.copy()
        cached_user_data.pop("subscription_tier", None)

        return User(**cached_user_data)

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

    # Check if user is active (for soft-deleted users)
    if not user.is_active:
        # Clear any cached data for this inactive user
        await cache.delete_user_profile(user_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Cache user profile
    await cache.set_user_profile(user_id, user.to_dict())

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
