import json
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.api_usage import APIUsage
from app.models.user import User
from app.schemas.usage import ModelUsage, UsageCreate, UsageRecord, UsageSummary

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/", response_model=UsageRecord, status_code=status.HTTP_201_CREATED)
async def create_usage_record(
    usage: UsageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new API usage record"""
    try:
        # Create usage record
        usage_record = APIUsage(
            user_id=current_user.id,
            model=usage.model,
            endpoint=usage.endpoint,
            tokens_input=usage.tokens_input,
            tokens_output=usage.tokens_output,
            latency_ms=usage.latency_ms,
            status_code=usage.status_code,
            error_message=usage.error_message,
            metadata=json.dumps(usage.metadata) if usage.metadata else None,
        )

        db.add(usage_record)
        await db.commit()
        await db.refresh(usage_record)

        # Invalidate user stats cache
        from app.core.redis import cache

        await cache.delete_user_stats(str(current_user.id))

        return UsageRecord.from_orm(usage_record)

    except Exception as e:
        logger.error(f"Failed to create usage record: {e}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to record usage",
        )


@router.get("/", response_model=List[UsageRecord])
async def get_usage_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=100, le=1000, description="Maximum records to return"),
    offset: int = Query(default=0, ge=0, description="Number of records to skip"),
    model: Optional[str] = Query(None, description="Filter by model"),
    start_date: Optional[datetime] = Query(None, description="Start date filter"),
    end_date: Optional[datetime] = Query(None, description="End date filter"),
):
    """Get user's API usage history"""
    try:
        # Build query
        query = select(APIUsage).where(APIUsage.user_id == current_user.id)

        # Apply filters
        if model:
            query = query.where(APIUsage.model == model)

        if start_date:
            query = query.where(APIUsage.created_at >= start_date)

        if end_date:
            query = query.where(APIUsage.created_at <= end_date)

        # Order by newest first
        query = query.order_by(APIUsage.created_at.desc())

        # Apply pagination
        query = query.limit(limit).offset(offset)

        result = await db.execute(query)
        usage_records = result.scalars().all()

        return [UsageRecord.from_orm(record) for record in usage_records]

    except Exception as e:
        logger.error(f"Failed to get usage history: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve usage history",
        )


@router.get("/summary", response_model=UsageSummary)
async def get_usage_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    period: str = Query(
        default="month", regex="^(day|week|month)$", description="Time period"
    ),
):
    """Get usage summary for specified period"""
    try:
        # Calculate date range
        now = datetime.now(timezone.utc)
        if period == "day":
            start_date = now - timedelta(days=1)
        elif period == "week":
            start_date = now - timedelta(days=7)
        else:  # month
            start_date = now - timedelta(days=30)

        # Get total usage for period
        total_result = await db.execute(
            select(
                func.count(APIUsage.id).label("total_messages"),
                func.sum(APIUsage.tokens_input + APIUsage.tokens_output).label(
                    "total_tokens"
                ),
            ).where(
                and_(
                    APIUsage.user_id == current_user.id,
                    APIUsage.created_at >= start_date,
                )
            )
        )
        total_data = total_result.one()

        # Get usage by model
        model_result = await db.execute(
            select(
                APIUsage.model,
                func.count(APIUsage.id).label("messages"),
                func.sum(APIUsage.tokens_input + APIUsage.tokens_output).label(
                    "tokens"
                ),
            )
            .where(
                and_(
                    APIUsage.user_id == current_user.id,
                    APIUsage.created_at >= start_date,
                )
            )
            .group_by(APIUsage.model)
        )

        models = {
            row.model: {"messages": row.messages, "tokens": row.tokens}
            for row in model_result
        }

        # Get daily breakdown
        daily_result = await db.execute(
            select(
                func.date(APIUsage.created_at).label("date"),
                func.count(APIUsage.id).label("messages"),
                func.sum(APIUsage.tokens_input + APIUsage.tokens_output).label(
                    "tokens"
                ),
            )
            .where(
                and_(
                    APIUsage.user_id == current_user.id,
                    APIUsage.created_at >= start_date,
                )
            )
            .group_by(func.date(APIUsage.created_at))
            .order_by(func.date(APIUsage.created_at))
        )

        daily_breakdown = [
            {
                "date": row.date.isoformat(),
                "messages": row.messages,
                "tokens": row.tokens,
            }
            for row in daily_result
        ]

        return UsageSummary(
            period=period,
            total_messages=total_data.total_messages or 0,
            total_tokens=total_data.total_tokens or 0,
            models=models,
            daily_breakdown=daily_breakdown,
        )

    except Exception as e:
        logger.error(f"Failed to get usage summary: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve usage summary",
        )


@router.get("/models", response_model=List[ModelUsage])
async def get_model_usage(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    days: int = Query(
        default=30, ge=1, le=365, description="Number of days to analyze"
    ),
):
    """Get usage statistics by model"""
    try:
        start_date = datetime.now(timezone.utc) - timedelta(days=days)

        # Get usage stats by model
        result = await db.execute(
            select(
                APIUsage.model,
                func.count(APIUsage.id).label("messages"),
                func.sum(APIUsage.tokens_input + APIUsage.tokens_output).label(
                    "tokens"
                ),
                func.avg(APIUsage.latency_ms).label("avg_latency"),
                func.sum(func.cast(APIUsage.status_code >= 400, int)).label("errors"),
            )
            .where(
                and_(
                    APIUsage.user_id == current_user.id,
                    APIUsage.created_at >= start_date,
                )
            )
            .group_by(APIUsage.model)
        )

        model_usage_list = []
        for row in result:
            error_rate = (row.errors / row.messages * 100) if row.messages > 0 else 0

            model_usage_list.append(
                ModelUsage(
                    model=row.model,
                    messages=row.messages,
                    tokens=row.tokens or 0,
                    avg_latency_ms=(
                        round(row.avg_latency, 2) if row.avg_latency else None
                    ),
                    error_rate=round(error_rate, 2),
                )
            )

        return model_usage_list

    except Exception as e:
        logger.error(f"Failed to get model usage: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve model usage",
        )
