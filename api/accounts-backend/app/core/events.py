"""Event bus implementation for domain events."""

import asyncio
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Type
from uuid import UUID, uuid4

from app.core.logging import logger


class EventType(Enum):
    """Domain event types."""

    # User events
    USER_CREATED = "user.created"
    USER_UPDATED = "user.updated"
    USER_DELETED = "user.deleted"
    USER_LOGIN = "user.login"
    USER_LOGOUT = "user.logout"
    USER_PREMIUM_UPGRADED = "user.premium.upgraded"
    USER_PREMIUM_CANCELLED = "user.premium.cancelled"

    # Settings events
    SETTINGS_UPDATED = "settings.updated"
    API_KEY_ADDED = "settings.api_key.added"
    API_KEY_REMOVED = "settings.api_key.removed"
    API_KEY_VALIDATED = "settings.api_key.validated"

    # Auth events
    TOKEN_CREATED = "auth.token.created"
    TOKEN_REVOKED = "auth.token.revoked"
    TOKEN_EXPIRED = "auth.token.expired"

    # Usage events
    API_CALL_MADE = "usage.api_call.made"
    USAGE_LIMIT_REACHED = "usage.limit.reached"

    # System events
    CACHE_INVALIDATED = "system.cache.invalidated"
    DATABASE_ERROR = "system.database.error"
    EXTERNAL_API_ERROR = "system.external_api.error"


