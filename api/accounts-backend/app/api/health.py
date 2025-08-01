"""Health check endpoints for monitoring."""

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache_manager
from app.core.circuit_breaker import circuit_breaker_registry
from app.core.config import settings
from app.core.database import get_db
from app.core.events import event_bus
from app.core.logging import logger
from app.core.redis import cache as redis_cache

router = APIRouter(prefix="/health", tags=["health"])


class HealthStatus(str, Enum):
    """Health check status."""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"


class ComponentHealth(BaseModel):
    """Health status of a component."""

    name: str
    status: HealthStatus
    latency_ms: Optional[float] = None
    message: Optional[str] = None
    metadata: Dict[str, Any] = {}


class HealthResponse(BaseModel):
    """Overall health response."""

    status: HealthStatus
    timestamp: datetime
    uptime_seconds: float
    version: str
    environment: str
    components: Dict[str, ComponentHealth]
    metadata: Dict[str, Any] = {}


# Track application start time
APP_START_TIME = datetime.now(timezone.utc)


async def check_database_health(db: AsyncSession) -> ComponentHealth:
    """Check database connectivity and performance."""
    import time

    start = time.time()
    try:
        # Execute simple query
        result = await db.execute(text("SELECT 1"))
        _ = result.scalar()

        # Calculate latency
        latency_ms = (time.time() - start) * 1000

        # Check connection pool stats
        pool = db.bind.pool
        pool_stats = {
            "size": pool.size(),
            "checked_in": pool.checkedin(),
            "checked_out": pool.checkedout(),
            "overflow": pool.overflow(),
            "total": pool.total,
        }

        # Determine status based on pool usage
        pool_usage = pool.checkedout() / pool.size() if pool.size() > 0 else 0
        if pool_usage > 0.9:
            status = HealthStatus.DEGRADED
            message = "High connection pool usage"
        elif latency_ms > 100:
            status = HealthStatus.DEGRADED
            message = "High database latency"
        else:
            status = HealthStatus.HEALTHY
            message = "Database is healthy"

        return ComponentHealth(
            name="database", status=status, latency_ms=latency_ms, message=message, metadata={"pool": pool_stats}
        )

    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return ComponentHealth(
            name="database", status=HealthStatus.UNHEALTHY, message=str(e), latency_ms=(time.time() - start) * 1000
        )


async def check_redis_health() -> ComponentHealth:
    """Check Redis connectivity and performance."""
    import time

    start = time.time()
    try:
        # Test Redis connection
        test_key = "_health_check"
        test_value = str(datetime.now(timezone.utc))

        await redis_cache.set(test_key, test_value, ttl=10)
        retrieved = await redis_cache.get(test_key)

        latency_ms = (time.time() - start) * 1000

        if retrieved != test_value:
            status = HealthStatus.DEGRADED
            message = "Redis read/write mismatch"
        elif latency_ms > 50:
            status = HealthStatus.DEGRADED
            message = "High Redis latency"
        else:
            status = HealthStatus.HEALTHY
            message = "Redis is healthy"

        # Get Redis info
        try:
            info = await redis_cache.redis.info()
            metadata = {
                "connected_clients": info.get("connected_clients"),
                "used_memory_human": info.get("used_memory_human"),
                "uptime_in_seconds": info.get("uptime_in_seconds"),
            }
        except Exception:
            metadata = {}

        return ComponentHealth(name="redis", status=status, latency_ms=latency_ms, message=message, metadata=metadata)

    except Exception as e:
        logger.error(f"Redis health check failed: {e}")
        return ComponentHealth(
            name="redis", status=HealthStatus.UNHEALTHY, message=str(e), latency_ms=(time.time() - start) * 1000
        )


def check_circuit_breakers_health() -> ComponentHealth:
    """Check circuit breaker states."""
    try:
        breaker_states = circuit_breaker_registry.get_all_status()

        # Count breakers by state
        states_count = {
            "closed": 0,
            "open": 0,
            "half_open": 0,
        }

        for breaker_status in breaker_states.values():
            state = breaker_status["state"]
            states_count[state] = states_count.get(state, 0) + 1

        # Determine overall status
        if states_count["open"] > 0:
            status = HealthStatus.DEGRADED
            message = f"{states_count['open']} circuit breakers are open"
        elif states_count["half_open"] > 0:
            status = HealthStatus.DEGRADED
            message = f"{states_count['half_open']} circuit breakers are half-open"
        else:
            status = HealthStatus.HEALTHY
            message = "All circuit breakers are closed"

        return ComponentHealth(
            name="circuit_breakers",
            status=status,
            message=message,
            metadata={
                "states": states_count,
                "breakers": breaker_states,
            },
        )

    except Exception as e:
        logger.error(f"Circuit breaker health check failed: {e}")
        return ComponentHealth(name="circuit_breakers", status=HealthStatus.UNHEALTHY, message=str(e))


