import asyncio
import pytest
import pytest_asyncio
from typing import AsyncGenerator, Generator
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool
import os
from unittest.mock import patch, MagicMock

from app.main import app
from app.core.database import Base, get_db
from app.core.config import settings
from app.models.user import User
from app.core.security import create_access_token, create_refresh_token
import uuid


# Override settings for testing
settings.TESTING = True
settings.DATABASE_URL = "postgresql+asyncpg://test:test@localhost:5432/test_db"
settings.REDIS_URL = "redis://localhost:6379/1"


@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def test_db():
    """Create a test database."""
    # Create test engine
    engine = create_async_engine(
        settings.DATABASE_URL,
        poolclass=NullPool,
    )

    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Create session factory
    async_session = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    yield async_session

    # Drop tables after tests
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_db) -> AsyncGenerator[AsyncSession, None]:
    """Get a test database session."""
    async with test_db() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Create a test client."""

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def test_user(db_session: AsyncSession) -> User:
    """Create a test user."""
    user = User(
        id=uuid.uuid4(),
        google_id="test_google_id_123",
        email="test@example.com",
        name="Test User",
        profile_picture="https://example.com/photo.jpg",
        locale="en",
        is_active=True,
        is_premium=False,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def auth_headers(test_user: User) -> dict:
    """Create authentication headers with a valid token."""
    access_token = create_access_token(data={"sub": str(test_user.id)})
    return {"Authorization": f"Bearer {access_token}"}


@pytest.fixture
def mock_redis():
    """Mock Redis client."""
    with patch("app.core.redis.redis_client") as mock:
        mock.get.return_value = None
        mock.set.return_value = True
        mock.delete.return_value = True
        mock.ping.return_value = True
        yield mock


@pytest.fixture
def mock_google_oauth():
    """Mock Google OAuth service."""
    with patch("app.services.google_oauth.google_oauth") as mock:
        mock.get_authorization_url.return_value = (
            "https://accounts.google.com/oauth/authorize?..."
        )
        mock.verify_and_get_user_info.return_value = {
            "google_id": "test_google_id_123",
            "email": "test@example.com",
            "email_verified": True,
            "name": "Test User",
            "picture": "https://example.com/photo.jpg",
            "locale": "en",
            "tokens": {
                "access_token": "google_access_token",
                "refresh_token": "google_refresh_token",
                "expires_in": 3600,
            },
        }
        yield mock


@pytest.fixture
def mock_cache():
    """Mock cache service."""
    with patch("app.core.redis.cache") as mock:
        mock.get_user_profile.return_value = None
        mock.set_user_profile.return_value = True
        mock.delete_user_profile.return_value = True
        mock.get_user_stats.return_value = None
        mock.set_user_stats.return_value = True
        mock.get_oauth_state.return_value = {"provider": "google"}
        mock.set_oauth_state.return_value = True
        mock.delete_oauth_state.return_value = True
        yield mock
