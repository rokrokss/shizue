import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SubscriptionPlan, User, UserSubscription, SubscriptionStatus


@pytest.mark.asyncio
async def test_subscription_plan_creation(async_session: AsyncSession):
    """Test creating a subscription plan"""
    plan = SubscriptionPlan(
        id=uuid.uuid4(),
        name="test_plan",
        display_name="Test Plan",
        is_active=True
    )

    async_session.add(plan)
    await async_session.commit()
    await async_session.refresh(plan)

    assert plan.id is not None
    assert plan.name == "test_plan"
    assert plan.display_name == "Test Plan"
    assert plan.is_active is True
    assert plan.created_at is not None


@pytest.mark.asyncio
async def test_user_subscription_creation(async_session: AsyncSession):
    """Test creating a user subscription"""
    # Create a user
    user = User(
        id=uuid.uuid4(),
        google_id="test_google_id",
        email="test@example.com",
        name="Test User"
    )
    async_session.add(user)

    # Create a subscription plan
    plan = SubscriptionPlan(
        id=uuid.uuid4(),
        name="pro",
        display_name="Pro",
        is_active=True
    )
    async_session.add(plan)

    # Create a subscription
    subscription = UserSubscription(
        id=uuid.uuid4(),
        user_id=user.id,
        subscription_plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        payment_method="stripe",
        payment_id="pi_test123"
    )
    async_session.add(subscription)

    await async_session.commit()
    await async_session.refresh(subscription)

    assert subscription.id is not None
    assert subscription.user_id == user.id
    assert subscription.subscription_plan_id == plan.id
    assert subscription.status == SubscriptionStatus.ACTIVE
    assert subscription.is_active() is True


@pytest.mark.asyncio
async def test_user_subscription_properties(async_session: AsyncSession):
    """Test User model subscription properties"""
    # Create a user
    user = User(
        id=uuid.uuid4(),
        google_id="test_google_id_2",
        email="test2@example.com",
        name="Test User 2"
    )
    async_session.add(user)

    # Create subscription plans
    free_plan = SubscriptionPlan(
        id=uuid.uuid4(),
        name="free",
        display_name="Free",
        is_active=True
    )
    pro_plan = SubscriptionPlan(
        id=uuid.uuid4(),
        name="pro",
        display_name="Pro",
        is_active=True
    )
    async_session.add_all([free_plan, pro_plan])

    await async_session.commit()

    # Refresh user with relationships to avoid lazy loading issues
    await async_session.refresh(user, ["subscriptions"])

    # Test default state (no subscription)
    assert user.subscription_tier == "free"
    assert user.has_subscription("free") is True
    assert user.has_subscription("pro") is False

    # Add a pro subscription
    subscription = UserSubscription(
        id=uuid.uuid4(),
        user_id=user.id,
        subscription_plan_id=pro_plan.id,
        status=SubscriptionStatus.ACTIVE
    )
    async_session.add(subscription)
    await async_session.commit()

    # Refresh user with relationships
    result = await async_session.execute(
        select(User).where(User.id == user.id)
    )
    user = result.scalar_one()

    # Load subscriptions relationship
    await async_session.refresh(user, ["subscriptions"])
    for sub in user.subscriptions:
        await async_session.refresh(sub, ["subscription_plan"])

    # Test with pro subscription
    assert user.subscription_tier == "pro"
    assert user.has_subscription("pro") is True
    assert user.has_subscription("pro", "max", "enterprise") is True


@pytest.mark.asyncio
async def test_subscription_expiration(async_session: AsyncSession):
    """Test subscription expiration logic"""
    # Create a user and plan
    user = User(
        id=uuid.uuid4(),
        google_id="test_google_id_3",
        email="test3@example.com"
    )
    plan = SubscriptionPlan(
        id=uuid.uuid4(),
        name="pro",
        display_name="Pro"
    )
    async_session.add_all([user, plan])

    # Create an expired subscription
    past_date = datetime.now(timezone.utc) - timedelta(days=1)
    expired_subscription = UserSubscription(
        id=uuid.uuid4(),
        user_id=user.id,
        subscription_plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        expires_at=past_date
    )
    async_session.add(expired_subscription)
    await async_session.commit()

    # Test that expired subscription is not active
    assert expired_subscription.is_active() is False

    # Create an active subscription with future expiration
    future_date = datetime.now(timezone.utc) + timedelta(days=30)
    active_subscription = UserSubscription(
        id=uuid.uuid4(),
        user_id=user.id,
        subscription_plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        expires_at=future_date
    )
    async_session.add(active_subscription)
    await async_session.commit()

    # Test that active subscription is active
    assert active_subscription.is_active() is True

    # Create a cancelled subscription
    cancelled_subscription = UserSubscription(
        id=uuid.uuid4(),
        user_id=user.id,
        subscription_plan_id=plan.id,
        status=SubscriptionStatus.CANCELLED
    )
    async_session.add(cancelled_subscription)
    await async_session.commit()

    # Test that cancelled subscription is not active
    assert cancelled_subscription.is_active() is False


@pytest.mark.asyncio
async def test_user_to_dict_with_subscription(async_session: AsyncSession):
    """Test User.to_dict() includes subscription information"""
    # Create user with subscription
    user = User(
        id=uuid.uuid4(),
        google_id="test_google_id_4",
        email="test4@example.com",
        name="Test User 4"
    )
    plan = SubscriptionPlan(
        id=uuid.uuid4(),
        name="max",
        display_name="Max"
    )
    subscription = UserSubscription(
        id=uuid.uuid4(),
        user_id=user.id,
        subscription_plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE
    )

    async_session.add_all([user, plan, subscription])
    await async_session.commit()

    # Refresh with relationships
    await async_session.refresh(user, ["subscriptions"])
    for sub in user.subscriptions:
        await async_session.refresh(sub, ["subscription_plan"])

    user_dict = user.to_dict()

    assert "subscription_tier" in user_dict
    assert user_dict["subscription_tier"] == "max"
