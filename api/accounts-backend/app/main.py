from contextlib import asynccontextmanager
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Dict

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, ORJSONResponse

from app.api.health import router as health_router
from app.api.v1.api import api_router
from app.api.versioning import create_version_info_router, version_router
from app.core.base import Base
from app.core.config import settings
from app.core.database import engine
from app.core.events import event_bus, initialize_default_handlers
from app.core.logging import logger, setup_logging
from app.core.openapi import custom_openapi
from app.core.redis import redis_client
from app.middleware.correlation import CorrelationMiddleware, ErrorHandlingMiddleware, RequestLoggingMiddleware

# Configure structured logging
setup_logging(level="DEBUG" if settings.DEBUG else "INFO")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    # Startup
    logger.info("Starting up Shizue Accounts API...")

    # Initialize database
    async with engine.begin() as conn:
        # In production, use Alembic migrations instead
        if settings.DEBUG:
            await conn.run_sync(Base.metadata.create_all)
    logger.info("Database connection established")

    # Test Redis connection
    await redis_client.ping()
    logger.info("Redis connection established")

    # Initialize event bus with default handlers
    initialize_default_handlers()
    logger.info("Event bus initialized")

    # Log startup complete
    logger.info(
        "Application startup complete",
        app_name=settings.APP_NAME,
        version=settings.APP_VERSION,
        environment=settings.ENVIRONMENT,
        debug=settings.DEBUG,
    )

    yield

    # Shutdown
    logger.info("Shutting down...")

    # Clear event bus
    event_bus.clear_event_store()

    # Close connections
    await redis_client.close()
    await engine.dispose()

    logger.info("Application shutdown complete")


# Create FastAPI app with optimizations
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    openapi_url="/openapi.json" if settings.DEBUG else None,
    lifespan=lifespan,
    default_response_class=ORJSONResponse,  # Faster JSON serialization
)

# Add middleware in correct order (bottom to top execution)
# 1. Error handling (outermost)
app.add_middleware(ErrorHandlingMiddleware)

# 2. GZip compression for responses
app.add_middleware(GZipMiddleware, minimum_size=500)

# 3. CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-Correlation-ID", "X-API-Version"],
    max_age=3600,  # Cache preflight requests for 1 hour
)

# 4. Correlation and request tracking
app.add_middleware(CorrelationMiddleware)

# 5. Request logging (if debug mode)
if settings.DEBUG:
    app.add_middleware(RequestLoggingMiddleware)


# HTTP exception handler
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "status_code": exc.status_code,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "request_id": getattr(request.state, "request_id", None),
        },
    )


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)

    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred",
                "request_id": getattr(request.state, "request_id", None),
            }
        },
    )


# Include routers
# Health check endpoints (no version prefix)
app.include_router(health_router)

# Version information endpoints
app.include_router(create_version_info_router())

# API v1 endpoints
v1_router = version_router("v1", tags=["v1"])
v1_router.include_router(api_router)
app.include_router(v1_router)

# API v2 endpoints (future)
# v2_router = version_router("v2", tags=["v2"], deprecated=False)
# v2_router.include_router(api_router_v2)
# app.include_router(v2_router)


# Cache root response
@lru_cache(maxsize=1)
def get_root_response() -> Dict[str, Any]:
    return {
        "message": f"Welcome to {settings.APP_NAME}",
        "version": settings.APP_VERSION,
        "docs": "/docs" if settings.DEBUG else None,
    }


# Root endpoint
@app.get("/", response_class=ORJSONResponse)
async def root():
    return get_root_response()


# Custom OpenAPI schema
@lru_cache()
def get_openapi():
    return custom_openapi(app)


app.openapi = get_openapi  # type: ignore[method-assign]

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="debug" if settings.DEBUG else "info",
    )
