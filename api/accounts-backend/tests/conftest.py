import asyncio
import os
import uuid
from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock, patch
import sys

# Set test environment variables before importing settings
# Only set if not already provided (allows CI to override)
if "DATABASE_URL" not in os.environ:
    # Use SQLite for local testing to avoid external dependencies
    os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test.db"

# Set TESTING flag to ensure test mode
os.environ["TESTING"] = "true"
if "JWT_SECRET_KEY" not in os.environ:
    os.environ["JWT_SECRET_KEY"] = "test-secret-key-for-testing-only"
if "GOOGLE_CLIENT_ID" not in os.environ:
    os.environ["GOOGLE_CLIENT_ID"] = "test-google-client-id"
if "GOOGLE_CLIENT_SECRET" not in os.environ:
    os.environ["GOOGLE_CLIENT_SECRET"] = "test-google-client-secret"
if "GOOGLE_REDIRECT_URI" not in os.environ:
    os.environ["GOOGLE_REDIRECT_URI"] = "https://test.shizue.ai/api/v1/auth/google/callback"
if "ALLOWED_ORIGINS" not in os.environ:
    os.environ["ALLOWED_ORIGINS"] = '["http://localhost:3000", "http://localhost:8000"]'

import pytest
import pytest_asyncio

# Initialize logging before importing app modules
# Don't modify logger configuration - let the app handle it
# The app will detect TESTING=true environment variable and use appropriate format

from app.core.config import settings
from app.core.base import Base
from app.core.database import get_db
from app.core.security import create_access_token, create_refresh_token
from app.main import app
from app.models.user import User
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

# Settings are already configured via environment variables above

# Configure pytest-asyncio
pytest_plugins = ("pytest_asyncio",)


# Note: pytest-asyncio now provides its own event_loop fixture,
# so we don't need to define our own


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
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

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
        # Only rollback if the session is still active
        if session.is_active:
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
async def async_session(db_session: AsyncSession) -> AsyncSession:
    """Alias for db_session to match test expectations."""
    yield db_session


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
def mock_google_oauth():
    """Mock Google OAuth service."""
    with patch("app.api.v1.auth.google_oauth") as mock:
        mock.get_authorization_url = AsyncMock(return_value="https://accounts.google.com/oauth/authorize?...")
        mock.verify_and_get_user_info = AsyncMock(
            return_value={
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
        )
        yield mock


@pytest.fixture
def mock_cache():
    """Mock cache service."""
    # Create a single mock object to use everywhere
    mock_cache_obj = MagicMock()
    mock_cache_obj.get_user_profile = AsyncMock(return_value=None)
    mock_cache_obj.set_user_profile = AsyncMock(return_value=True)
    mock_cache_obj.delete_user_profile = AsyncMock(return_value=True)
    mock_cache_obj.get_user_stats = AsyncMock(return_value=None)
    mock_cache_obj.set_user_stats = AsyncMock(return_value=True)
    mock_cache_obj.delete_user_stats = AsyncMock(return_value=True)
    # OAuth state methods removed - now using database

    # Patch all possible locations where cache might be imported
    with (
        patch("app.api.v1.auth.cache", mock_cache_obj),
        patch("app.api.v1.usage.cache", mock_cache_obj),
        patch("app.api.v1.users.cache", mock_cache_obj),
        patch("app.core.dependencies.cache", mock_cache_obj),
        patch("app.core.unified_cache.cache", mock_cache_obj),
    ):
        yield mock_cache_obj
