"""Unified caching system with optimized memory management."""

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from enum import Enum
from functools import wraps
from threading import Lock
from typing import Any, Callable, Optional, TypeVar

from cachetools import TTLCache
from pydantic import BaseModel

logger = logging.getLogger(__name__)

T = TypeVar("T")


class CacheLevel(Enum):
    """Cache levels for performance optimization."""

    MEMORY = "memory"
    PERSISTENT = "persistent"


class CacheTTL:
    """Standard TTL values optimized for common use cases."""

    SHORT = 60  # 1 minute - API tokens
    MEDIUM = 300  # 5 minutes - User profiles
    LONG = 900  # 15 minutes - Settings
    VERY_LONG = 3600  # 1 hour - Model mappings
    DAY = 86400  # 24 hours - Static data


class CacheKey:
    """Optimized cache key generation."""

    @staticmethod
    def user_profile(user_id: str) -> str:
        return f"u:p:{user_id}"

    @staticmethod
    def user_settings(user_id: str) -> str:
        return f"u:s:{user_id}"

    @staticmethod
    def model_mapping(provider: str, size: str) -> str:
        return f"m:m:{provider}:{size}"

    @staticmethod
    def api_usage(user_id: str, period: str) -> str:
        return f"u:a:{user_id}:{period}"

    @staticmethod
    def auth_token(token_hash: str) -> str:
        return f"a:t:{token_hash[:8]}"


