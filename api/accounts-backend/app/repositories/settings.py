"""Settings repository with CQRS pattern implementation."""

from typing import Dict, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import CacheKey, CacheLevel, CacheTTL
from app.core.encryption import decrypt_data, encrypt_data
from app.core.logging import logger
from app.models.user import User
from app.repositories.base import ReadOnlyRepository
from app.schemas.settings import SettingsUpdate


class SettingsQueryRepository(ReadOnlyRepository[User]):
    """Read-only repository for settings queries (CQRS Query side)."""

    def __init__(self, db: AsyncSession):
        super().__init__(User, db)

    async def get_settings(self, user_id: UUID) -> Optional[Dict]:
        """Get user settings (decrypted)."""
        # Try cache first
        cache_key = CacheKey.user_settings(str(user_id))
        cached_settings = await self.cache.get(cache_key, CacheLevel.MEMORY)
        if cached_settings:
            return cached_settings

        # Query database
        user = await self.get(user_id)
        if not user or not user.settings:
            return None

        # Decrypt settings
        try:
            decrypted_settings = decrypt_data(user.settings)

            # Cache decrypted settings in memory only (short TTL)
            await self.cache.set(cache_key, decrypted_settings, ttl=CacheTTL.SHORT, level=CacheLevel.MEMORY)

            return decrypted_settings
        except Exception as e:
            logger.error(f"Failed to decrypt settings for user {user_id}: {e}")
            return None

    async def get_model_preferences(self, user_id: UUID) -> Optional[Dict]:
        """Get user's model preferences."""
        settings = await self.get_settings(user_id)
        if not settings:
            return None

        return settings.get("model_settings", {})

    async def get_display_preferences(self, user_id: UUID) -> Optional[Dict]:
        """Get user's display preferences."""
        settings = await self.get_settings(user_id)
        if not settings:
            return None

        return settings.get("display_settings", {})

    async def get_api_keys(self, user_id: UUID) -> Optional[Dict]:
        """Get user's API keys (masked)."""
        settings = await self.get_settings(user_id)
        if not settings:
            return None

        api_keys = settings.get("api_keys", {})

        # Mask API keys for security
        masked_keys = {}
        for provider, key in api_keys.items():
            if key and len(key) > 8:
                masked_keys[provider] = f"{key[:4]}...{key[-4:]}"
            else:
                masked_keys[provider] = key

        return masked_keys

    async def has_valid_api_keys(self, user_id: UUID) -> bool:
        """Check if user has any valid API keys configured."""
        settings = await self.get_settings(user_id)
        if not settings:
            return False

        api_keys = settings.get("api_keys", {})
        validations = settings.get("api_key_validations", {})

        # Check if any provider has both key and validation
        for provider in ["openai", "gemini", "anthropic"]:
            if api_keys.get(provider) and validations.get(f"{provider}_validated"):
                return True

        return False


