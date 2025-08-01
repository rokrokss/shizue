import json
import logging
from typing import Any, Optional

import redis.asyncio as redis

from app.core.config import settings

logger = logging.getLogger(__name__)

# Create Redis client
redis_client = redis.from_url(
    settings.REDIS_URL, encoding="utf-8", decode_responses=True
)


class RedisCache:
    """Redis cache service with JSON serialization"""

    def __init__(self, client: redis.Redis):
        self.client = client

    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        try:
            value = await self.client.get(key)
            if value:
                return json.loads(value)
            return None
        except Exception as e:
            logger.error(f"Redis get error for key {key}: {e}")
            return None

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set value in cache with optional TTL"""
        try:
            serialized = json.dumps(value)
            if ttl:
                await self.client.setex(key, ttl, serialized)
            else:
                await self.client.set(key, serialized)
            return True
        except Exception as e:
            logger.error(f"Redis set error for key {key}: {e}")
            return False

    async def delete(self, key: str) -> bool:
        """Delete key from cache"""
        try:
            await self.client.delete(key)
            return True
        except Exception as e:
            logger.error(f"Redis delete error for key {key}: {e}")
            return False

    async def exists(self, key: str) -> bool:
        """Check if key exists"""
        try:
            return bool(await self.client.exists(key))
        except Exception as e:
            logger.error(f"Redis exists error for key {key}: {e}")
            return False

    async def get_user_profile(self, user_id: str) -> Optional[dict]:
        """Get user profile from cache"""
        key = f"user:profile:{user_id}"
        return await self.get(key)

    async def set_user_profile(
        self, user_id: str, profile: dict, ttl: int = 3600
    ) -> bool:
        """Cache user profile (default 1 hour)"""
        key = f"user:profile:{user_id}"
        return await self.set(key, profile, ttl)

    async def invalidate_user_cache(self, user_id: str):
        """Invalidate all user-related cache"""
        pattern = f"user:*:{user_id}"
        async for key in self.client.scan_iter(match=pattern):
            await self.delete(key)

    async def get_rate_limit(self, key: str) -> Optional[int]:
        """Get rate limit counter"""
        try:
            value = await self.client.get(f"rate:{key}")
            return int(value) if value else None
        except Exception as e:
            logger.error(f"Redis rate limit get error for key {key}: {e}")
            return None

    async def increment_rate_limit(self, key: str, window: int = 60) -> int:
        """Increment rate limit counter with sliding window"""
        rate_key = f"rate:{key}"
        try:
            pipe = self.client.pipeline()
            pipe.incr(rate_key)
            pipe.expire(rate_key, window)
            results = await pipe.execute()
            return results[0]
        except Exception as e:
            logger.error(f"Redis rate limit increment error for key {key}: {e}")
            return 0


# Create cache instance
cache = RedisCache(redis_client)