def check_event_bus_health() -> ComponentHealth:
    """Check event bus status."""
    try:
        recent_events = event_bus.get_recent_events(10)

        # Check for recent errors
        error_events = [e for e in recent_events if "error" in e.event_type.value.lower()]

        if len(error_events) > 5:
            status = HealthStatus.DEGRADED
            message = f"High error event rate: {len(error_events)}/10"
        else:
            status = HealthStatus.HEALTHY
            message = "Event bus is healthy"

        return ComponentHealth(
            name="event_bus",
            status=status,
            message=message,
            metadata={
                "recent_events_count": len(recent_events),
                "error_events_count": len(error_events),
            },
        )

    except Exception as e:
        logger.error(f"Event bus health check failed: {e}")
        return ComponentHealth(name="event_bus", status=HealthStatus.UNHEALTHY, message=str(e))


async def check_cache_health() -> ComponentHealth:
    """Check cache system health."""
    try:
        cache_stats = await cache_manager.get_cache_stats()

        # Check memory cache usage
        usage_ratio = cache_stats["memory_cache_size"] / cache_stats["memory_cache_maxsize"]

        if usage_ratio > 0.9:
            status = HealthStatus.DEGRADED
            message = "High memory cache usage"
        else:
            status = HealthStatus.HEALTHY
            message = "Cache is healthy"

        return ComponentHealth(name="cache", status=status, message=message, metadata=cache_stats)

    except Exception as e:
        logger.error(f"Cache health check failed: {e}")
        return ComponentHealth(name="cache", status=HealthStatus.UNHEALTHY, message=str(e))


@router.get("/", response_model=HealthResponse)
async def health_check(db: AsyncSession = Depends(get_db)) -> HealthResponse:
    """Comprehensive health check endpoint."""
    # Check all components
    components = {
        "database": await check_database_health(db),
        "redis": await check_redis_health(),
        "circuit_breakers": check_circuit_breakers_health(),
        "event_bus": check_event_bus_health(),
        "cache": await check_cache_health(),
    }

    # Determine overall status
    unhealthy_count = sum(1 for c in components.values() if c.status == HealthStatus.UNHEALTHY)
    degraded_count = sum(1 for c in components.values() if c.status == HealthStatus.DEGRADED)

    if unhealthy_count > 0:
        overall_status = HealthStatus.UNHEALTHY
    elif degraded_count > 0:
        overall_status = HealthStatus.DEGRADED
    else:
        overall_status = HealthStatus.HEALTHY

    # Calculate uptime
    uptime_seconds = (datetime.now(timezone.utc) - APP_START_TIME).total_seconds()

    return HealthResponse(
        status=overall_status,
        timestamp=datetime.now(timezone.utc),
        uptime_seconds=uptime_seconds,
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
        components=components,
        metadata={
            "unhealthy_components": unhealthy_count,
            "degraded_components": degraded_count,
        },
    )


@router.get("/liveness", status_code=status.HTTP_200_OK)
async def liveness_check() -> Dict[str, str]:
    """Simple liveness check for Kubernetes."""
    return {
        "status": "alive",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/readiness", status_code=status.HTTP_200_OK)
async def readiness_check(db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Readiness check for Kubernetes."""
    # Quick checks for critical components
    try:
        # Check database
        await db.execute(text("SELECT 1"))

        # Check Redis
        await redis_cache.set("_readiness", "1", ttl=5)

        return {
            "status": "ready",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        return {
            "status": "not_ready",
            "error": str(e),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


@router.get("/startup", status_code=status.HTTP_200_OK)
async def startup_check() -> Dict[str, Any]:
    """Startup probe for Kubernetes."""
    # Check if application has been running for at least 10 seconds
    uptime_seconds = (datetime.now(timezone.utc) - APP_START_TIME).total_seconds()

    if uptime_seconds < 10:
        return {
            "status": "starting",
            "uptime_seconds": uptime_seconds,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    return {
        "status": "started",
        "uptime_seconds": uptime_seconds,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
