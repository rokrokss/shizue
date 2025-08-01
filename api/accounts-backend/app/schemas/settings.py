"""User settings schemas."""

from typing import List, Optional

from pydantic import BaseModel, Field


class GeneralSettings(BaseModel):
    """General user settings."""

    language: Optional[str] = Field(default="English", description="UI language")
    translate_target_language: Optional[str] = Field(default="English", description="Translation target language")
    user_memory: Optional[str] = Field(default="", description="User context memory")


class ModelSettings(BaseModel):
    """AI model settings."""

    # Legacy: actual model IDs (will be auto-migrated)
    chat_model: Optional[str] = Field(default="gpt-4.1-mini", description="Selected chat model")
    translate_model: Optional[str] = Field(default="gpt-4.1-mini", description="Selected translation model")

    # New: size preferences
    chat_size: Optional[str] = Field(default="large", description="Preferred chat model size (large/small)")
    translate_size: Optional[str] = Field(default="small", description="Preferred translation model size (large/small)")
    provider_preference: Optional[str] = Field(None, description="Preferred provider (openai/gemini/anthropic)")


class LayoutSettings(BaseModel):
    """UI layout settings."""

    theme: Optional[str] = Field(default="light", description="UI theme")
    show_toggle: Optional[bool] = Field(default=True, description="Show toggle button")
    toggle_y_position: Optional[float] = Field(default=50.0, description="Toggle Y position")
    show_youtube_caption_toggle: Optional[bool] = Field(default=True, description="Show YouTube caption toggle")
    show_youtube_bilingual_caption: Optional[bool] = Field(default=True, description="Show bilingual captions")
    use_youtube_keyboard_navigate: Optional[bool] = Field(default=False, description="Use keyboard navigation")
    youtube_caption_size_ratio: Optional[float] = Field(default=1.0, description="Caption size ratio")
    toggle_hidden_site_list: Optional[List[str]] = Field(default_factory=list, description="Hidden site list")


class ApiKeySettings(BaseModel):
    """API key settings (encrypted)."""

    openai: Optional[str] = Field(default=None, description="OpenAI API key (encrypted)")
    gemini: Optional[str] = Field(default=None, description="Gemini API key (encrypted)")
    anthropic: Optional[str] = Field(default=None, description="Anthropic API key (encrypted)")
    openai_validated: Optional[bool] = Field(default=False, description="OpenAI key validated")
    gemini_validated: Optional[bool] = Field(default=False, description="Gemini key validated")
    anthropic_validated: Optional[bool] = Field(default=False, description="Anthropic key validated")


class UserSettings(BaseModel):
    """Complete user settings."""

    general: GeneralSettings = Field(default_factory=lambda: GeneralSettings())
    models: ModelSettings = Field(default_factory=lambda: ModelSettings())
    layout: LayoutSettings = Field(default_factory=lambda: LayoutSettings())
    api_keys: ApiKeySettings = Field(default_factory=lambda: ApiKeySettings())
    api_mode: Optional[str] = Field(default="keys", description="API mode")
    api_mode_preference: Optional[str] = Field(default="keys", description="API mode preference")
    pdf_translate_no_dual: Optional[bool] = Field(default=False, description="PDF translate single language")


class UserSettingsUpdate(BaseModel):
    """User settings update schema."""

    general: Optional[GeneralSettings] = None
    models: Optional[ModelSettings] = None
    layout: Optional[LayoutSettings] = None
    api_keys: Optional[ApiKeySettings] = None
    api_mode: Optional[str] = None
    api_mode_preference: Optional[str] = None
    pdf_translate_no_dual: Optional[bool] = None


class ApiKeyRequest(BaseModel):
    """API key update request."""

    provider: str = Field(..., description="API provider (openai, gemini, anthropic)")
    key: str = Field(..., description="API key")


class ApiKeyResponse(BaseModel):
    """API key response (masked)."""

    provider: str
    masked_key: str
    validated: bool