class SettingsCommandRepository:
    """Write repository for settings commands (CQRS Command side)."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.cache = ReadOnlyRepository(User, db).cache

    async def update_settings(self, user_id: UUID, settings_update: SettingsUpdate) -> Optional[Dict]:
        """Update user settings (with encryption)."""
        # Get user
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if not user:
            return None

        # Get existing settings
        existing_settings = {}
        if user.settings:
            try:
                existing_settings = decrypt_data(user.settings)
            except Exception as e:
                logger.error(f"Failed to decrypt existing settings: {e}")

        # Merge settings
        update_dict = settings_update.dict(exclude_unset=True)
        for key, value in update_dict.items():
            if value is not None:
                existing_settings[key] = value

        # Encrypt and save
        encrypted_settings = encrypt_data(existing_settings)
        user.settings = encrypted_settings

        # Update metadata
        if "model_settings" in update_dict:
            user.preferred_chat_model = update_dict["model_settings"].get("chat_model")
            user.preferred_translate_model = update_dict["model_settings"].get("translate_model")

        await self.db.commit()

        # Invalidate caches
        await self._invalidate_settings_cache(user_id)

        # Emit domain event
        await self._emit_settings_updated_event(user_id, update_dict)

        logger.info(f"Updated settings for user {user_id}")
        return existing_settings

    async def set_api_key(self, user_id: UUID, provider: str, api_key: str, validated: bool = False) -> bool:
        """Set an API key for a specific provider."""
        # Get user
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if not user:
            return False

        # Get existing settings
        existing_settings = {}
        if user.settings:
            try:
                existing_settings = decrypt_data(user.settings)
            except Exception as e:
                logger.error(f"Failed to decrypt existing settings: {e}")

        # Update API key
        if "api_keys" not in existing_settings:
            existing_settings["api_keys"] = {}
        existing_settings["api_keys"][provider] = api_key

        # Update validation status
        if "api_key_validations" not in existing_settings:
            existing_settings["api_key_validations"] = {}
        existing_settings["api_key_validations"][f"{provider}_validated"] = validated

        # Encrypt and save
        user.settings = encrypt_data(existing_settings)
        await self.db.commit()

        # Invalidate caches
        await self._invalidate_settings_cache(user_id)

        logger.info(f"Set API key for provider {provider} for user {user_id}")
        return True

    async def remove_api_key(self, user_id: UUID, provider: str) -> bool:
        """Remove an API key for a specific provider."""
        # Get user
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if not user:
            return False

        # Get existing settings
        existing_settings = {}
        if user.settings:
            try:
                existing_settings = decrypt_data(user.settings)
            except Exception as e:
                logger.error(f"Failed to decrypt existing settings: {e}")
                return False

        # Remove API key and validation
        if "api_keys" in existing_settings:
            existing_settings["api_keys"].pop(provider, None)
        if "api_key_validations" in existing_settings:
            existing_settings["api_key_validations"].pop(f"{provider}_validated", None)

        # Encrypt and save
        user.settings = encrypt_data(existing_settings)
        await self.db.commit()

        # Invalidate caches
        await self._invalidate_settings_cache(user_id)

        logger.info(f"Removed API key for provider {provider} for user {user_id}")
        return True

    async def migrate_settings_from_json(self, user_id: UUID, json_settings: Dict) -> bool:
        """Migrate settings from JSON format (for backwards compatibility)."""
        try:
            # Get user
            result = await self.db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()

            if not user:
                return False

            # Encrypt and save
            user.settings = encrypt_data(json_settings)
            await self.db.commit()

            # Invalidate caches
            await self._invalidate_settings_cache(user_id)

            logger.info(f"Migrated settings from JSON for user {user_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to migrate settings for user {user_id}: {e}")
            return False

    async def _invalidate_settings_cache(self, user_id: UUID) -> None:
        """Invalidate settings-related caches."""
        cache_key = CacheKey.user_settings(str(user_id))
        await self.cache.delete(cache_key)
        await self.cache.invalidate_pattern(f"user:settings:{user_id}")

    async def _emit_settings_updated_event(self, user_id: UUID, updated_fields: Dict) -> None:
        """Emit domain event when settings are updated."""
        from app.core.events import EventType, publish_settings_event

        await publish_settings_event(
            event_type=EventType.SETTINGS_UPDATED, user_id=user_id, settings_data=updated_fields
        )


class SettingsRepository:
    """Combined settings repository with CQRS pattern."""

    def __init__(self, db: AsyncSession):
        self.query = SettingsQueryRepository(db)
        self.command = SettingsCommandRepository(db)
        self.db = db

    # Query methods (delegate to query repository)
    async def get_settings(self, user_id: UUID) -> Optional[Dict]:
        return await self.query.get_settings(user_id)

    async def get_model_preferences(self, user_id: UUID) -> Optional[Dict]:
        return await self.query.get_model_preferences(user_id)

    async def get_display_preferences(self, user_id: UUID) -> Optional[Dict]:
        return await self.query.get_display_preferences(user_id)

    async def get_api_keys(self, user_id: UUID) -> Optional[Dict]:
        return await self.query.get_api_keys(user_id)

    async def has_valid_api_keys(self, user_id: UUID) -> bool:
        return await self.query.has_valid_api_keys(user_id)

    # Command methods (delegate to command repository)
    async def update_settings(self, user_id: UUID, settings_update: SettingsUpdate) -> Optional[Dict]:
        return await self.command.update_settings(user_id, settings_update)

    async def set_api_key(self, user_id: UUID, provider: str, api_key: str, validated: bool = False) -> bool:
        return await self.command.set_api_key(user_id, provider, api_key, validated)

    async def remove_api_key(self, user_id: UUID, provider: str) -> bool:
        return await self.command.remove_api_key(user_id, provider)

    async def migrate_settings_from_json(self, user_id: UUID, json_settings: Dict) -> bool:
        return await self.command.migrate_settings_from_json(user_id, json_settings)
