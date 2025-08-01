import pytest
from datetime import datetime, timedelta, timezone
from jose import jwt
from app.core.security import (
    create_access_token,
    create_refresh_token,
    verify_token,
    hash_token,
    verify_password,
    get_password_hash,
    generate_state_token,
    generate_device_id,
)
from app.core.config import settings


class TestSecurity:
    """Test security utilities."""

    @pytest.mark.unit
    def test_create_access_token(self):
        """Test access token creation."""
        data = {"sub": "user123"}
        token = create_access_token(data)

        # Decode token
        decoded = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )

        assert decoded["sub"] == "user123"
        assert decoded["type"] == "access"
        assert "exp" in decoded
        assert "iat" in decoded

    @pytest.mark.unit
    def test_create_access_token_with_custom_expiry(self):
        """Test access token creation with custom expiry."""
        data = {"sub": "user123"}
        expires_delta = timedelta(minutes=5)
        token = create_access_token(data, expires_delta)

        decoded = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )

        # Check expiry is approximately 5 minutes from now
        exp_time = datetime.fromtimestamp(decoded["exp"], tz=timezone.utc)
        expected_exp = datetime.now(timezone.utc) + expires_delta
        assert abs((exp_time - expected_exp).total_seconds()) < 2  # Within 2 seconds

    @pytest.mark.unit
    def test_create_refresh_token(self):
        """Test refresh token creation."""
        data = {"sub": "user123"}
        token = create_refresh_token(data)

        decoded = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )

        assert decoded["sub"] == "user123"
        assert decoded["type"] == "refresh"
        assert "jti" in decoded  # JWT ID for revocation
        assert "exp" in decoded
        assert "iat" in decoded

    @pytest.mark.unit
    def test_verify_token_valid_access(self):
        """Test verifying a valid access token."""
        data = {"sub": "user123"}
        token = create_access_token(data)

        payload = verify_token(token, token_type="access")

        assert payload is not None
        assert payload["sub"] == "user123"
        assert payload["type"] == "access"

    @pytest.mark.unit
    def test_verify_token_valid_refresh(self):
        """Test verifying a valid refresh token."""
        data = {"sub": "user123"}
        token = create_refresh_token(data)

        payload = verify_token(token, token_type="refresh")

        assert payload is not None
        assert payload["sub"] == "user123"
        assert payload["type"] == "refresh"

    @pytest.mark.unit
    def test_verify_token_invalid(self):
        """Test verifying an invalid token."""
        invalid_token = "invalid.token.here"

        payload = verify_token(invalid_token)

        assert payload is None

    @pytest.mark.unit
    def test_verify_token_wrong_type(self):
        """Test verifying token with wrong type."""
        data = {"sub": "user123"}
        access_token = create_access_token(data)

        # Try to verify access token as refresh token
        payload = verify_token(access_token, token_type="refresh")

        assert payload is None

    @pytest.mark.unit
    def test_verify_token_expired(self):
        """Test verifying an expired token."""
        data = {"sub": "user123"}
        # Create token that expires immediately
        token = create_access_token(data, timedelta(seconds=-1))

        payload = verify_token(token)

        assert payload is None

    @pytest.mark.unit
    def test_hash_token(self):
        """Test token hashing."""
        token = "test_token"
        hash1 = hash_token(token)
        hash2 = hash_token(token)

        # Same token should produce same hash
        assert hash1 == hash2
        assert len(hash1) == 64  # SHA256 produces 64 character hex string

        # Different tokens should produce different hashes
        hash3 = hash_token("different_token")
        assert hash1 != hash3

    @pytest.mark.unit
    def test_password_hashing(self):
        """Test password hashing and verification."""
        password = "secure_password123"

        # Hash password
        hashed = get_password_hash(password)

        # Verify correct password
        assert verify_password(password, hashed) is True

        # Verify incorrect password
        assert verify_password("wrong_password", hashed) is False

        # Same password should produce different hashes (due to salt)
        hashed2 = get_password_hash(password)
        assert hashed != hashed2

    @pytest.mark.unit
    def test_generate_state_token(self):
        """Test state token generation."""
        token1 = generate_state_token()
        token2 = generate_state_token()

        # Should be URL-safe
        assert "/" not in token1
        assert "+" not in token1

        # Should be unique
        assert token1 != token2

        # Should have reasonable length
        assert len(token1) >= 32

    @pytest.mark.unit
    def test_generate_device_id(self):
        """Test device ID generation."""
        id1 = generate_device_id()
        id2 = generate_device_id()

        # Should be URL-safe
        assert "/" not in id1
        assert "+" not in id1

        # Should be unique
        assert id1 != id2

        # Should have reasonable length
        assert len(id1) >= 16
