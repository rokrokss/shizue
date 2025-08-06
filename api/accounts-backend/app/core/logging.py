"""Structured logging configuration with correlation IDs."""

import contextvars
import json
import logging
import os
import sys
from datetime import datetime
from typing import Any, Optional
from uuid import UUID, uuid4

from loguru import logger as _logger
from pydantic import BaseModel

# Context variables for correlation
correlation_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("correlation_id", default=None)
request_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("request_id", default=None)
user_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("user_id", default=None)


class LogContext:
    """Context manager for structured logging context."""

    def __init__(
        self,
        correlation_id: Optional[str] = None,
        request_id: Optional[str] = None,
        user_id: Optional[str] = None,
        **extra_fields,
    ):
        self.correlation_id = correlation_id or str(uuid4())
        self.request_id = request_id
        self.user_id = user_id
        self.extra_fields = extra_fields
        self.tokens: list = []

    def __enter__(self):
        """Enter the context."""
        self.tokens.append(correlation_id_var.set(self.correlation_id))
        if self.request_id:
            self.tokens.append(request_id_var.set(self.request_id))
        if self.user_id:
            self.tokens.append(user_id_var.set(self.user_id))
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Exit the context."""
        for token in self.tokens:
            if hasattr(token, "var"):
                token.var.reset(token)


def structured_format(record: dict[str, Any]) -> str:
    """Format log record as structured JSON."""
    # Base structure
    log_data = {
        "timestamp": record["time"].isoformat(),
        "level": record["level"].name,
        "message": record["message"],
        "module": record["name"],
        "function": record["function"],
        "line": record["line"],
    }

    # Add correlation IDs if present
    correlation_id = correlation_id_var.get()
    if correlation_id:
        log_data["correlation_id"] = correlation_id

    request_id = request_id_var.get()
    if request_id:
        log_data["request_id"] = request_id

    user_id = user_id_var.get()
    if user_id:
        log_data["user_id"] = user_id

    # Add extra fields from the record
    if "extra" in record:
        for key, value in record["extra"].items():
            if key not in ["correlation_id", "request_id", "user_id"]:
                # Handle special types
                if isinstance(value, (UUID, datetime)):
                    value = str(value)
                elif isinstance(value, BaseModel):
                    value = value.model_dump() if hasattr(value, "model_dump") else value.dict()
                log_data[key] = value

    # Add exception info if present
    if record.get("exception"):
        log_data["exception"] = {
            "type": record["exception"].type.__name__,
            "value": str(record["exception"].value),
            "traceback": record["exception"].traceback,
        }

    return json.dumps(log_data) + "\n"


def human_format(record: dict) -> str:
    """Format log record for human readability."""
    try:
        # Build format parts
        parts = [
            f"<green>{record['time']:YYYY-MM-DD HH:mm:ss.SSS}</green>",
            f"<level>{record['level'].name: <8}</level>",
        ]

        # Add correlation IDs if present
        correlation_id = correlation_id_var.get()
        request_id = request_id_var.get()
        user_id = user_id_var.get()

        if correlation_id:
            parts.append(f"<yellow>[{correlation_id[:8]}]</yellow>")
        if request_id:
            parts.append(f"<cyan>[R:{request_id[:8]}]</cyan>")
        if user_id:
            parts.append(f"<magenta>[U:{user_id[:8]}]</magenta>")

        # Add location info
        parts.append(f"<cyan>{record['name']}:{record['function']}:{record['line']}</cyan>")

        # Add message
        parts.append(f"<level>{record['message']}</level>")

        # Add extra fields if any
        if "extra" in record:
            extra_fields = {}
            for k, v in record["extra"].items():
                if k not in ["correlation_id", "request_id", "user_id"]:
                    # Convert non-serializable objects to strings
                    if hasattr(v, "__dict__"):
                        v = str(v)
                    extra_fields[k] = v
            if extra_fields:
                # Don't include extra fields in test mode to avoid format errors
                if not os.getenv("TESTING"):
                    parts.append(f"<dim>{extra_fields}</dim>")

        return " | ".join(parts) + "\n"
    except Exception:
        # Fallback to simple format if there's any error
        return f"{record.get('time', '')} | {record.get('level', {}).get('name', '')} | {record.get('message', '')}\n"


# Remove default logger
_logger.remove()

# Add stdout with appropriate format
if os.getenv("TESTING"):
    # Simple format for testing to avoid format parsing issues
    _logger.add(
        sys.stdout,
        format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {name}:{function}:{line} | {message}\n",
        level="INFO",
        colorize=False,
    )
elif sys.stdout.isatty():
    # Human-readable format for development
    _logger.add(
        sys.stdout,
        format=human_format,  # type: ignore[arg-type]
        level="INFO",
        colorize=True,
    )
else:
    # Use structured JSON format for production
    _logger.add(
        sys.stdout,
        format=structured_format,  # type: ignore[arg-type]
        level="INFO",
        serialize=False,
    )

# Add file handlers only if not in test mode
if not os.getenv("TESTING"):
    # Add file handler for errors with structured format
    _logger.add(
        "logs/error.log",
        rotation="10 MB",
        retention="30 days",
        level="ERROR",
        format=structured_format,  # type: ignore[arg-type]
        serialize=False,
    )

    # Add file handler for all logs
    _logger.add(
        "logs/app.log",
        rotation="100 MB",
        retention="7 days",
        level="DEBUG",
        format=structured_format,  # type: ignore[arg-type]
        serialize=False,
    )

# Export logger
logger = _logger


class InterceptHandler(logging.Handler):
    """Handler to intercept standard logging and forward to loguru."""

    def emit(self, record: logging.LogRecord) -> Any:
        """Emit a log record."""
        # Get corresponding Loguru level if it exists
        level: str | int
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno

        # Find caller from where originated the logged message
        frame: Optional[Any] = sys._getframe(6)
        depth = 6
        while frame and frame.f_code.co_filename == logging.__file__:
            frame = frame.f_back
            depth += 1

        logger.opt(depth=depth, exception=record.exc_info).log(level, record.getMessage())


def setup_logging(level: str = "INFO", structured: bool = True) -> None:
    """Set up logging configuration."""
    # Remove existing handlers
    logger.remove()

    # Add appropriate handler based on environment
    if os.getenv("TESTING"):
        # Simple format for testing
        logger.add(
            sys.stdout,
            format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {name}:{function}:{line} | {message}\n",
            level=level,
            colorize=False,
        )
    elif structured and not sys.stdout.isatty():
        logger.add(
            sys.stdout,
            format=structured_format,  # type: ignore[arg-type]
            level=level,
            serialize=False,
        )
    else:
        logger.add(
            sys.stdout,
            format=human_format,  # type: ignore[arg-type]  # type: ignore[arg-type]
            level=level,
            colorize=True if sys.stdout.isatty() else False,
        )

    # Intercept standard logging
    logging.basicConfig(handlers=[InterceptHandler()], level=0, force=True)

    # Set levels for specific libraries
    logging.getLogger("uvicorn").setLevel(logging.INFO)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


# Convenience functions for logging with context


def log_with_context(level: str, message: str, correlation_id: Optional[str] = None, **extra_fields) -> None:
    """Log a message with correlation context."""
    correlation_id = correlation_id or correlation_id_var.get() or str(uuid4())

    with logger.contextualize(
        correlation_id=correlation_id, request_id=request_id_var.get(), user_id=user_id_var.get(), **extra_fields
    ):
        logger.log(level, message)


def info(message: str, **extra_fields) -> None:
    """Log info message with context."""
    log_with_context("INFO", message, **extra_fields)


def error(message: str, **extra_fields) -> None:
    """Log error message with context."""
    log_with_context("ERROR", message, **extra_fields)


def warning(message: str, **extra_fields) -> None:
    """Log warning message with context."""
    log_with_context("WARNING", message, **extra_fields)


def debug(message: str, **extra_fields) -> None:
    """Log debug message with context."""
    log_with_context("DEBUG", message, **extra_fields)


# Metrics logging


class LogMetrics:
    """Helper for logging metrics."""

    @staticmethod
    def api_call(endpoint: str, method: str, status_code: int, duration_ms: float, **extra) -> None:
        """Log API call metrics."""
        logger.info(
            "API call completed",
            endpoint=endpoint,
            method=method,
            status_code=status_code,
            duration_ms=duration_ms,
            metric_type="api_call",
            **extra,
        )

    @staticmethod
    def database_query(query_type: str, table: str, duration_ms: float, rows_affected: int = 0, **extra) -> None:
        """Log database query metrics."""
        logger.debug(
            "Database query executed",
            query_type=query_type,
            table=table,
            duration_ms=duration_ms,
            rows_affected=rows_affected,
            metric_type="db_query",
            **extra,
        )

    @staticmethod
    def cache_operation(operation: str, key: str, hit: bool, duration_ms: float, **extra) -> None:
        """Log cache operation metrics."""
        logger.debug(
            "Cache operation",
            operation=operation,
            key=key,
            hit=hit,
            duration_ms=duration_ms,
            metric_type="cache",
            **extra,
        )

    @staticmethod
    def external_api_call(service: str, endpoint: str, status_code: int, duration_ms: float, **extra) -> None:
        """Log external API call metrics."""
        logger.info(
            "External API call",
            service=service,
            endpoint=endpoint,
            status_code=status_code,
            duration_ms=duration_ms,
            metric_type="external_api",
            **extra,
        )
