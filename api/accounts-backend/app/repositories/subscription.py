from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import SubscriptionPlan, SubscriptionStatus, UserSubscription
from app.repositories.base import BaseRepository


class SubscriptionPlanRepository(BaseRepository[SubscriptionPlan, None, None]):
    """Repository for subscription plan operations"""

    def __init__(self, session: AsyncSession):
        super().__init__(SubscriptionPlan, session)
        self.session = session

    async def get_by_name(self, name: str) -> Optional[SubscriptionPlan]:
        """Get subscription plan by name"""
        result = await self.session.execute(select(SubscriptionPlan).where(SubscriptionPlan.name == name))
        return result.scalar_one_or_none()

    async def get_active_plans(self) -> List[SubscriptionPlan]:
        """Get all active subscription plans"""
        result = await self.session.execute(
            select(SubscriptionPlan)
            .where(SubscriptionPlan.is_active is True)
            .order_by(SubscriptionPlan.name)  # Order by name instead of sort_order
        )
        return list(result.scalars().all())

    async def get_default_plan(self) -> Optional[SubscriptionPlan]:
        """Get the default subscription plan for new users (free plan)"""
        result = await self.session.execute(select(SubscriptionPlan).where(SubscriptionPlan.name == "free"))
        return result.scalar_one_or_none()


class UserSubscriptionRepository(BaseRepository[UserSubscription, None, None]):
    """Repository for user subscription operations"""

    def __init__(self, session: AsyncSession):
        super().__init__(UserSubscription, session)
        self.session = session

    async def get_user_subscriptions(self, user_id: str, include_expired: bool = False) -> List[UserSubscription]:
        """Get all subscriptions for a user"""
        query = (
            select(UserSubscription)
            .options(selectinload(UserSubscription.subscription_plan))
            .where(UserSubscription.user_id == user_id)
        )

        if not include_expired:
            query = query.where(UserSubscription.status.in_([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL]))

        query = query.order_by(UserSubscription.created_at.desc())
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def get_active_subscription(self, user_id: str) -> Optional[UserSubscription]:
        """Get the current active subscription for a user"""
        now = datetime.now(timezone.utc)
        result = await self.session.execute(
            select(UserSubscription)
            .options(selectinload(UserSubscription.subscription_plan))
            .where(
                and_(
                    UserSubscription.user_id == user_id,
                    UserSubscription.status.in_([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL]),
                    # Check expiration
                    (UserSubscription.expires_at is None) | (UserSubscription.expires_at > now),
                )
            )
            .order_by(UserSubscription.created_at.desc())
        )
        return result.scalar_one_or_none()

    async def cancel_subscription(self, subscription_id: str, immediate: bool = False) -> Optional[UserSubscription]:
        """Cancel a subscription"""
        subscription = await self.get(subscription_id)
        if not subscription:
            return None

        subscription.cancelled_at = datetime.now(timezone.utc)

        if immediate:
            subscription.status = SubscriptionStatus.CANCELLED
            subscription.expires_at = datetime.now(timezone.utc)
        else:
            # Keep active until expiration
            subscription.auto_renew = False

        await self.session.commit()
        return subscription

    async def upgrade_subscription(
        self, user_id: str, new_plan_id: str, payment_method: Optional[str] = None, payment_id: Optional[str] = None
    ) -> UserSubscription:
        """Upgrade or downgrade a user's subscription"""
        # Cancel current subscription if exists
        current = await self.get_active_subscription(user_id)
        if current:
            current.status = SubscriptionStatus.CANCELLED
            current.expires_at = datetime.now(timezone.utc)

        # Create new subscription
        new_subscription = UserSubscription(
            user_id=user_id,
            subscription_plan_id=new_plan_id,
            status=SubscriptionStatus.ACTIVE,
            payment_method=payment_method,
            payment_id=payment_id,
            started_at=datetime.now(timezone.utc),
            auto_renew=True,
        )

        self.session.add(new_subscription)
        await self.session.commit()
        await self.session.refresh(new_subscription)

        return new_subscription

    async def expire_subscriptions(self) -> int:
        """Mark expired subscriptions as expired (for batch processing)"""
        now = datetime.now(timezone.utc)
        result = await self.session.execute(
            select(UserSubscription).where(
                and_(
                    UserSubscription.status == SubscriptionStatus.ACTIVE,
                    UserSubscription.expires_at is not None,
                    UserSubscription.expires_at <= now,
                )
            )
        )

        count = 0
        for subscription in result.scalars():
            subscription.status = SubscriptionStatus.EXPIRED
            count += 1

        if count > 0:
            await self.session.commit()

        return count
