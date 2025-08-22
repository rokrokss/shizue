import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.unified_cache import cache
from app.models.api_usage import APIUsage
from app.models.user import User
from app.schemas.user import UserProfile, UserStats, UserUpdate

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/me", response_model=UserProfile)
async def get_current_user_profile(current_user: User = Depends(get_current_user)):
    """Get current user profile"""
    return UserProfile.model_validate(current_user)


@router.patch("/me", response_model=UserProfile)
async def update_current_user(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update current user profile"""
    try:
        # Import needed for eager loading
        from sqlalchemy import select, update
        from sqlalchemy.orm import selectinload

        from app.models.user_subscription import UserSubscription

        # Update user fields in database
        update_data = user_update.model_dump(exclude_unset=True)
        if update_data:
            await db.execute(update(User).where(User.id == current_user.id).values(**update_data))
            await db.commit()

        # Reload user with eager loading for subscriptions
        result = await db.execute(
            select(User)
            .where(User.id == current_user.id)
            .options(selectinload(User.subscriptions).selectinload(UserSubscription.subscription_plan))
        )
        updated_user = result.scalar_one()

        # Update cache
        await cache.set_user_profile(str(updated_user.id), updated_user.to_dict())

        return UserProfile.model_validate(updated_user)

    except Exception as e:
        logger.error(f"Failed to update user profile: {e}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update profile",
        )


@router.get("/me/stats", response_model=UserStats)
async def get_user_stats(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Get user usage statistics"""
    try:
        # Try to get from cache first
        cached_stats = await cache.get_user_stats(str(current_user.id))
        if cached_stats:
            return UserStats(**cached_stats)

        # Calculate total usage
        total_result = await db.execute(
            select(
                func.count(APIUsage.id).label("total_messages"),
                func.sum(APIUsage.tokens_input + APIUsage.tokens_output).label("total_tokens"),
            ).where(APIUsage.user_id == current_user.id)
        )
        total_data = total_result.one()

        # Calculate usage by model
        model_result = await db.execute(
            select(
                APIUsage.model,
                func.sum(APIUsage.tokens_input + APIUsage.tokens_output).label("tokens"),
            )
            .where(APIUsage.user_id == current_user.id)
            .group_by(APIUsage.model)
        )
        models_used = {row.model: row.tokens for row in model_result}

        # Calculate last 30 days usage
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        recent_result = await db.execute(
            select(
                func.date(APIUsage.created_at).label("date"),
                func.count(APIUsage.id).label("messages"),
                func.sum(APIUsage.tokens_input + APIUsage.tokens_output).label("tokens"),
            )
            .where(
                APIUsage.user_id == current_user.id,
                APIUsage.created_at >= thirty_days_ago,
            )
            .group_by(func.date(APIUsage.created_at))
        )

        last_30_days = {
            "daily_usage": [
                {
                    "date": row.date.isoformat(),
                    "messages": row.messages,
                    "tokens": row.tokens,
                }
                for row in recent_result
            ]
        }

        stats = UserStats(
            total_messages=total_data.total_messages or 0,
            total_tokens=total_data.total_tokens or 0,
            models_used=models_used,
            last_30_days=last_30_days,
        )

        # Cache the stats for 5 minutes
        await cache.set_user_stats(str(current_user.id), stats.model_dump(), ttl=300)

        return stats

    except Exception as e:
        logger.error(f"Failed to get user stats: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve statistics",
        )


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_current_user(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Delete current user account (soft delete)"""
    try:
        from sqlalchemy import update

        from app.models.auth_token import AuthToken

        # Soft delete user
        await db.execute(
            update(User)
            .where(User.id == current_user.id)
            .values(is_active=False, deleted_at=datetime.now(timezone.utc))
        )

        # Deactivate all auth tokens
        await db.execute(
            update(AuthToken)
            .where(AuthToken.user_id == current_user.id, AuthToken.is_active.is_(True))
            .values(is_active=False, revoked_at=datetime.now(timezone.utc))
        )

        await db.commit()

        # Clear cache
        await cache.delete_user_profile(str(current_user.id))
        await cache.delete_user_stats(str(current_user.id))

        logger.info(f"User account deleted: {current_user.email}")

    except Exception as e:
        logger.error(f"Failed to delete user account: {e}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete account",
        )
