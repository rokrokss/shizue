"""Base repository pattern for data access abstraction."""

from abc import ABC
from typing import Any, Generic, List, Optional, Type, TypeVar

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import DeclarativeMeta

from app.core.cache import CacheLevel, CacheTTL, multi_cache
from app.core.logging import logger

ModelType = TypeVar("ModelType", bound=DeclarativeMeta)
CreateSchemaType = TypeVar("CreateSchemaType")
UpdateSchemaType = TypeVar("UpdateSchemaType")


class BaseRepository(ABC, Generic[ModelType, CreateSchemaType, UpdateSchemaType]):
    """Base repository with common CRUD operations."""

    def __init__(self, model: Type[ModelType], db_session: AsyncSession):
        self.model = model
        self.db = db_session
        self.cache = multi_cache

    async def get(self, id: Any, use_cache: bool = True) -> Optional[ModelType]:
        """Get a single record by ID."""
        # Try cache first if enabled
        if use_cache:
            cache_key = self._get_cache_key(id)
            cached_value = await self.cache.get(cache_key, CacheLevel.REDIS)
            if cached_value:
                return self.model(**cached_value)

        # Query database
        result = await self.db.execute(select(self.model).where(self.model.id == id))  # type: ignore[attr-defined]
        record = result.scalar_one_or_none()

        # Cache the result
        if record and use_cache:
            await self._cache_record(record)

        return record

    async def get_all(self, skip: int = 0, limit: int = 100, **filters) -> List[ModelType]:
        """Get multiple records with pagination."""
        query = select(self.model)

        # Apply filters
        for key, value in filters.items():
            if hasattr(self.model, key):
                query = query.where(getattr(self.model, key) == value)

        # Apply pagination
        query = query.offset(skip).limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def create(self, obj_in: CreateSchemaType) -> ModelType:
        """Create a new record."""
        # Convert schema to dict
        obj_data = (
            obj_in.model_dump()
            if hasattr(obj_in, "model_dump")
            else (obj_in.dict() if hasattr(obj_in, "dict") else obj_in)
        )

        # Create model instance
        db_obj = self.model(**obj_data)

        # Save to database
        self.db.add(db_obj)
        await self.db.commit()
        await self.db.refresh(db_obj)

        # Cache the new record
        await self._cache_record(db_obj)

        # Emit domain event
        await self._emit_created_event(db_obj)

        logger.info(f"Created {self.model.__name__} with ID {db_obj.id}")  # type: ignore[attr-defined]
        return db_obj

    async def update(self, id: Any, obj_in: UpdateSchemaType) -> Optional[ModelType]:
        """Update an existing record."""
        # Get existing record
        db_obj = await self.get(id, use_cache=False)
        if not db_obj:
            return None

        # Update fields
        update_data = obj_in.dict(exclude_unset=True) if hasattr(obj_in, "dict") else obj_in
        for key, value in update_data.items():
            if hasattr(db_obj, key):
                setattr(db_obj, key, value)

        # Save to database
        await self.db.commit()
        await self.db.refresh(db_obj)

        # Invalidate cache
        await self._invalidate_cache(id)

        # Cache updated record
        await self._cache_record(db_obj)

        # Emit domain event
        await self._emit_updated_event(db_obj)

        logger.info(f"Updated {self.model.__name__} with ID {id}")
        return db_obj

    async def delete(self, id: Any) -> bool:
        """Delete a record."""
        # Get existing record
        db_obj = await self.get(id, use_cache=False)
        if not db_obj:
            return False

        # Delete from database
        await self.db.delete(db_obj)
        await self.db.commit()

        # Invalidate cache
        await self._invalidate_cache(id)

        # Emit domain event
        await self._emit_deleted_event(id)

        logger.info(f"Deleted {self.model.__name__} with ID {id}")
        return True

    async def exists(self, id: Any) -> bool:
        """Check if a record exists."""
        result = await self.db.execute(select(self.model.id).where(self.model.id == id))  # type: ignore[attr-defined]
        return result.scalar_one_or_none() is not None

    async def count(self, **filters) -> int:
        """Count records matching filters."""
        from sqlalchemy import func

        query = select(func.count(self.model.id))  # type: ignore[attr-defined]

        # Apply filters
        for key, value in filters.items():
            if hasattr(self.model, key):
                query = query.where(getattr(self.model, key) == value)

        result = await self.db.execute(query)
        return result.scalar_one()

    # Cache helpers

    def _get_cache_key(self, id: Any) -> str:
        """Generate cache key for a record."""
        return f"{self.model.__tablename__}:{id}"  # type: ignore[attr-defined]

    async def _cache_record(self, record: ModelType) -> None:
        """Cache a record."""
        cache_key = self._get_cache_key(record.id)  # type: ignore[attr-defined]
        # Convert to dict for caching
        record_dict = {  # type: ignore[attr-defined]
            column.name: getattr(record, column.name) for column in record.__table__.columns
        }
        await self.cache.set(cache_key, record_dict, ttl=CacheTTL.MEDIUM, level=CacheLevel.REDIS)

    async def _invalidate_cache(self, id: Any) -> None:
        """Invalidate cache for a record."""
        cache_key = self._get_cache_key(id)
        await self.cache.delete(cache_key)

    # Domain events

    async def _emit_created_event(self, record: ModelType) -> None:
        """Emit domain event when record is created."""
        from app.core.events import DomainEvent, EventType, event_bus

        # Determine event type based on model
        event_type_map = {
            "users": EventType.USER_CREATED,
            "auth_tokens": EventType.TOKEN_CREATED,
        }

        table_name = record.__tablename__  # type: ignore[attr-defined]
        event_type = event_type_map.get(table_name)

        if event_type:
            event = DomainEvent(
                event_type=event_type,
                aggregate_id=record.id,  # type: ignore[attr-defined]
                user_id=getattr(  # type: ignore[attr-defined]
                    record, "user_id", record.id if table_name == "users" else None
                ),
                data={"entity": table_name, "id": str(record.id)},  # type: ignore[attr-defined]
            )
            await event_bus.publish(event)

    async def _emit_updated_event(self, record: ModelType) -> None:
        """Emit domain event when record is updated."""
        from app.core.events import DomainEvent, EventType, event_bus

        # Determine event type based on model
        event_type_map = {
            "users": EventType.USER_UPDATED,
        }

        table_name = record.__tablename__  # type: ignore[attr-defined]
        event_type = event_type_map.get(table_name)

        if event_type:
            event = DomainEvent(
                event_type=event_type,
                aggregate_id=record.id,  # type: ignore[attr-defined]
                user_id=getattr(  # type: ignore[attr-defined]
                    record, "user_id", record.id if table_name == "users" else None
                ),
                data={"entity": table_name, "id": str(record.id)},  # type: ignore[attr-defined]
            )
            await event_bus.publish(event)

    async def _emit_deleted_event(self, id: Any) -> None:
        """Emit domain event when record is deleted."""
        from app.core.events import DomainEvent, EventType, event_bus

        # Determine event type based on model
        event_type_map = {
            "users": EventType.USER_DELETED,
            "auth_tokens": EventType.TOKEN_REVOKED,
        }

        table_name = self.model.__tablename__  # type: ignore[attr-defined]
        event_type = event_type_map.get(table_name)

        if event_type:
            event = DomainEvent(event_type=event_type, aggregate_id=id, data={"entity": table_name, "id": str(id)})
            await event_bus.publish(event)