@dataclass
class DomainEvent:
    """Base domain event."""

    event_id: UUID = field(default_factory=uuid4)
    event_type: EventType = EventType.USER_CREATED
    aggregate_id: Optional[UUID] = None
    user_id: Optional[UUID] = None
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    data: Dict[str, Any] = field(default_factory=dict)
    correlation_id: Optional[UUID] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert event to dictionary."""
        return {
            "event_id": str(self.event_id),
            "event_type": self.event_type.value,
            "aggregate_id": str(self.aggregate_id) if self.aggregate_id else None,
            "user_id": str(self.user_id) if self.user_id else None,
            "timestamp": self.timestamp.isoformat(),
            "data": self.data,
            "correlation_id": str(self.correlation_id) if self.correlation_id else None,
            "metadata": self.metadata,
        }


class EventHandler(ABC):
    """Abstract base class for event handlers."""

    @abstractmethod
    async def handle(self, event: DomainEvent) -> None:
        """Handle the domain event."""
        pass

    @abstractmethod
    def can_handle(self, event_type: EventType) -> bool:
        """Check if handler can handle this event type."""
        pass


class EventBus:
    """Event bus for publishing and subscribing to domain events."""

    def __init__(self):
        self._handlers: Dict[EventType, List[EventHandler]] = {}
        self._middleware: List[Callable] = []
        self._event_store: List[DomainEvent] = []
        self._max_store_size = 1000

    def subscribe(self, event_type: EventType, handler: EventHandler) -> None:
        """Subscribe a handler to an event type."""
        if event_type not in self._handlers:
            self._handlers[event_type] = []

        if handler not in self._handlers[event_type]:
            self._handlers[event_type].append(handler)
            logger.info(f"Subscribed handler {handler.__class__.__name__} to {event_type.value}")

    def unsubscribe(self, event_type: EventType, handler: EventHandler) -> None:
        """Unsubscribe a handler from an event type."""
        if event_type in self._handlers and handler in self._handlers[event_type]:
            self._handlers[event_type].remove(handler)
            logger.info(f"Unsubscribed handler {handler.__class__.__name__} from {event_type.value}")

    async def publish(self, event: DomainEvent) -> None:
        """Publish an event to all subscribed handlers."""
        # Store event
        self._store_event(event)

        # Apply middleware
        for middleware in self._middleware:
            event = await middleware(event)

        # Get handlers for this event type
        handlers = self._handlers.get(event.event_type, [])

        if not handlers:
            logger.debug(f"No handlers for event {event.event_type.value}")
            return

        # Execute handlers concurrently
        tasks = []
        for handler in handlers:
            if handler.can_handle(event.event_type):
                tasks.append(self._execute_handler(handler, event))

        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)

            # Log any exceptions
            for result in results:
                if isinstance(result, Exception):
                    logger.error(f"Handler error: {result}")

    async def _execute_handler(self, handler: EventHandler, event: DomainEvent) -> None:
        """Execute a single handler with error handling."""
        try:
            await handler.handle(event)
            logger.debug(f"Handler {handler.__class__.__name__} processed event {event.event_type.value}")
        except Exception as e:
            logger.error(f"Handler {handler.__class__.__name__} failed for event {event.event_type.value}: {e}")
            raise

    def add_middleware(self, middleware: Callable) -> None:
        """Add middleware to process events before handlers."""
        self._middleware.append(middleware)

    def _store_event(self, event: DomainEvent) -> None:
        """Store event in memory for debugging/replay."""
        self._event_store.append(event)

        # Limit store size
        if len(self._event_store) > self._max_store_size:
            self._event_store.pop(0)

    def get_recent_events(self, limit: int = 100) -> List[DomainEvent]:
        """Get recent events from the store."""
        return self._event_store[-limit:]

    def get_events_by_type(self, event_type: EventType, limit: int = 100) -> List[DomainEvent]:
        """Get events by type from the store."""
        filtered = [e for e in self._event_store if e.event_type == event_type]
        return filtered[-limit:]

    def get_events_by_user(self, user_id: UUID, limit: int = 100) -> List[DomainEvent]:
        """Get events by user from the store."""
        filtered = [e for e in self._event_store if e.user_id == user_id]
        return filtered[-limit:]

    def clear_event_store(self) -> None:
        """Clear the event store."""
        self._event_store.clear()


# Global event bus instance
event_bus = EventBus()


# Built-in event handlers


class LoggingEventHandler(EventHandler):
    """Handler that logs all events."""

    async def handle(self, event: DomainEvent) -> None:
        """Log the event."""
        logger.info(f"Event: {event.event_type.value} | " f"User: {event.user_id} | " f"Data: {event.data}")

    def can_handle(self, event_type: EventType) -> bool:
        """Handle all event types."""
        return True


class CacheInvalidationHandler(EventHandler):
    """Handler that invalidates cache on certain events."""

    def __init__(self):
        from app.core.cache import cache_manager

        self.cache_manager = cache_manager

    async def handle(self, event: DomainEvent) -> None:
        """Invalidate relevant caches."""
        if event.user_id:
            await self.cache_manager.invalidate_user_cache(event.user_id)

    def can_handle(self, event_type: EventType) -> bool:
        """Handle user and settings events."""
        return event_type in [
            EventType.USER_UPDATED,
            EventType.USER_DELETED,
            EventType.SETTINGS_UPDATED,
            EventType.API_KEY_ADDED,
            EventType.API_KEY_REMOVED,
        ]


class MetricsEventHandler(EventHandler):
    """Handler that updates metrics based on events."""

    def __init__(self):
        self.metrics = {
            "total_events": 0,
            "events_by_type": {},
            "user_logins": 0,
            "api_calls": 0,
            "errors": 0,
        }

    async def handle(self, event: DomainEvent) -> None:
        """Update metrics."""
        self.metrics["total_events"] += 1

        event_type_key = event.event_type.value
        if event_type_key not in self.metrics["events_by_type"]:
            self.metrics["events_by_type"][event_type_key] = 0
        self.metrics["events_by_type"][event_type_key] += 1

        if event.event_type == EventType.USER_LOGIN:
            self.metrics["user_logins"] += 1
        elif event.event_type == EventType.API_CALL_MADE:
            self.metrics["api_calls"] += 1
        elif "error" in event.event_type.value.lower():
            self.metrics["errors"] += 1

    def can_handle(self, event_type: EventType) -> bool:
        """Handle all event types."""
        return True

    def get_metrics(self) -> Dict[str, Any]:
        """Get current metrics."""
        return self.metrics.copy()


class WebhookEventHandler(EventHandler):
    """Handler that sends webhooks for certain events."""

    def __init__(self, webhook_url: Optional[str] = None):
        self.webhook_url = webhook_url

    async def handle(self, event: DomainEvent) -> None:
        """Send webhook for the event."""
        if not self.webhook_url:
            return

        try:
            import httpx

            async with httpx.AsyncClient() as client:
                await client.post(self.webhook_url, json=event.to_dict(), timeout=5.0)
                logger.info(f"Webhook sent for event {event.event_type.value}")
        except Exception as e:
            logger.error(f"Failed to send webhook: {e}")

    def can_handle(self, event_type: EventType) -> bool:
        """Handle important events only."""
        return event_type in [
            EventType.USER_CREATED,
            EventType.USER_PREMIUM_UPGRADED,
            EventType.USER_PREMIUM_CANCELLED,
            EventType.USAGE_LIMIT_REACHED,
        ]


# Event publishing helpers


async def publish_user_event(
    event_type: EventType, user_id: UUID, data: Optional[Dict[str, Any]] = None, correlation_id: Optional[UUID] = None
) -> None:
    """Helper to publish user-related events."""
    event = DomainEvent(
        event_type=event_type, user_id=user_id, aggregate_id=user_id, data=data or {}, correlation_id=correlation_id
    )
    await event_bus.publish(event)


async def publish_settings_event(
    event_type: EventType, user_id: UUID, settings_data: Dict[str, Any], correlation_id: Optional[UUID] = None
) -> None:
    """Helper to publish settings-related events."""
    event = DomainEvent(
        event_type=event_type,
        user_id=user_id,
        aggregate_id=user_id,
        data={"settings": settings_data},
        correlation_id=correlation_id,
    )
    await event_bus.publish(event)


async def publish_auth_event(
    event_type: EventType,
    user_id: UUID,
    token_id: UUID,
    data: Optional[Dict[str, Any]] = None,
    correlation_id: Optional[UUID] = None,
) -> None:
    """Helper to publish auth-related events."""
    event = DomainEvent(
        event_type=event_type, user_id=user_id, aggregate_id=token_id, data=data or {}, correlation_id=correlation_id
    )
    await event_bus.publish(event)


# Initialize default handlers
def initialize_default_handlers():
    """Initialize default event handlers."""
    # Logging handler
    logging_handler = LoggingEventHandler()
    for event_type in EventType:
        event_bus.subscribe(event_type, logging_handler)

    # Cache invalidation handler
    cache_handler = CacheInvalidationHandler()
    for event_type in [
        EventType.USER_UPDATED,
        EventType.USER_DELETED,
        EventType.SETTINGS_UPDATED,
        EventType.API_KEY_ADDED,
        EventType.API_KEY_REMOVED,
    ]:
        event_bus.subscribe(event_type, cache_handler)

    # Metrics handler
    metrics_handler = MetricsEventHandler()
    for event_type in EventType:
        event_bus.subscribe(event_type, metrics_handler)

    logger.info("Default event handlers initialized")
