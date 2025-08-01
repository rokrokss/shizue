"""Service for managing model mappings and automatic upgrades."""

from typing import Dict, Optional

from app.schemas.model_mapping import DEFAULT_MODEL_MAPPING, ModelInfo, ModelMapping, ModelProvider, ModelSize


class ModelMappingService:
    """Service for managing model mappings and user preferences."""

    def __init__(self):
        self.mapping = DEFAULT_MODEL_MAPPING

    def get_best_model(
        self,
        size: ModelSize,
        provider: Optional[ModelProvider] = None,
        purpose: str = "chat",
        available_providers: Optional[set] = None,
    ) -> Optional[str]:
        """
        Get the best available model based on user preferences.

        Args:
            size: Preferred model size (large or small)
            provider: Preferred provider (optional)
            purpose: Model purpose ('chat' or 'translate')
            available_providers: Set of providers with valid API keys

        Returns:
            Model ID of the best available model
        """
        # Filter models by size and active status
        candidates = [
            model
            for model in self.mapping.models.values()
            if model.size == size and model.active and not model.deprecated
        ]

        # Filter by available providers if specified
        if available_providers:
            candidates = [model for model in candidates if model.provider.value in available_providers]

        # If no candidates, return default
        if not candidates:
            if purpose == "chat":
                return self.mapping.default_chat_large if size == ModelSize.LARGE else self.mapping.default_chat_small
            else:
                return (
                    self.mapping.default_translate_large
                    if size == ModelSize.LARGE
                    else self.mapping.default_translate_small
                )

        # Prefer specified provider if available
        if provider:
            provider_models = [m for m in candidates if m.provider == provider]
            if provider_models:
                # Sort by version (newest first)
                provider_models.sort(key=lambda x: x.version, reverse=True)
                return provider_models[0].id

        # Sort all candidates by version and return newest
        candidates.sort(key=lambda x: x.version, reverse=True)
        return candidates[0].id

    def migrate_model_selection(self, old_model_id: str) -> tuple[str, ModelSize]:
        """
        Migrate from old model ID to new model and size preference.

        Args:
            old_model_id: The previously selected model ID

        Returns:
            Tuple of (new_model_id, model_size)
        """
        # Check if model exists in current mapping
        if old_model_id in self.mapping.models:
            model = self.mapping.models[old_model_id]

            # If model is deprecated, return successor
            if model.deprecated and model.successor_id:
                successor = self.mapping.models.get(model.successor_id)
                if successor:
                    return successor.id, successor.size

            # Return current model and its size
            return model.id, model.size

        # Fallback: try to determine size from model name
        if "mini" in old_model_id.lower() or "lite" in old_model_id.lower() or "haiku" in old_model_id.lower():
            return self.mapping.default_chat_small, ModelSize.SMALL
        else:
            return self.mapping.default_chat_large, ModelSize.LARGE

    def get_available_models(
        self, size: Optional[ModelSize] = None, provider: Optional[ModelProvider] = None
    ) -> Dict[str, ModelInfo]:
        """
        Get all available models filtered by size and provider.

        Args:
            size: Filter by model size (optional)
            provider: Filter by provider (optional)

        Returns:
            Dictionary of available models
        """
        models = {}

        for model_id, model in self.mapping.models.items():
            if not model.active or model.deprecated:
                continue

            if size and model.size != size:
                continue

            if provider and model.provider != provider:
                continue

            models[model_id] = model

        return models

    def update_model_mapping(self, new_mapping: ModelMapping) -> None:
        """
        Update the model mapping configuration.

        This would typically be called when deploying new models or deprecating old ones.

        Args:
            new_mapping: New model mapping configuration
        """
        self.mapping = new_mapping

    def get_provider_from_model_id(self, model_id: str) -> Optional[ModelProvider]:
        """
        Get the provider for a specific model ID.

        Args:
            model_id: Model ID to look up

        Returns:
            Provider for the model, or None if not found
        """
        model = self.mapping.models.get(model_id)
        return model.provider if model else None


# Global instance
model_service = ModelMappingService()
