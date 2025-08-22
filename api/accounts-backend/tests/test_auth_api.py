import uuid
from unittest.mock import MagicMock, patch

import pytest
from app.core.security import create_refresh_token, hash_token
from app.models.auth_token import AuthToken
from datetime import datetime, timedelta, timezone
from app.models.user import User
from app.models.oauth_state import OAuthState
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


class TestAuthAPI:
    """Test authentication API endpoints."""

    @pytest.mark.integration
    async def test_login_google(self, client: AsyncClient, db_session: AsyncSession, mock_google_oauth):
        """Test Google OAuth login URL generation."""
        response = await client.get("/api/v1/auth/login/google")

        assert response.status_code == 200
        data = response.json()
        assert "authorization_url" in data
        assert "accounts.google.com" in data["authorization_url"]

        # Check that state was stored in database
        from sqlalchemy import select
        result = await db_session.execute(select(OAuthState))
        oauth_state = result.scalar_one_or_none()
        assert oauth_state is not None

    @pytest.mark.integration
    async def test_callback_google_new_user(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        mock_google_oauth,
    ):
        """Test Google OAuth callback for new user."""
        # Create valid OAuth state in database
        oauth_state = OAuthState(state="test_state")
        db_session.add(oauth_state)
        await db_session.commit()

        response = await client.get(
            "/api/v1/auth/callback/google",
            params={"code": "test_code", "state": "test_state"},
        )

        assert response.status_code == 307  # Redirect
        assert "access_token=" in response.headers["location"]
        assert "refresh_token=" in response.headers["location"]

        # Check user was created
        from sqlalchemy import select

        result = await db_session.execute(
            select(User).where(User.email == "test@example.com")
        )
        user = result.scalar_one_or_none()
        assert user is not None
        assert user.google_id == "test_google_id_123"
        assert user.name == "Test User"

        # Check auth token was created
        result = await db_session.execute(
            select(AuthToken).where(AuthToken.user_id == user.id)
        )
        auth_token = result.scalar_one_or_none()
        assert auth_token is not None
        assert auth_token.is_active is True

    @pytest.mark.integration
    async def test_callback_google_existing_user(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        mock_google_oauth,
    ):
        """Test Google OAuth callback for existing user."""
        # Create valid OAuth state in database
        oauth_state = OAuthState(state="test_state")
        db_session.add(oauth_state)
        await db_session.commit()

        # Update mock to return existing user's google_id
        mock_google_oauth.verify_and_get_user_info.return_value["google_id"] = (
            test_user.google_id
        )

        response = await client.get(
            "/api/v1/auth/callback/google",
            params={"code": "test_code", "state": "test_state"},
        )

        assert response.status_code == 307

        # Check user was not duplicated
        from sqlalchemy import func, select

        result = await db_session.execute(
            select(func.count(User.id)).where(User.google_id == test_user.google_id)
        )
        count = result.scalar()
        assert count == 1

    @pytest.mark.integration
    async def test_callback_google_invalid_state(self, client: AsyncClient, db_session: AsyncSession):
        """Test Google OAuth callback with invalid state."""
        # Don't create any OAuth state in database

        response = await client.get(
            "/api/v1/auth/callback/google",
            params={"code": "test_code", "state": "invalid_state"},
        )

        assert response.status_code == 400
        assert "Invalid or expired state token" in response.json()["detail"]

    @pytest.mark.integration
    async def test_callback_google_unverified_email(
        self, client: AsyncClient, db_session: AsyncSession, mock_google_oauth
    ):
        """Test Google OAuth callback with unverified email."""
        # Create valid OAuth state in database
        oauth_state = OAuthState(state="test_state")
        db_session.add(oauth_state)
        await db_session.commit()
        mock_google_oauth.verify_and_get_user_info.return_value["email_verified"] = (
            False
        )

        response = await client.get(
            "/api/v1/auth/callback/google",
            params={"code": "test_code", "state": "test_state"},
        )

        assert response.status_code == 400
        assert "Email not verified" in response.json()["detail"]

    @pytest.mark.integration
    async def test_refresh_token_valid(
        self, client: AsyncClient, db_session: AsyncSession, test_user: User
    ):
        """Test refreshing access token with valid refresh token."""
        # Create refresh token
        refresh_token = create_refresh_token(data={"sub": str(test_user.id)})

        # Store token in database
        auth_token = AuthToken(
            user_id=test_user.id,
            refresh_token_hash=hash_token(refresh_token),
            device_id="test_device",
            user_agent="Test Agent",
            expires_at=datetime.now(timezone.utc) + timedelta(days=30),
        )
        db_session.add(auth_token)
        await db_session.commit()

        response = await client.post(
            "/api/v1/auth/refresh", json={"refresh_token": refresh_token}
        )

        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "Bearer"
        assert data["expires_in"] == 3600  # 60 minutes

    @pytest.mark.integration
    async def test_refresh_token_invalid(self, client: AsyncClient):
        """Test refreshing with invalid refresh token."""
        response = await client.post(
            "/api/v1/auth/refresh", json={"refresh_token": "invalid_token"}
        )

        assert response.status_code == 401
        assert "Invalid refresh token" in response.json()["detail"]

    @pytest.mark.integration
    async def test_refresh_token_not_in_db(self, client: AsyncClient, test_user: User):
        """Test refreshing with token not in database."""
        # Create valid token but don't store it
        refresh_token = create_refresh_token(data={"sub": str(test_user.id)})

        response = await client.post(
            "/api/v1/auth/refresh", json={"refresh_token": refresh_token}
        )

        assert response.status_code == 401
        assert "Refresh token not found" in response.json()["detail"]

    @pytest.mark.integration
    async def test_logout_with_token(
        self, client: AsyncClient, db_session: AsyncSession, test_user: User, mock_cache
    ):
        """Test logout with refresh token."""
        # Create and store refresh token
        refresh_token = create_refresh_token(data={"sub": str(test_user.id)})
        auth_token = AuthToken(
            user_id=test_user.id,
            refresh_token_hash=hash_token(refresh_token),
            device_id="test_device",
            user_agent="Test Agent",
            expires_at=datetime.now(timezone.utc) + timedelta(days=30),
        )
        db_session.add(auth_token)
        await db_session.commit()

        response = await client.post(
            "/api/v1/auth/logout", params={"refresh_token": refresh_token}
        )

        assert response.status_code == 204

        # Check token was revoked
        await db_session.refresh(auth_token)
        assert auth_token.is_active is False
        assert auth_token.revoked_at is not None

        # Check cache was cleared
        mock_cache.delete_user_profile.assert_called_once_with(str(test_user.id))

    @pytest.mark.integration
    async def test_logout_without_token(self, client: AsyncClient):
        """Test logout without refresh token."""
        response = await client.post("/api/v1/auth/logout")

        # Should still return success
        assert response.status_code == 204
