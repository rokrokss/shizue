import uuid
from datetime import datetime, timedelta, timezone

import pytest
from app.models.api_usage import APIUsage
from app.models.auth_token import AuthToken
from app.models.user import User
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


class TestUsersAPI:
    """Test users API endpoints."""

    @pytest.mark.integration
    async def test_get_current_user_profile(
        self, client: AsyncClient, test_user: User, auth_headers: dict
    ):
        """Test getting current user profile."""
        response = await client.get("/api/v1/users/me", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(test_user.id)
        assert data["email"] == test_user.email
        assert data["name"] == test_user.name
        assert data["google_id"] == test_user.google_id
        assert data["subscription_tier"] == "free"  # Default tier

    @pytest.mark.integration
    async def test_get_current_user_profile_unauthorized(self, client: AsyncClient):
        """Test getting profile without authentication."""
        response = await client.get("/api/v1/users/me")

        assert response.status_code == 401
        assert "Authentication required" in response.json()["detail"]

    @pytest.mark.integration
    async def test_update_current_user(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        auth_headers: dict,
        mock_cache,
    ):
        """Test updating current user profile."""
        update_data = {"name": "Updated Name", "locale": "es"}

        response = await client.patch(
            "/api/v1/users/me", json=update_data, headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["locale"] == "es"

        # Check database was updated
        await db_session.refresh(test_user)
        assert test_user.name == "Updated Name"
        assert test_user.locale == "es"

        # Check cache was updated (called twice: once in get_current_user, once in update)
        assert mock_cache.set_user_profile.call_count == 2

    @pytest.mark.integration
    async def test_update_current_user_partial(
        self, client: AsyncClient, test_user: User, auth_headers: dict, mock_cache
    ):
        """Test partial update of user profile."""
        original_name = test_user.name

        response = await client.patch(
            "/api/v1/users/me", json={"locale": "fr"}, headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert data["locale"] == "fr"
        assert data["name"] == original_name  # Should not change

    @pytest.mark.integration
    async def test_get_user_stats_empty(
        self, client: AsyncClient, test_user: User, auth_headers: dict, mock_cache
    ):
        """Test getting user stats with no usage."""
        mock_cache.get_user_stats.return_value = None

        response = await client.get("/api/v1/users/me/stats", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["total_messages"] == 0
        assert data["total_tokens"] == 0
        assert data["models_used"] == {}
        assert "daily_usage" in data["last_30_days"]

    @pytest.mark.integration
    async def test_get_user_stats_with_usage(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        auth_headers: dict,
        mock_cache,
    ):
        """Test getting user stats with usage data."""
        mock_cache.get_user_stats.return_value = None

        # Create some usage records
        for i in range(5):
            usage = APIUsage(
                user_id=test_user.id,
                model="gpt-4" if i < 3 else "claude-3",
                endpoint="/api/v1/chat",
                tokens_input=100,
                tokens_output=200,
                latency_ms=500,
                status_code=200,
            )
            db_session.add(usage)
        await db_session.commit()

        response = await client.get("/api/v1/users/me/stats", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["total_messages"] == 5
        assert data["total_tokens"] == 1500  # 5 * (100 + 200)
        assert data["models_used"]["gpt-4"] == 900  # 3 * 300
        assert data["models_used"]["claude-3"] == 600  # 2 * 300

        # Check cache was set
        mock_cache.set_user_stats.assert_called_once()

    @pytest.mark.integration
    async def test_get_user_stats_cached(
        self, client: AsyncClient, test_user: User, auth_headers: dict, mock_cache
    ):
        """Test getting cached user stats."""
        cached_stats = {
            "total_messages": 10,
            "total_tokens": 5000,
            "models_used": {"gpt-4": 3000, "claude-3": 2000},
            "last_30_days": {"daily_usage": []},
        }
        mock_cache.get_user_stats.return_value = cached_stats

        response = await client.get("/api/v1/users/me/stats", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data == cached_stats

    @pytest.mark.integration
    async def test_delete_current_user(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        auth_headers: dict,
        mock_cache,
    ):
        """Test deleting current user account."""
        # Create an auth token for the user
        from datetime import datetime, timedelta, timezone
        from app.core.security import create_refresh_token, hash_token

        refresh_token = create_refresh_token(data={"sub": str(test_user.id)})
        auth_token = AuthToken(
            user_id=test_user.id,
            refresh_token_hash=hash_token(refresh_token),
            device_id="test_device",
            expires_at=datetime.now(timezone.utc) + timedelta(days=30),
        )
        db_session.add(auth_token)
        await db_session.commit()

        response = await client.delete("/api/v1/users/me", headers=auth_headers)

        if response.status_code != 204:
            print(f"Response status: {response.status_code}")
            print(f"Response body: {response.text}")

        assert response.status_code == 204

        # Check user was soft deleted
        from sqlalchemy import select
        from app.models.user import User

        result = await db_session.execute(
            select(User).where(User.id == test_user.id)
        )
        updated_user = result.scalar_one()
        assert updated_user.is_active is False
        assert updated_user.deleted_at is not None

        # Check auth tokens were revoked
        result = await db_session.execute(
            select(AuthToken).where(AuthToken.id == auth_token.id)
        )
        updated_token = result.scalar_one()
        assert updated_token.is_active is False
        assert updated_token.revoked_at is not None

        # Check cache was cleared
        mock_cache.delete_user_profile.assert_called_once_with(str(test_user.id))
        mock_cache.delete_user_stats.assert_called_once_with(str(test_user.id))
