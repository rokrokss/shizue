import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.sql import func

from app.core.base import Base


class APIUsage(Base):
    __tablename__ = "api_usage"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Model and endpoint information
    model = Column(String(100), nullable=False, index=True)
    endpoint = Column(String(255), nullable=False)

    # Token usage
    tokens_input = Column(Integer, default=0)
    tokens_output = Column(Integer, default=0)

    # Performance metrics
    latency_ms = Column(Integer)
    status_code = Column(Integer)
    error_message = Column(Text)

    # Additional metadata (JSON)
    request_metadata = Column(Text)  # JSON string for additional data

    # Timestamp
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    @hybrid_property
    def tokens_total(self):
        return self.tokens_input + self.tokens_output

    def __repr__(self):
        return f"<APIUsage user_id={self.user_id} model={self.model}>"

    def to_dict(self):
        import json

        metadata = None
        if self.request_metadata:
            try:
                metadata = json.loads(self.request_metadata)
            except (json.JSONDecodeError, TypeError):
                metadata = None

        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "model": self.model,
            "endpoint": self.endpoint,
            "tokens_input": self.tokens_input,
            "tokens_output": self.tokens_output,
            "tokens_total": self.tokens_total,
            "latency_ms": self.latency_ms,
            "status_code": self.status_code,
            "error_message": self.error_message,
            "metadata": metadata,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
