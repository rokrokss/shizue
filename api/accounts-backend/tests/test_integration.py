import json
from datetime import datetime, timedelta, timezone

import pytest
from app.core.security import create_refresh_token, hash_token
from app.models.api_usage import APIUsage
from app.models.auth_token import AuthToken
from app.models.user import User
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


class TestIntegrationFlow:
    """End-to-end integration tests."""

    @pytest.mark.integration
    @pytest.mark.slow
    async def test_complete_auth_flow(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        mock_google_oauth,
        mock_cache,
    ):
        """Test complete authentication flow from login to logout."""
        # Step 1: Get login URL
        response = await client.get("/v1/auth/login/google")
        assert response.status_code == 200

        # Step 2: Simulate OAuth callback
        mock_cache.get_oauth_state.return_value = {"provider": "google"}
        response = await client.get(
            "/v1/auth/callback/google",
            params={"code": "test_code", "state": "test_state"},
        )
        assert response.status_code == 307

        # Extract tokens from redirect URL
        location = response.headers["location"]
        access_token = location.split("access_token=")[1].split("&")[0]
        refresh_token = location.split("refresh_token=")[1]

        # Step 3: Use access token to get user profile
        headers = {"Authorization": f"Bearer {access_token}"}
        response = await client.get("/v1/users/me", headers=headers)
        assert response.status_code == 200
        user_data = response.json()
        assert user_data["email"] == "test@example.com"

        # Step 4: Refresh access token
        response = await client.post(
            "/v1/auth/refresh", json={"refresh_token": refresh_token}
        )
        assert response.status_code == 200
        new_tokens = response.json()
        assert "access_token" in new_tokens

        # Step 5: Logout
        response = await client.post(
            "/v1/auth/logout", params={"refresh_token": refresh_token}
        )
        assert response.status_code == 204

        # Step 6: Verify token is revoked
        response = await client.post(
            "/v1/auth/refresh", json={"refresh_token": refresh_token}
        )
        assert response.status_code == 401

    @pytest.mark.integration
    @pytest.mark.slow
    async def test_usage_tracking_flow(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        auth_headers: dict,
        mock_cache,
    ):
        """Test complete usage tracking flow."""
        # Step 1: Check initial stats (should be empty)
        mock_cache.get_user_stats.return_value = None
        response = await client.get("/v1/users/me/stats", headers=auth_headers)
        assert response.status_code == 200
        initial_stats = response.json()
        assert initial_stats["total_messages"] == 0

        # Step 2: Create multiple usage records
        models = ["gpt-4", "claude-3", "gpt-3.5-turbo"]
        for i in range(10):
            usage_data = {
                "model": models[i % 3],
                "endpoint": "/v1/chat/completions",
                "tokens_input": 100 + i * 10,
                "tokens_output": 200 + i * 20,
                "latency_ms": 500 + i * 50,
                "status_code": 200 if i < 9 else 400,  # Last one fails
                "error_message": "Rate limit exceeded" if i == 9 else None,
            }
            response = await client.post(
                "/v1/usage/", json=usage_data, headers=auth_headers
            )
            assert response.status_code == 201

        # Step 3: Get usage history
        response = await client.get("/v1/usage/", headers=auth_headers)
        assert response.status_code == 200
        history = response.json()
        assert len(history) == 10

        # Step 4: Get usage summary
        response = await client.get(
            "/v1/usage/summary", params={"period": "month"}, headers=auth_headers
        )
        assert response.status_code == 200
        summary = response.json()
        assert summary["total_messages"] == 10

        # Step 5: Get model-specific stats
        response = await client.get(
            "/v1/usage/models", params={"days": 30}, headers=auth_headers
        )
        assert response.status_code == 200
        model_stats = response.json()
        assert len(model_stats) == 3  # Three different models

        # Step 6: Get updated user stats
        mock_cache.get_user_stats.return_value = None
        response = await client.get("/v1/users/me/stats", headers=auth_headers)
        assert response.status_code == 200
        final_stats = response.json()
        assert final_stats["total_messages"] == 10
        assert final_stats["total_tokens"] > 0

    @pytest.mark.integration
    @pytest.mark.slow
    async def test_user_lifecycle(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        mock_google_oauth,
        mock_cache,
    ):
        """Test complete user lifecycle from creation to deletion."""
        # Step 1: Create user via OAuth
        mock_cache.get_oauth_state.return_value = {"provider": "google"}
        mock_google_oauth.verify_and_get_user_info.return_value["email"] = (
            "lifecycle@example.com"
        )
        mock_google_oauth.verify_and_get_user_info.return_value["google_id"] = (
            "lifecycle_google_123"
        )

        response = await client.get(
            "/v1/auth/callback/google",
            params={"code": "test_code", "state": "test_state"},
        )
        assert response.status_code == 307

        # Extract access token
        location = response.headers["location"]
        access_token = location.split("access_token=")[1].split("&")[0]
        headers = {"Authorization": f"Bearer {access_token}"}

        # Step 2: Get initial profile
        response = await client.get("/v1/users/me", headers=headers)
        assert response.status_code == 200
        profile = response.json()
        user_id = profile["id"]

        # Step 3: Update profile
        response = await client.patch(
            "/v1/users/me",
            json={
                "name": "Updated User",
                "locale": "ja",
                "profile_picture": "https://example.com/new-photo.jpg",
            },
            headers=headers,
        )
        assert response.status_code == 200
        updated = response.json()
        assert updated["name"] == "Updated User"
        assert updated["locale"] == "ja"

        # Step 4: Create some usage
        for _ in range(5):
            response = await client.post(
                "/v1/usage/",
                json={
                    "model": "gpt-4",
                    "endpoint": "/v1/chat",
                    "tokens_input": 100,
                    "tokens_output": 200,
                },
                headers=headers,
            )
            assert response.status_code == 201

        # Step 5: Delete account
        response = await client.delete("/v1/users/me", headers=headers)
        assert response.status_code == 204

        # Step 6: Verify account is deleted (soft delete)
        from sqlalchemy import select

        result = await db_session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one()
        assert user.is_active is False
        assert user.deleted_at is not None

        # Step 7: Verify can't use token anymore
        response = await client.get("/v1/users/me", headers=headers)
        assert response.status_code == 404  # User not found

    @pytest.mark.integration
    async def test_concurrent_token_refresh(
        self, client: AsyncClient, db_session: AsyncSession, test_user: User
    ):
        """Test handling concurrent token refresh requests."""
        # Create refresh token
        refresh_token = create_refresh_token(data={"sub": str(test_user.id)})
        auth_token = AuthToken(
            user_id=test_user.id,
            token_hash=hash_token(refresh_token),
            device_id="test_device",
            user_agent="Test Agent",
        )
        db_session.add(auth_token)
        await db_session.commit()

        # Make multiple concurrent refresh requests
        import asyncio

        async def refresh():
            return await client.post(
                "/v1/auth/refresh", json={"refresh_token": refresh_token}
            )

        # Run 5 concurrent requests
        responses = await asyncio.gather(*[refresh() for _ in range(5)])

        # All should succeed
        for response in responses:
            assert response.status_code == 200
            assert "access_token" in response.json()

        # Check token usage count
        await db_session.refresh(auth_token)
        assert auth_token.usage_count == 5
