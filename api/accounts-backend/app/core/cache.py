"""Multi-level caching strategy for improved performance."""

import json
from enum import Enum
from functools import wraps
from typing import Any, Callable, Optional, TypeVar, Union

from cachetools import TTLCache
from pydantic import BaseModel

from app.core.logging import logger
from app.core.redis import cache as redis_cache

T = TypeVar("T")


class CacheLevel(Enum):
    """Cache levels in order of priority."""

    MEMORY = "memory"
    REDIS = "redis"
    DATABASE = "database"


class CacheTTL:
    """Standard TTL values for different cache types."""

    SHORT = 60  # 1 minute
    MEDIUM = 300  # 5 minutes
    LONG = 900  # 15 minutes
    VERY_LONG = 3600  # 1 hour
    DAY = 86400  # 24 hours


class CacheKey:
    """Cache key builder for consistent key generation."""

    @staticmethod
    def user_profile(user_id: str) -> str:
        return f"user:profile:{user_id}"

    @staticmethod
    def user_settings(user_id: str) -> str:
        return f"user:settings:{user_id}"

    @staticmethod
    def model_mapping(provider: str, size: str) -> str:
        return f"model:mapping:{provider}:{size}"

    @staticmethod
    def api_usage(user_id: str, period: str) -> str:
        return f"usage:{user_id}:{period}"

    @staticmethod
    def auth_token(token_hash: str) -> str:
        return f"auth:token:{token_hash}"


class MultiLevelCache:
    """Multi-level caching implementation with memory and Redis."""

    def __init__(self, memory_ttl: int = CacheTTL.SHORT, memory_maxsize: int = 1000):
        self.memory_cache = TTLCache(maxsize=memory_maxsize, ttl=memory_ttl)
        self.redis_cache = redis_cache

    async def get(self, key: str, level: CacheLevel = CacheLevel.MEMORY, deserialize: bool = True) -> Optional[Any]:
        """Get value from cache, checking levels in order."""
        try:
            # Check memory cache first
            if level == CacheLevel.MEMORY and key in self.memory_cache:
                logger.debug(f"Cache hit (memory): {key}")
                return self.memory_cache[key]

            # Check Redis cache
            if level in [CacheLevel.MEMORY, CacheLevel.REDIS]:
                value = await self.redis_cache.get(key)
                if value:
                    logger.debug(f"Cache hit (redis): {key}")
                    if deserialize and isinstance(value, str):
                        value = json.loads(value)

                    # Populate memory cache if missing
                    if level == CacheLevel.MEMORY:
                        self.memory_cache[key] = value

                    return value

            logger.debug(f"Cache miss: {key}")
            return None

        except Exception as e:
            logger.error(f"Cache get error for key {key}: {e}")
            return None

    async def set(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None,
        level: CacheLevel = CacheLevel.MEMORY,
        serialize: bool = True,
    ) -> bool:
        """Set value in cache at specified levels."""
        try:
            # Serialize if needed
            if serialize and not isinstance(value, (str, bytes, int, float)):
                if isinstance(value, BaseModel):
                    value = value.json()
                else:
                    value = json.dumps(value)

            # Set in memory cache
            if level == CacheLevel.MEMORY:
                self.memory_cache[key] = value

            # Set in Redis cache
            if level in [CacheLevel.MEMORY, CacheLevel.REDIS]:
                await self.redis_cache.set(key, value, ttl)

            logger.debug(f"Cache set: {key} (ttl={ttl})")
            return True

        except Exception as e:
            logger.error(f"Cache set error for key {key}: {e}")
            return False

    async def delete(self, key: str) -> bool:
        """Delete value from all cache levels."""
        try:
            # Remove from memory cache
            self.memory_cache.pop(key, None)

            # Remove from Redis cache
            await self.redis_cache.delete(key)

            logger.debug(f"Cache delete: {key}")
            return True

        except Exception as e:
            logger.error(f"Cache delete error for key {key}: {e}")
            return False

    async def invalidate_pattern(self, pattern: str) -> int:
        """Invalidate all keys matching a pattern."""
        count = 0
        try:
            # Clear matching keys from memory cache
            keys_to_delete = [k for k in self.memory_cache.keys() if pattern in str(k)]
            for key in keys_to_delete:
                self.memory_cache.pop(key, None)
                count += 1

            # Clear from Redis (if Redis supports pattern deletion)
            # This is implementation-specific based on Redis client

            logger.info(f"Cache invalidated {count} keys matching pattern: {pattern}")
            return count

        except Exception as e:
            logger.error(f"Cache invalidation error for pattern {pattern}: {e}")
            return 0


# Global cache instance
multi_cache = MultiLevelCache()


def cached(ttl: int = CacheTTL.MEDIUM, key_builder: Optional[Callable] = None, level: CacheLevel = CacheLevel.MEMORY):
    """Decorator for caching function results."""

    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Build cache key
            if key_builder:
                cache_key = key_builder(*args, **kwargs)
            else:
                # Simple key from function name and args
                cache_key = f"{func.__name__}:{str(args)}:{str(kwargs)}"

            # Try to get from cache
            cached_value = await multi_cache.get(cache_key, level)
            if cached_value is not None:
                return cached_value

            # Execute function
            result = await func(*args, **kwargs)

            # Cache the result
            await multi_cache.set(cache_key, result, ttl, level)

            return result

        return wrapper

    return decorator


class CacheManager:
    """High-level cache management operations."""

    def __init__(self):
        self.cache = multi_cache

    async def warm_up_user_cache(self, user_id: str, user_data: dict) -> None:
        """Pre-populate cache with user data."""
        try:
            # Cache user profile
            profile_key = CacheKey.user_profile(user_id)
            await self.cache.set(profile_key, user_data, CacheTTL.LONG, CacheLevel.REDIS)

            # Cache user settings if available
            if "settings" in user_data:
                settings_key = CacheKey.user_settings(user_id)
                await self.cache.set(settings_key, user_data["settings"], CacheTTL.MEDIUM, CacheLevel.MEMORY)

            logger.info(f"Warmed up cache for user {user_id}")

        except Exception as e:
            logger.error(f"Failed to warm up cache for user {user_id}: {e}")

    async def invalidate_user_cache(self, user_id: str) -> None:
        """Invalidate all cache entries for a user."""
        try:
            # Delete specific keys
            await self.cache.delete(CacheKey.user_profile(user_id))
            await self.cache.delete(CacheKey.user_settings(user_id))

            # Invalidate pattern-based keys
            await self.cache.invalidate_pattern(f"user:{user_id}")
            await self.cache.invalidate_pattern(f"usage:{user_id}")

            logger.info(f"Invalidated cache for user {user_id}")

        except Exception as e:
            logger.error(f"Failed to invalidate cache for user {user_id}: {e}")

    async def get_cache_stats(self) -> dict:
        """Get cache statistics."""
        return {
            "memory_cache_size": len(multi_cache.memory_cache),
            "memory_cache_maxsize": multi_cache.memory_cache.maxsize,
            "memory_cache_ttl": multi_cache.memory_cache.ttl,
        }


# Global cache manager
cache_manager = CacheManager()
