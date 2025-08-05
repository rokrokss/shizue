"""User settings API endpoints."""

import asyncio
import json
from functools import lru_cache
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import ORJSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import CacheLevel, CacheTTL, cached
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.encryption import encryption_service
from app.models.user import User
from app.schemas.model_mapping import ModelProvider, ModelSize
from app.schemas.settings import ApiKeyRequest, ApiKeyResponse, UserSettings, UserSettingsUpdate
from app.services.model_service import model_service

router = APIRouter(tags=["settings"], default_response_class=ORJSONResponse)


@lru_cache(maxsize=128)
def _parse_settings_json(settings_json: str) -> UserSettings:
    """Parse and cache user settings from JSON string."""
    try:
        settings_dict = json.loads(settings_json)
        return UserSettings(**settings_dict)
    except (json.JSONDecodeError, TypeError):
        return UserSettings()


def _get_user_settings(user: User) -> UserSettings:
    """Parse user settings from JSON string."""
    if not user.settings:
        return UserSettings()
    return _parse_settings_json(user.settings)


async def _save_user_settings(user: User, settings: UserSettings, db: AsyncSession) -> None:
    """Save user settings to database with concurrent encryption."""
    # Encrypt API keys concurrently
    if settings.api_keys:
        tasks = []
        if settings.api_keys.openai:
            tasks.append(asyncio.to_thread(encryption_service.encrypt, settings.api_keys.openai))
        if settings.api_keys.gemini:
            tasks.append(asyncio.to_thread(encryption_service.encrypt, settings.api_keys.gemini))
        if settings.api_keys.anthropic:
            tasks.append(asyncio.to_thread(encryption_service.encrypt, settings.api_keys.anthropic))

        if tasks:
            encrypted_keys = await asyncio.gather(*tasks)
            idx = 0
            if settings.api_keys.openai:
                settings.api_keys.openai = encrypted_keys[idx]
                idx += 1
            if settings.api_keys.gemini:
                settings.api_keys.gemini = encrypted_keys[idx]
                idx += 1
            if settings.api_keys.anthropic:
                settings.api_keys.anthropic = encrypted_keys[idx]

    user.settings = settings.json()
    await db.commit()

    # Clear cache for this user's settings
    _parse_settings_json.cache_clear()


@router.get("", response_model=UserSettings, response_class=ORJSONResponse)
@cached(
    ttl=CacheTTL.MEDIUM,
    key_builder=lambda current_user, **kwargs: f"user:settings:{current_user.id}",
    level=CacheLevel.MEMORY,
)
async def get_settings(
    current_user: User = Depends(get_current_user),
) -> UserSettings:
    """Get user settings with automatic model migration and caching."""
    settings = _get_user_settings(current_user)

    # Decrypt and mask API keys concurrently
    if settings.api_keys:
        tasks = []
        keys_to_decrypt = []

        if settings.api_keys.openai:
            tasks.append(asyncio.to_thread(encryption_service.decrypt, settings.api_keys.openai))
            keys_to_decrypt.append("openai")
        if settings.api_keys.gemini:
            tasks.append(asyncio.to_thread(encryption_service.decrypt, settings.api_keys.gemini))
            keys_to_decrypt.append("gemini")
        if settings.api_keys.anthropic:
            tasks.append(asyncio.to_thread(encryption_service.decrypt, settings.api_keys.anthropic))
            keys_to_decrypt.append("anthropic")

        if tasks:
            decrypted_keys = await asyncio.gather(*tasks)
            for i, key_name in enumerate(keys_to_decrypt):
                if decrypted_keys[i]:
                    setattr(settings.api_keys, key_name, encryption_service.mask_api_key(decrypted_keys[i]))

    # Determine available providers based on validated API keys
    available_providers = set()
    if settings.api_keys.openai_validated:
        available_providers.add("openai")
    if settings.api_keys.gemini_validated:
        available_providers.add("gemini")
    if settings.api_keys.anthropic_validated:
        available_providers.add("anthropic")

    # Update model selections based on size preferences
    if settings.models:
        # Get best models based on preferences
        provider_pref = (
            ModelProvider(settings.models.provider_preference) if settings.models.provider_preference else None
        )
        chat_size = ModelSize(settings.models.chat_size) if settings.models.chat_size else ModelSize.LARGE
        translate_size = (
            ModelSize(settings.models.translate_size) if settings.models.translate_size else ModelSize.SMALL
        )

        best_chat_model = model_service.get_best_model(
            size=chat_size, provider=provider_pref, purpose="chat", available_providers=available_providers
        )

        best_translate_model = model_service.get_best_model(
            size=translate_size, provider=provider_pref, purpose="translate", available_providers=available_providers
        )

        if best_chat_model:
            settings.models.chat_model = best_chat_model
        if best_translate_model:
            settings.models.translate_model = best_translate_model

    return settings


