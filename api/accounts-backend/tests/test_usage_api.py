import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone, timedelta
import json

from app.models.user import User
from app.models.api_usage import APIUsage


class TestUsageAPI:
    """Test usage API endpoints."""
    
    @pytest.mark.integration
    async def test_create_usage_record(
        self, client: AsyncClient, db_session: AsyncSession,
        test_user: User, auth_headers: dict, mock_cache
    ):
        """Test creating a usage record."""
        usage_data = {
            "model": "gpt-4-turbo",
            "endpoint": "/v1/chat/completions",
            "tokens_input": 150,
            "tokens_output": 350,
            "latency_ms": 1200,
            "status_code": 200,
            "metadata": {"temperature": 0.7, "max_tokens": 500}
        }
        
        response = await client.post(
            "/v1/usage/",
            json=usage_data,
            headers=auth_headers
        )
        
        assert response.status_code == 201
        data = response.json()
        assert data["model"] == "gpt-4-turbo"
        assert data["tokens_input"] == 150
        assert data["tokens_output"] == 350
        assert data["tokens_total"] == 500
        assert data["user_id"] == str(test_user.id)
        
        # Check database
        from sqlalchemy import select
        result = await db_session.execute(
            select(APIUsage).where(APIUsage.id == data["id"])
        )
        usage_record = result.scalar_one()
        assert usage_record.model == "gpt-4-turbo"
        assert json.loads(usage_record.metadata)["temperature"] == 0.7
        
        # Check cache was invalidated
        mock_cache.delete_user_stats.assert_called_once_with(str(test_user.id))
    
    @pytest.mark.integration
    async def test_create_usage_record_with_error(
        self, client: AsyncClient, test_user: User, auth_headers: dict, mock_cache
    ):
        """Test creating a usage record for failed API call."""
        usage_data = {
            "model": "gpt-4-turbo",
            "endpoint": "/v1/chat/completions",
            "tokens_input": 100,
            "tokens_output": 0,
            "latency_ms": 500,
            "status_code": 400,
            "error_message": "Invalid request parameters"
        }
        
        response = await client.post(
            "/v1/usage/",
            json=usage_data,
            headers=auth_headers
        )
        
        assert response.status_code == 201
        data = response.json()
        assert data["status_code"] == 400
        assert data["error_message"] == "Invalid request parameters"
        assert data["tokens_output"] == 0
    
    @pytest.mark.integration
    async def test_get_usage_history_empty(
        self, client: AsyncClient, test_user: User, auth_headers: dict
    ):
        """Test getting usage history with no records."""
        response = await client.get("/v1/usage/", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data == []
    
    @pytest.mark.integration
    async def test_get_usage_history_with_records(
        self, client: AsyncClient, db_session: AsyncSession,
        test_user: User, auth_headers: dict
    ):
        """Test getting usage history with records."""
        # Create usage records
        models = ["gpt-4", "claude-3", "gpt-3.5-turbo"]
        for i in range(15):
            usage = APIUsage(
                user_id=test_user.id,
                model=models[i % 3],
                endpoint="/v1/chat",
                tokens_input=100 + i * 10,
                tokens_output=200 + i * 20,
                latency_ms=500 + i * 50,
                status_code=200,
                created_at=datetime.now(timezone.utc) - timedelta(days=i)
            )
            db_session.add(usage)
        await db_session.commit()
        
        # Test default pagination
        response = await client.get("/v1/usage/", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 15  # All records (under default limit of 100)
        
        # Check ordering (newest first)
        assert data[0]["tokens_input"] == 100  # Most recent
        assert data[-1]["tokens_input"] == 240  # Oldest
    
    @pytest.mark.integration
    async def test_get_usage_history_with_pagination(
        self, client: AsyncClient, db_session: AsyncSession,
        test_user: User, auth_headers: dict
    ):
        """Test usage history pagination."""
        # Create 20 records
        for i in range(20):
            usage = APIUsage(
                user_id=test_user.id,
                model="gpt-4",
                endpoint="/v1/chat",
                tokens_input=100,
                tokens_output=200
            )
            db_session.add(usage)
        await db_session.commit()
        
        # Test with limit and offset
        response = await client.get(
            "/v1/usage/",
            params={"limit": 5, "offset": 10},
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 5
    
    @pytest.mark.integration
    async def test_get_usage_history_with_filters(
        self, client: AsyncClient, db_session: AsyncSession,
        test_user: User, auth_headers: dict
    ):
        """Test usage history with filters."""
        # Create records with different models
        for model in ["gpt-4", "claude-3", "gpt-3.5-turbo"]:
            for i in range(3):
                usage = APIUsage(
                    user_id=test_user.id,
                    model=model,
                    endpoint="/v1/chat",
                    tokens_input=100,
                    tokens_output=200,
                    created_at=datetime.now(timezone.utc) - timedelta(days=i)
                )
                db_session.add(usage)
        await db_session.commit()
        
        # Filter by model
        response = await client.get(
            "/v1/usage/",
            params={"model": "gpt-4"},
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3
        assert all(record["model"] == "gpt-4" for record in data)
        
        # Filter by date range
        start_date = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        response = await client.get(
            "/v1/usage/",
            params={"start_date": start_date},
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3  # Only today's records
    
    @pytest.mark.integration
    async def test_get_usage_summary_day(
        self, client: AsyncClient, db_session: AsyncSession,
        test_user: User, auth_headers: dict
    ):
        """Test getting daily usage summary."""
        # Create records for today
        for i in range(5):
            usage = APIUsage(
                user_id=test_user.id,
                model="gpt-4" if i < 3 else "claude-3",
                endpoint="/v1/chat",
                tokens_input=100,
                tokens_output=200,
                created_at=datetime.now(timezone.utc) - timedelta(hours=i)
            )
            db_session.add(usage)
        await db_session.commit()
        
        response = await client.get(
            "/v1/usage/summary",
            params={"period": "day"},
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["period"] == "day"
        assert data["total_messages"] == 5
        assert data["total_tokens"] == 1500
        assert data["models"]["gpt-4"]["messages"] == 3
        assert data["models"]["claude-3"]["messages"] == 2
        assert len(data["daily_breakdown"]) == 1  # Only today
    
    @pytest.mark.integration
    async def test_get_usage_summary_week(
        self, client: AsyncClient, db_session: AsyncSession,
        test_user: User, auth_headers: dict
    ):
        """Test getting weekly usage summary."""
        # Create records for past week
        for i in range(10):
            usage = APIUsage(
                user_id=test_user.id,
                model="gpt-4",
                endpoint="/v1/chat",
                tokens_input=100,
                tokens_output=200,
                created_at=datetime.now(timezone.utc) - timedelta(days=i % 7)
            )
            db_session.add(usage)
        await db_session.commit()
        
        response = await client.get(
            "/v1/usage/summary",
            params={"period": "week"},
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["period"] == "week"
        assert data["total_messages"] == 10
        assert data["total_tokens"] == 3000
    
    @pytest.mark.integration
    async def test_get_model_usage(
        self, client: AsyncClient, db_session: AsyncSession,
        test_user: User, auth_headers: dict
    ):
        """Test getting model-specific usage statistics."""
        # Create records with different models and results
        models_data = [
            ("gpt-4", 200, None),
            ("gpt-4", 200, None),
            ("gpt-4", 400, "Rate limit exceeded"),  # Error
            ("claude-3", 200, None),
            ("claude-3", 200, None),
        ]
        
        for model, status_code, error in models_data:
            usage = APIUsage(
                user_id=test_user.id,
                model=model,
                endpoint="/v1/chat",
                tokens_input=100,
                tokens_output=200 if status_code == 200 else 0,
                latency_ms=500 if status_code == 200 else 100,
                status_code=status_code,
                error_message=error
            )
            db_session.add(usage)
        await db_session.commit()
        
        response = await client.get(
            "/v1/usage/models",
            params={"days": 30},
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Find GPT-4 stats
        gpt4_stats = next(m for m in data if m["model"] == "gpt-4")
        assert gpt4_stats["messages"] == 3
        assert gpt4_stats["tokens"] == 600  # 2 successful * 300
        assert gpt4_stats["error_rate"] == pytest.approx(33.33, 0.01)  # 1/3 failed
        
        # Find Claude-3 stats
        claude_stats = next(m for m in data if m["model"] == "claude-3")
        assert claude_stats["messages"] == 2
        assert claude_stats["tokens"] == 600
        assert claude_stats["error_rate"] == 0.0