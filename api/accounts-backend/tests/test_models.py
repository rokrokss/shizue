import pytest
from datetime import datetime, timezone, timedelta
import uuid

from app.models.user import User
from app.models.auth_token import AuthToken
from app.models.api_usage import APIUsage


class TestUserModel:
    """Test User model."""
    
    @pytest.mark.unit
    def test_user_creation(self):
        """Test creating a user instance."""
        user = User(
            google_id="test_google_123",
            email="test@example.com",
            name="Test User",
            profile_picture="https://example.com/photo.jpg",
            locale="en"
        )
        
        assert user.google_id == "test_google_123"
        assert user.email == "test@example.com"
        assert user.is_active is True
        assert user.is_premium is False
        assert user.created_via == "google_oauth"
    
    @pytest.mark.unit
    def test_user_to_dict(self):
        """Test user to_dict method."""
        user_id = uuid.uuid4()
        now = datetime.now(timezone.utc)
        
        user = User(
            id=user_id,
            google_id="test_google_123",
            email="test@example.com",
            name="Test User",
            profile_picture="https://example.com/photo.jpg",
            locale="en",
            timezone="UTC",
            is_active=True,
            is_premium=False,
            created_at=now,
            last_login_at=now
        )
        
        user_dict = user.to_dict()
        
        assert user_dict["id"] == str(user_id)
        assert user_dict["google_id"] == "test_google_123"
        assert user_dict["email"] == "test@example.com"
        assert user_dict["is_active"] is True
        assert user_dict["is_premium"] is False
        assert user_dict["created_at"] == now.isoformat()
        assert user_dict["last_login_at"] == now.isoformat()
    
    @pytest.mark.unit
    def test_user_repr(self):
        """Test user string representation."""
        user = User(email="test@example.com")
        assert repr(user) == "<User test@example.com>"


class TestAuthTokenModel:
    """Test AuthToken model."""
    
    @pytest.mark.unit
    def test_auth_token_creation(self):
        """Test creating an auth token instance."""
        user_id = uuid.uuid4()
        token = AuthToken(
            user_id=user_id,
            token_hash="hash123",
            device_id="device123",
            user_agent="Chrome/120.0"
        )
        
        assert token.user_id == user_id
        assert token.token_hash == "hash123"
        assert token.is_active is True
        assert token.usage_count == 0
    
    @pytest.mark.unit
    def test_auth_token_expires_at(self):
        """Test auth token expires_at calculation."""
        user_id = uuid.uuid4()
        token = AuthToken(
            user_id=user_id,
            token_hash="hash123"
        )
        
        # expires_at should be set automatically
        assert token.expires_at is not None
        assert token.expires_at > datetime.now(timezone.utc)
        
        # Should be approximately 30 days from now
        expected_expiry = datetime.now(timezone.utc) + timedelta(days=30)
        diff = abs((token.expires_at - expected_expiry).total_seconds())
        assert diff < 60  # Within 1 minute
    
    @pytest.mark.unit
    def test_auth_token_repr(self):
        """Test auth token string representation."""
        user_id = uuid.uuid4()
        token = AuthToken(
            user_id=user_id,
            token_hash="hash123"
        )
        assert repr(token) == f"<AuthToken user_id={user_id}>"


class TestAPIUsageModel:
    """Test APIUsage model."""
    
    @pytest.mark.unit
    def test_api_usage_creation(self):
        """Test creating an API usage instance."""
        user_id = uuid.uuid4()
        usage = APIUsage(
            user_id=user_id,
            model="gpt-4",
            endpoint="/v1/chat",
            tokens_input=100,
            tokens_output=200,
            latency_ms=500,
            status_code=200
        )
        
        assert usage.user_id == user_id
        assert usage.model == "gpt-4"
        assert usage.tokens_input == 100
        assert usage.tokens_output == 200
        assert usage.tokens_total == 300
    
    @pytest.mark.unit
    def test_api_usage_tokens_total_property(self):
        """Test tokens_total hybrid property."""
        usage = APIUsage(
            user_id=uuid.uuid4(),
            model="gpt-4",
            endpoint="/v1/chat",
            tokens_input=150,
            tokens_output=350
        )
        
        assert usage.tokens_total == 500
        
        # Test with zero tokens
        usage.tokens_input = 0
        usage.tokens_output = 0
        assert usage.tokens_total == 0
    
    @pytest.mark.unit
    def test_api_usage_to_dict(self):
        """Test API usage to_dict method."""
        usage_id = uuid.uuid4()
        user_id = uuid.uuid4()
        now = datetime.now(timezone.utc)
        
        usage = APIUsage(
            id=usage_id,
            user_id=user_id,
            model="gpt-4",
            endpoint="/v1/chat",
            tokens_input=100,
            tokens_output=200,
            latency_ms=500,
            status_code=200,
            error_message=None,
            created_at=now
        )
        
        usage_dict = usage.to_dict()
        
        assert usage_dict["id"] == str(usage_id)
        assert usage_dict["user_id"] == str(user_id)
        assert usage_dict["model"] == "gpt-4"
        assert usage_dict["tokens_total"] == 300
        assert usage_dict["created_at"] == now.isoformat()
        assert usage_dict["error_message"] is None
    
    @pytest.mark.unit
    def test_api_usage_repr(self):
        """Test API usage string representation."""
        user_id = uuid.uuid4()
        usage = APIUsage(
            user_id=user_id,
            model="gpt-4",
            endpoint="/v1/chat"
        )
        assert repr(usage) == f"<APIUsage user_id={user_id} model=gpt-4>"