class ReadOnlyRepository(Generic[ModelType]):
    """Read-only repository for query operations."""

    def __init__(self, model: Type[ModelType], db_session: AsyncSession):
        self.model = model
        self.db = db_session
        self.cache = multi_cache

    async def get(self, id: Any) -> Optional[ModelType]:
        """Get a single record by ID."""
        result = await self.db.execute(select(self.model).where(self.model.id == id))  # type: ignore[attr-defined]
        return result.scalar_one_or_none()

    async def find_one(self, **filters) -> Optional[ModelType]:
        """Find a single record matching filters."""
        query = select(self.model)

        for key, value in filters.items():
            if hasattr(self.model, key):
                query = query.where(getattr(self.model, key) == value)

        result = await self.db.execute(query.limit(1))
        return result.scalar_one_or_none()

    async def find_many(
        self, skip: int = 0, limit: int = 100, order_by: Optional[str] = None, **filters
    ) -> List[ModelType]:
        """Find multiple records matching filters."""
        query = select(self.model)

        # Apply filters
        for key, value in filters.items():
            if hasattr(self.model, key):
                query = query.where(getattr(self.model, key) == value)

        # Apply ordering
        if order_by and hasattr(self.model, order_by):
            query = query.order_by(getattr(self.model, order_by))

        # Apply pagination
        query = query.offset(skip).limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def search(
        self, search_term: str, search_fields: List[str], skip: int = 0, limit: int = 100
    ) -> List[ModelType]:
        """Search records by text in specified fields."""
        from sqlalchemy import or_

        query = select(self.model)

        # Build search conditions
        conditions = []
        for field in search_fields:
            if hasattr(self.model, field):
                column = getattr(self.model, field)
                conditions.append(column.ilike(f"%{search_term}%"))

        if conditions:
            query = query.where(or_(*conditions))

        # Apply pagination
        query = query.offset(skip).limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())
