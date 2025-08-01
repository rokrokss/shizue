from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone, timedelta
import logging

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.api_usage import APIUsage
from app.schemas.user import UserProfile, UserUpdate, UserStats
from app.core.redis import cache

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/me", response_model=UserProfile)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user)
):
    """Get current user profile"""
    return UserProfile.from_orm(current_user)


@router.patch("/me", response_model=UserProfile)
async def update_current_user(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update current user profile"""
    try:
        # Update user fields
        update_data = user_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(current_user, field, value)
        
        # Save to database
        await db.commit()
        await db.refresh(current_user)
        
        # Update cache
        await cache.set_user_profile(str(current_user.id), current_user.to_dict())
        
        return UserProfile.from_orm(current_user)
        
    except Exception as e:
        logger.error(f"Failed to update user profile: {e}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update profile"
        )


@router.get("/me/stats", response_model=UserStats)
async def get_user_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
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
                func.sum(APIUsage.tokens_input + APIUsage.tokens_output).label("total_tokens")
            ).where(APIUsage.user_id == current_user.id)
        )
        total_data = total_result.one()
        
        # Calculate usage by model
        model_result = await db.execute(
            select(
                APIUsage.model,
                func.sum(APIUsage.tokens_input + APIUsage.tokens_output).label("tokens")
            ).where(
                APIUsage.user_id == current_user.id
            ).group_by(APIUsage.model)
        )
        models_used = {row.model: row.tokens for row in model_result}
        
        # Calculate last 30 days usage
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        recent_result = await db.execute(
            select(
                func.date(APIUsage.created_at).label("date"),
                func.count(APIUsage.id).label("messages"),
                func.sum(APIUsage.tokens_input + APIUsage.tokens_output).label("tokens")
            ).where(
                APIUsage.user_id == current_user.id,
                APIUsage.created_at >= thirty_days_ago
            ).group_by(func.date(APIUsage.created_at))
        )
        
        last_30_days = {
            "daily_usage": [
                {
                    "date": row.date.isoformat(),
                    "messages": row.messages,
                    "tokens": row.tokens
                }
                for row in recent_result
            ]
        }
        
        stats = UserStats(
            total_messages=total_data.total_messages or 0,
            total_tokens=total_data.total_tokens or 0,
            models_used=models_used,
            last_30_days=last_30_days
        )
        
        # Cache the stats for 5 minutes
        await cache.set_user_stats(str(current_user.id), stats.dict(), expire=300)
        
        return stats
        
    except Exception as e:
        logger.error(f"Failed to get user stats: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve statistics"
        )


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_current_user(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete current user account (soft delete)"""
    try:
        # Soft delete user
        current_user.is_active = False
        current_user.deleted_at = datetime.now(timezone.utc)
        
        # Deactivate all auth tokens
        from app.models.auth_token import AuthToken
        result = await db.execute(
            select(AuthToken).where(
                AuthToken.user_id == current_user.id,
                AuthToken.is_active == True
            )
        )
        tokens = result.scalars().all()
        
        for token in tokens:
            token.is_active = False
            token.revoked_at = datetime.now(timezone.utc)
        
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
            detail="Failed to delete account"
        )