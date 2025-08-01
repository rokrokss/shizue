"""Correlation ID middleware for request tracking."""

import time
from typing import Callable
from uuid import uuid4

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.logging import LogMetrics, correlation_id_var, logger, request_id_var, user_id_var


class CorrelationMiddleware(BaseHTTPMiddleware):
    """Middleware to add correlation IDs to all requests."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process the request with correlation context."""
        # Generate or extract correlation ID
        correlation_id = request.headers.get("X-Correlation-ID", str(uuid4()))
        request_id = request.headers.get("X-Request-ID", str(uuid4()))

        # Set correlation context
        correlation_id_var.set(correlation_id)
        request_id_var.set(request_id)

        # Extract user ID from JWT if present
        user_id = None
        if hasattr(request.state, "user"):
            user_id = str(request.state.user.id)
            user_id_var.set(user_id)

        # Add to request state for easy access
        request.state.correlation_id = correlation_id
        request.state.request_id = request_id

        # Log request start
        start_time = time.time()
        logger.info(
            f"Request started: {request.method} {request.url.path}",
            method=request.method,
            path=request.url.path,
            query_params=dict(request.query_params),
            client_host=request.client.host if request.client else None,
        )

        try:
            # Process request
            response = await call_next(request)

            # Add correlation IDs to response headers
            response.headers["X-Correlation-ID"] = correlation_id
            response.headers["X-Request-ID"] = request_id

            # Calculate duration
            duration_ms = (time.time() - start_time) * 1000

            # Log request completion
            LogMetrics.api_call(
                endpoint=request.url.path,
                method=request.method,
                status_code=response.status_code,
                duration_ms=duration_ms,
            )

            return response

        except Exception as e:
            # Calculate duration
            duration_ms = (time.time() - start_time) * 1000

            # Log error
            logger.error(
                f"Request failed: {request.method} {request.url.path}",
                method=request.method,
                path=request.url.path,
                duration_ms=duration_ms,
                error_type=type(e).__name__,
                error_message=str(e),
                exc_info=True,
            )

            # Re-raise the exception
            raise

        finally:
            # Clear context variables
            correlation_id_var.set(None)
            request_id_var.set(None)
            user_id_var.set(None)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware for detailed request/response logging."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Log detailed request and response information."""
        # Skip logging for health checks
        if request.url.path in ["/health", "/healthz", "/metrics"]:
            return await call_next(request)

        # Log request details
        logger.debug(
            "Request details",
            headers=dict(request.headers),
            cookies=request.cookies,
        )

        # Process request
        response = await call_next(request)

        # Log response details
        logger.debug(
            "Response details",
            status_code=response.status_code,
            headers=dict(response.headers),
        )

        return response


class ErrorHandlingMiddleware(BaseHTTPMiddleware):
    """Middleware for consistent error handling and logging."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Handle errors with proper logging."""
        try:
            return await call_next(request)
        except Exception as e:
            # Log with correlation context
            correlation_id = getattr(request.state, "correlation_id", None)

            logger.error(
                "Unhandled exception",
                error_type=type(e).__name__,
                error_message=str(e),
                path=request.url.path,
                method=request.method,
                correlation_id=correlation_id,
                exc_info=True,
            )

            # Return generic error response
            return Response(
                content=f"Internal server error. Correlation ID: {correlation_id}",
                status_code=500,
                headers={"X-Correlation-ID": correlation_id} if correlation_id else {},
            )