@router.put("", response_model=UserSettings, response_class=ORJSONResponse)
async def update_settings(
    settings: UserSettings,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserSettings:
    """Update all user settings."""
    await _save_user_settings(current_user, settings, db)
    # Invalidate cache after update
    from app.core.cache import multi_cache

    await multi_cache.delete(f"user:settings:{current_user.id}")
    return await get_settings(current_user)


@router.patch("", response_model=UserSettings, response_class=ORJSONResponse)
async def patch_settings(
    settings_update: UserSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserSettings:
    """Partially update user settings."""
    current_settings = _get_user_settings(current_user)

    # Update only provided fields
    update_data = settings_update.dict(exclude_unset=True)

    for field, value in update_data.items():
        if value is not None:
            if field in ["general", "models", "layout", "api_keys"]:
                # For nested objects, update individual fields
                current_field = getattr(current_settings, field)
                if isinstance(value, dict):
                    for sub_field, sub_value in value.items():
                        setattr(current_field, sub_field, sub_value)
            else:
                setattr(current_settings, field, value)

    await _save_user_settings(current_user, current_settings, db)
    # Invalidate cache after update
    from app.core.cache import multi_cache

    await multi_cache.delete(f"user:settings:{current_user.id}")
    return await get_settings(current_user)


@router.post("/api-keys", response_model=ApiKeyResponse, response_class=ORJSONResponse)
async def update_api_key(
    request: ApiKeyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiKeyResponse:
    """Update a specific API key."""
    if request.provider not in ["openai", "gemini", "anthropic"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid provider. Must be openai, gemini, or anthropic",
        )

    settings = _get_user_settings(current_user)

    # Update the specific API key
    setattr(settings.api_keys, request.provider, request.key)
    setattr(settings.api_keys, f"{request.provider}_validated", False)  # Reset validation

    await _save_user_settings(current_user, settings, db)

    return ApiKeyResponse(
        provider=request.provider,
        masked_key=encryption_service.mask_api_key(request.key),
        validated=False,
    )


@router.delete("/api-keys/{provider}")
async def delete_api_key(
    provider: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Delete a specific API key."""
    if provider not in ["openai", "gemini", "anthropic"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid provider. Must be openai, gemini, or anthropic",
        )

    settings = _get_user_settings(current_user)

    # Clear the API key
    setattr(settings.api_keys, provider, None)
    setattr(settings.api_keys, f"{provider}_validated", False)

    await _save_user_settings(current_user, settings, db)

    return {"message": f"API key for {provider} deleted successfully"}


@router.get("/models", response_class=ORJSONResponse)
@cached(
    ttl=CacheTTL.LONG,
    key_builder=lambda size, provider, current_user, **kwargs: f"models:{current_user.id}:{size}:{provider}",
    level=CacheLevel.MEMORY,
)
async def get_available_models(
    size: Optional[str] = None,
    provider: Optional[str] = None,
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Get available models based on user's API keys and preferences."""
    settings = _get_user_settings(current_user)

    # Determine available providers
    available_providers = set()
    if settings.api_keys.openai_validated:
        available_providers.add("openai")
    if settings.api_keys.gemini_validated:
        available_providers.add("gemini")
    if settings.api_keys.anthropic_validated:
        available_providers.add("anthropic")

    # Parse parameters
    model_size = ModelSize(size) if size else None
    model_provider = ModelProvider(provider) if provider else None

    # Get available models
    models = model_service.get_available_models(size=model_size, provider=model_provider)

    # Filter by available providers
    filtered_models = {}
    for model_id, model_info in models.items():
        if model_info.provider.value in available_providers:
            filtered_models[model_id] = model_info.dict()

    return {
        "models": filtered_models,
        "available_providers": list(available_providers),
    }


@router.post("/migrate", response_class=ORJSONResponse)
async def migrate_settings(
    local_settings: Dict[str, Any],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserSettings:
    """Migrate settings from localStorage to server."""
    # Parse local settings and map to our schema
    settings = UserSettings()

    # Map localStorage keys to our schema
    if "LANGUAGE" in local_settings:
        settings.general.language = local_settings["LANGUAGE"]
    if "TRANSLATE_TARGET_LANGUAGE" in local_settings:
        settings.general.translate_target_language = local_settings["TRANSLATE_TARGET_LANGUAGE"]
    if "USER_MEMORY" in local_settings:
        settings.general.user_memory = local_settings["USER_MEMORY"]

    if "CHAT_MODEL" in local_settings:
        # Migrate old model to size preference
        old_model = local_settings["CHAT_MODEL"]
        _, chat_size = model_service.migrate_model_selection(old_model)
        settings.models.chat_model = old_model  # Keep for reference
        settings.models.chat_size = chat_size.value
    if "TRANSLATE_MODEL" in local_settings:
        # Migrate old model to size preference
        old_model = local_settings["TRANSLATE_MODEL"]
        _, translate_size = model_service.migrate_model_selection(old_model)
        settings.models.translate_model = old_model  # Keep for reference
        settings.models.translate_size = translate_size.value

    if "THEME" in local_settings:
        settings.layout.theme = local_settings["THEME"]
    if "SHOW_TOGGLE" in local_settings:
        settings.layout.show_toggle = local_settings["SHOW_TOGGLE"]
    if "TOGGLE_Y_POSITION" in local_settings:
        settings.layout.toggle_y_position = local_settings["TOGGLE_Y_POSITION"]
    if "SHOW_YOUTUBE_CAPTION_TOGGLE" in local_settings:
        settings.layout.show_youtube_caption_toggle = local_settings["SHOW_YOUTUBE_CAPTION_TOGGLE"]
    if "SHOW_YOUTUBE_BILINGUAL_CAPTION" in local_settings:
        settings.layout.show_youtube_bilingual_caption = local_settings["SHOW_YOUTUBE_BILINGUAL_CAPTION"]
    if "USE_YOUTUBE_KEYBOARD_NAVIGATE" in local_settings:
        settings.layout.use_youtube_keyboard_navigate = local_settings["USE_YOUTUBE_KEYBOARD_NAVIGATE"]
    if "YOUTUBE_CAPTION_SIZE_RATIO" in local_settings:
        settings.layout.youtube_caption_size_ratio = local_settings["YOUTUBE_CAPTION_SIZE_RATIO"]
    if "TOGGLE_HIDDEN_SITE_LIST" in local_settings:
        settings.layout.toggle_hidden_site_list = local_settings["TOGGLE_HIDDEN_SITE_LIST"]

    # API keys
    if "OPENAI_KEY" in local_settings:
        settings.api_keys.openai = local_settings["OPENAI_KEY"]
    if "GEMINI_KEY" in local_settings:
        settings.api_keys.gemini = local_settings["GEMINI_KEY"]
    if "ANTHROPIC_KEY" in local_settings:
        settings.api_keys.anthropic = local_settings["ANTHROPIC_KEY"]
    if "OPENAI_VALIDATED" in local_settings:
        settings.api_keys.openai_validated = local_settings["OPENAI_VALIDATED"]
    if "GEMINI_VALIDATED" in local_settings:
        settings.api_keys.gemini_validated = local_settings["GEMINI_VALIDATED"]
    if "ANTHROPIC_VALIDATED" in local_settings:
        settings.api_keys.anthropic_validated = local_settings["ANTHROPIC_VALIDATED"]

    if "API_MODE" in local_settings:
        settings.api_mode = local_settings["API_MODE"]
    if "API_MODE_PREFERENCE" in local_settings:
        settings.api_mode_preference = local_settings["API_MODE_PREFERENCE"]
    if "PDF_TRANSLATE_NO_DUAL" in local_settings:
        settings.pdf_translate_no_dual = local_settings["PDF_TRANSLATE_NO_DUAL"]

    await _save_user_settings(current_user, settings, db)
    return await get_settings(current_user)