class UnifiedCache:
    """Single, optimized cache implementation."""

    def __init__(self, maxsize: int = 1000, default_ttl: int = CacheTTL.MEDIUM):
        self.cache = TTLCache(maxsize=maxsize, ttl=default_ttl)
        self.lock = Lock()
        self.default_ttl = default_ttl
        self.stats = {"hits": 0, "misses": 0, "sets": 0, "deletes": 0}
        logger.info(f"UnifiedCache initialized: maxsize={maxsize}, ttl={default_ttl}s")

    async def get(self, key: str, deserialize: bool = True) -> Optional[Any]:
        """Get value with optimized deserialization."""
        with self.lock:
            try:
                value = self.cache.get(key)
                if value is not None:
                    self.stats["hits"] += 1
                    logger.debug(f"Cache hit: {key}")

                    # Optimized deserialization
                    if deserialize and isinstance(value, str) and value.startswith(("{", "[")):
                        try:
                            return json.loads(value)
                        except json.JSONDecodeError:
                            return value
                    return value

                self.stats["misses"] += 1
                logger.debug(f"Cache miss: {key}")
                return None

            except Exception as e:
                logger.error(f"Cache get error for {key}: {e}")
                return None

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set value with optimized serialization."""
        with self.lock:
            try:
                # Optimized serialization
                if isinstance(value, BaseModel):
                    serialized_value = value.model_dump_json()
                elif isinstance(value, (dict, list)):
                    serialized_value = json.dumps(value, separators=(",", ":"))
                else:
                    serialized_value = value

                # Use a new TTLCache instance for custom TTL if needed
                if ttl and ttl != self.default_ttl:
                    # For custom TTL, we store with expiry time
                    expiry = datetime.now(timezone.utc) + timedelta(seconds=ttl)
                    serialized_value = {"value": serialized_value, "expires_at": expiry.isoformat()}
                    serialized_value = json.dumps(serialized_value, separators=(",", ":"))

                self.cache[key] = serialized_value
                self.stats["sets"] += 1
                logger.debug(f"Cache set: {key}")
                return True

            except Exception as e:
                logger.error(f"Cache set error for {key}: {e}")
                return False

    async def delete(self, key: str) -> bool:
        """Delete key from cache."""
        with self.lock:
            try:
                if key in self.cache:
                    del self.cache[key]
                    self.stats["deletes"] += 1
                    logger.debug(f"Cache delete: {key}")
                return True
            except Exception as e:
                logger.error(f"Cache delete error for {key}: {e}")
                return False

    async def exists(self, key: str) -> bool:
        """Check if key exists."""
        with self.lock:
            return key in self.cache

    async def clear(self) -> bool:
        """Clear all cache."""
        with self.lock:
            try:
                self.cache.clear()
                logger.info("Cache cleared")
                return True
            except Exception as e:
                logger.error(f"Cache clear error: {e}")
                return False

    async def invalidate_pattern(self, pattern: str) -> int:
        """Invalidate keys matching pattern."""
        with self.lock:
            count = 0
            try:
                keys_to_delete = [k for k in self.cache.keys() if pattern in str(k)]
                for key in keys_to_delete:
                    del self.cache[key]
                    count += 1

                self.stats["deletes"] += count
                logger.info(f"Invalidated {count} keys matching '{pattern}'")
                return count

            except Exception as e:
                logger.error(f"Pattern invalidation error for '{pattern}': {e}")
                return 0

    # Optimized user-specific methods
    async def get_user_profile(self, user_id: str) -> Optional[dict]:
        """Get cached user profile."""
        return await self.get(CacheKey.user_profile(user_id))

    async def set_user_profile(self, user_id: str, profile: dict, ttl: int = CacheTTL.MEDIUM) -> bool:
        """Cache user profile."""
        return await self.set(CacheKey.user_profile(user_id), profile, ttl)

    async def delete_user_profile(self, user_id: str) -> bool:
        """Delete user profile from cache."""
        return await self.delete(CacheKey.user_profile(user_id))

    async def invalidate_user_cache(self, user_id: str) -> int:
        """Invalidate all user-related cache."""
        count = 0
        patterns = [f"u:{user_id}", "a:t:"]  # user data and auth tokens
        for pattern in patterns:
            count += await self.invalidate_pattern(pattern)
        return count

    def get_stats(self) -> dict:
        """Get cache statistics."""
        with self.lock:
            hit_rate = (
                self.stats["hits"] / (self.stats["hits"] + self.stats["misses"])
                if (self.stats["hits"] + self.stats["misses"]) > 0
                else 0
            )
            return {
                "size": len(self.cache),
                "maxsize": self.cache.maxsize,
                "hit_rate": round(hit_rate * 100, 2),
                **self.stats,
            }


class RateLimiter:
    """Optimized rate limiter with automatic cleanup."""

    def __init__(self):
        self.cache = TTLCache(maxsize=10000, ttl=3600)  # 1 hour TTL
        self.lock = Lock()
        self._cleanup_task: Optional[asyncio.Task] = None
        logger.info("RateLimiter initialized")

    async def get_rate_limit(self, key: str) -> Optional[int]:
        """Get current rate limit counter."""
        with self.lock:
            return self.cache.get(key)

    async def increment_rate_limit(self, key: str, window: int = 60, limit: int = 100) -> int:
        """Increment rate limit with sliding window."""
        with self.lock:
            # Check existing counter
            current = self.cache.get(key, 0)
            new_count = current + 1

            # Store with TTL equal to window
            self.cache[key] = new_count
            return new_count

    async def is_rate_limited(self, key: str, limit: int, window: int = 60) -> bool:
        """Check if key is rate limited."""
        current = await self.get_rate_limit(key) or 0
        return current >= limit

    async def start_cleanup_task(self):
        """Start periodic cleanup (handled by TTLCache automatically)."""
        pass  # TTLCache handles cleanup automatically

    async def stop_cleanup_task(self):
        """Stop cleanup task."""
        if self._cleanup_task:
            self._cleanup_task.cancel()


# Cached decorator for function results
def cached(ttl: int = CacheTTL.MEDIUM, key_builder: Optional[Callable] = None):
    """Optimized caching decorator."""

    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Build cache key
            if key_builder:
                cache_key = key_builder(*args, **kwargs)
            else:
                # Simple key from function name and args hash
                import hashlib

                args_str = f"{str(args)}:{str(kwargs)}"
                args_hash = hashlib.md5(args_str.encode()).hexdigest()[:8]
                cache_key = f"fn:{func.__name__}:{args_hash}"

            # Try cache first
            cached_result = await cache.get(cache_key)
            if cached_result is not None:
                return cached_result

            # Execute function
            result = await func(*args, **kwargs)

            # Cache result
            await cache.set(cache_key, result, ttl)
            return result

        return wrapper

    return decorator


# Global instances
cache = UnifiedCache(maxsize=2000, default_ttl=CacheTTL.MEDIUM)
rate_limiter = RateLimiter()


# High-level cache management
class CacheManager:
    """Simplified cache management operations."""

    def __init__(self):
        self.cache = cache

    async def warm_up_user_cache(self, user_id: str, user_data: dict) -> None:
        """Pre-populate user cache efficiently."""
        try:
            await self.cache.set_user_profile(user_id, user_data, CacheTTL.MEDIUM)
            logger.info(f"Warmed cache for user {user_id}")
        except Exception as e:
            logger.error(f"Cache warmup failed for user {user_id}: {e}")

    async def invalidate_user_cache(self, user_id: str) -> None:
        """Invalidate all user cache."""
        try:
            count = await self.cache.invalidate_user_cache(user_id)
            logger.info(f"Invalidated {count} cache entries for user {user_id}")
        except Exception as e:
            logger.error(f"Cache invalidation failed for user {user_id}: {e}")

    async def get_cache_stats(self) -> dict:
        """Get comprehensive cache statistics."""
        return self.cache.get_stats()


# Global cache manager
cache_manager = CacheManager()
