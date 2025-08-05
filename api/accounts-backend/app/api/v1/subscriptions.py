from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.models import User
from app.repositories.subscription import SubscriptionPlanRepository, UserSubscriptionRepository
from app.schemas.subscription import SubscriptionPlanResponse, SubscriptionUpgradeRequest, UserSubscriptionResponse

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


@router.get("/plans", response_model=List[SubscriptionPlanResponse])
async def get_subscription_plans(
    db: AsyncSession = Depends(get_db),
):
    """Get all available subscription plans"""
    repo = SubscriptionPlanRepository(db)
    plans = await repo.get_active_plans()
    return plans


@router.get("/current", response_model=UserSubscriptionResponse)
async def get_current_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current user's active subscription"""
    repo = UserSubscriptionRepository(db)
    subscription = await repo.get_active_subscription(str(current_user.id))

    if not subscription:
        # Return free plan as default
        plan_repo = SubscriptionPlanRepository(db)
        free_plan = await plan_repo.get_by_name("free")
        if not free_plan:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Default subscription plan not found"
            )

        # Create a virtual subscription response for free users
        return {
            "id": str(current_user.id),  # Use user ID as placeholder
            "user_id": str(current_user.id),
            "subscription_plan": free_plan,
            "status": "active",
            "started_at": current_user.created_at,
            "expires_at": None,
            "auto_renew": False,
            "created_at": current_user.created_at,
        }

    return subscription


@router.get("/history", response_model=List[UserSubscriptionResponse])
async def get_subscription_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    include_expired: bool = True,
):
    """Get user's subscription history"""
    repo = UserSubscriptionRepository(db)
    subscriptions = await repo.get_user_subscriptions(str(current_user.id), include_expired=include_expired)
    return subscriptions


@router.post("/upgrade", response_model=UserSubscriptionResponse)
async def upgrade_subscription(
    request: SubscriptionUpgradeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upgrade or downgrade user's subscription"""
    plan_repo = SubscriptionPlanRepository(db)
    target_plan = await plan_repo.get_by_name(request.plan_name)

    if not target_plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Subscription plan '{request.plan_name}' not found"
        )

    if not target_plan.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Subscription plan '{request.plan_name}' is not available"
        )

    # Check if downgrading from paid to free requires special handling
    current_tier = current_user.subscription_tier
    if current_tier != "free" and request.plan_name == "free":
        # Handle downgrade logic (e.g., schedule for end of billing period)
        pass

    # TODO: Add payment validation logic when payment system is implemented
    # For now, allow all plan changes

    sub_repo = UserSubscriptionRepository(db)
    new_subscription = await sub_repo.upgrade_subscription(
        user_id=str(current_user.id),
        new_plan_id=str(target_plan.id),
        payment_method=request.payment_method,
        payment_id=request.payment_id,
    )

    # Load the plan relationship
    await db.refresh(new_subscription, ["subscription_plan"])

    return new_subscription


@router.post("/cancel", response_model=UserSubscriptionResponse)
async def cancel_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    immediate: bool = False,
):
    """Cancel user's current subscription"""
    repo = UserSubscriptionRepository(db)
    subscription = await repo.get_active_subscription(str(current_user.id))

    if not subscription:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active subscription found")

    if subscription.subscription_plan.name == "free":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot cancel free subscription")

    cancelled = await repo.cancel_subscription(str(subscription.id), immediate=immediate)

    return cancelled
