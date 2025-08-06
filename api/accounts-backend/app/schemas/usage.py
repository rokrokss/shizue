import json
from datetime import datetime
from typing import Any, List, Optional

from pydantic import UUID4, BaseModel, ConfigDict, Field


class UsageRecord(BaseModel):
    """API usage record"""

    model_config = ConfigDict(from_attributes=True)

    id: UUID4
    user_id: UUID4
    model: str = Field(..., description="Model name (e.g., gpt-4-turbo)")
    endpoint: str = Field(..., description="API endpoint used")
    tokens_input: int = Field(default=0, description="Input tokens")
    tokens_output: int = Field(default=0, description="Output tokens")
    tokens_total: int = Field(..., description="Total tokens")
    latency_ms: Optional[int] = Field(None, description="Response latency in milliseconds")
    status_code: int = Field(..., description="HTTP status code")
    error_message: Optional[str] = Field(None, description="Error message if failed")
    metadata: Optional[dict] = Field(None, description="Request metadata")
    created_at: datetime

    @classmethod
    def model_validate(cls, obj: Any, *, from_attributes: bool = True) -> "UsageRecord":
        """Custom model_validate to handle request_metadata -> metadata conversion"""
        data = {
            "id": obj.id,
            "user_id": obj.user_id,
            "model": obj.model,
            "endpoint": obj.endpoint,
            "tokens_input": obj.tokens_input,
            "tokens_output": obj.tokens_output,
            "tokens_total": obj.tokens_total,
            "latency_ms": obj.latency_ms,
            "status_code": obj.status_code,
            "error_message": obj.error_message,
            "created_at": obj.created_at,
        }

        # Convert request_metadata JSON string to metadata dict
        if obj.request_metadata:
            try:
                data["metadata"] = json.loads(obj.request_metadata)
            except (json.JSONDecodeError, TypeError):
                data["metadata"] = None
        else:
            data["metadata"] = None

        return cls(**data)


class UsageCreate(BaseModel):
    """Create new usage record"""

    model: str = Field(..., description="Model name")
    endpoint: str = Field(..., description="API endpoint")
    tokens_input: int = Field(default=0, description="Input tokens")
    tokens_output: int = Field(default=0, description="Output tokens")
    latency_ms: Optional[int] = Field(None, description="Response latency")
    status_code: int = Field(default=200, description="HTTP status code")
    error_message: Optional[str] = Field(None, description="Error message if failed")
    metadata: Optional[dict] = Field(None, description="Additional metadata")


class UsageSummary(BaseModel):
    """Usage summary by time period"""

    period: str = Field(..., description="Time period (day, week, month)")
    total_messages: int = Field(default=0, description="Total messages")
    total_tokens: int = Field(default=0, description="Total tokens")
    models: dict = Field(default_factory=dict, description="Usage by model")
    daily_breakdown: Optional[List[dict]] = Field(None, description="Daily usage breakdown")


class ModelUsage(BaseModel):
    """Usage statistics for a specific model"""

    model: str
    messages: int = Field(default=0, description="Number of messages")
    tokens: int = Field(default=0, description="Total tokens")
    avg_latency_ms: Optional[float] = Field(None, description="Average latency")
    error_rate: float = Field(default=0.0, description="Error rate percentage")
