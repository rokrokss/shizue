"""Model mapping schema for automatic model upgrades."""

from enum import Enum
from typing import Dict, Optional

from pydantic import BaseModel, Field


class ModelSize(str, Enum):
    """Model size categories for user preferences."""

    LARGE = "large"
    SMALL = "small"


class ModelProvider(str, Enum):
    """Supported model providers."""

    OPENAI = "openai"
    GEMINI = "gemini"
    ANTHROPIC = "anthropic"


class ModelInfo(BaseModel):
    """Information about a specific model."""

    id: str = Field(..., description="Unique model identifier")
    name: str = Field(..., description="Display name for the model")
    provider: ModelProvider = Field(..., description="Model provider")
    size: ModelSize = Field(..., description="Model size category")
    version: str = Field(..., description="Model version for comparison")
    active: bool = Field(default=True, description="Whether the model is currently available")
    deprecated: bool = Field(default=False, description="Whether the model is deprecated")
    successor_id: Optional[str] = Field(None, description="ID of the successor model if deprecated")


class ModelMapping(BaseModel):
    """Complete model mapping configuration."""

    models: Dict[str, ModelInfo] = Field(default_factory=dict, description="All available models")
    default_chat_large: str = Field(..., description="Default large model for chat")
    default_chat_small: str = Field(..., description="Default small model for chat")
    default_translate_large: str = Field(..., description="Default large model for translation")
    default_translate_small: str = Field(..., description="Default small model for translation")


class UserModelPreference(BaseModel):
    """User's model size preferences."""

    chat_size: ModelSize = Field(default=ModelSize.LARGE, description="Preferred chat model size")
    translate_size: ModelSize = Field(default=ModelSize.SMALL, description="Preferred translation model size")
    provider_preference: Optional[ModelProvider] = Field(None, description="Preferred provider if available")


# Default model mappings
DEFAULT_MODEL_MAPPING = ModelMapping(
    models={
        # OpenAI models
        "gpt-4.1": ModelInfo(
            id="gpt-4.1",
            name="GPT 4.1",
            provider=ModelProvider.OPENAI,
            size=ModelSize.LARGE,
            version="2024.1.0",
            active=True,
        ),
        "gpt-4.1-mini": ModelInfo(
            id="gpt-4.1-mini",
            name="GPT 4.1 Mini",
            provider=ModelProvider.OPENAI,
            size=ModelSize.SMALL,
            version="2024.1.0",
            active=True,
        ),
        # Gemini models
        "gemini-2.5-flash": ModelInfo(
            id="gemini-2.5-flash",
            name="Gemini 2.5 Flash",
            provider=ModelProvider.GEMINI,
            size=ModelSize.LARGE,
            version="2024.2.5",
            active=True,
        ),
        "gemini-2.5-flash-lite-preview-06-17": ModelInfo(
            id="gemini-2.5-flash-lite-preview-06-17",
            name="Gemini 2.5 Flash Lite",
            provider=ModelProvider.GEMINI,
            size=ModelSize.SMALL,
            version="2024.2.5",
            active=True,
        ),
        # Anthropic models
        "claude-sonnet-4-20250514": ModelInfo(
            id="claude-sonnet-4-20250514",
            name="Claude Sonnet 4",
            provider=ModelProvider.ANTHROPIC,
            size=ModelSize.LARGE,
            version="2025.5.14",
            active=True,
        ),
        "claude-3-5-haiku-20241022": ModelInfo(
            id="claude-3-5-haiku-20241022",
            name="Claude Haiku 3.5",
            provider=ModelProvider.ANTHROPIC,
            size=ModelSize.SMALL,
            version="2024.10.22",
            active=True,
        ),
    },
    default_chat_large="gpt-4.1",
    default_chat_small="gpt-4.1-mini",
    default_translate_large="gemini-2.5-flash",
    default_translate_small="gemini-2.5-flash-lite-preview-06-17",
)
