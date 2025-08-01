"""API versioning strategy and utilities."""

from datetime import datetime
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel

from app.core.logging import logger


class APIVersion(str, Enum):
    """Supported API versions."""

    V1 = "v1"
    V2 = "v2"
    LATEST = "v2"  # Always points to the latest stable version


class VersionInfo(BaseModel):
    """API version information."""

    version: str
    status: str  # "stable", "beta", "deprecated"
    release_date: datetime
    deprecation_date: Optional[datetime] = None
    sunset_date: Optional[datetime] = None
    changes: List[str] = []


# Version registry
VERSION_INFO: Dict[str, VersionInfo] = {
    "v1": VersionInfo(
        version="v1",
        status="stable",
        release_date=datetime(2024, 1, 1),
        deprecation_date=None,
        sunset_date=None,
        changes=[
            "Initial release",
            "Basic authentication and user management",
            "Settings management",
            "API key validation",
        ],
    ),
    "v2": VersionInfo(
        version="v2",
        status="beta",
        release_date=datetime(2024, 11, 1),
        deprecation_date=None,
        sunset_date=None,
        changes=[
            "Model mapping abstraction",
            "Enhanced settings with encryption",
            "Repository pattern for data access",
            "Event-driven architecture",
            "Circuit breaker for external APIs",
            "Multi-level caching",
        ],
    ),
}


def get_api_version(request: Request, x_api_version: Optional[str] = Header(None, alias="X-API-Version")) -> str:
    """Extract API version from request."""
    # Priority order:
    # 1. Header (X-API-Version)
    # 2. URL path (/api/v1/...)
    # 3. Query parameter (?version=v1)
    # 4. Default to latest

    # Check header
    if x_api_version:
        return validate_version(x_api_version)

    # Check URL path
    path = request.url.path
    if "/api/v" in path:
        parts = path.split("/")
        for part in parts:
            if part.startswith("v") and part[1:].isdigit():
                return validate_version(part)

    # Check query parameter
    version_param = request.query_params.get("version")
    if version_param:
        return validate_version(version_param)

    # Default to latest
    return APIVersion.LATEST.value


def validate_version(version: str) -> str:
    """Validate API version."""
    # Handle "latest" alias
    if version.lower() == "latest":
        return APIVersion.LATEST.value

    # Normalize version format
    if not version.startswith("v"):
        version = f"v{version}"

    # Check if version exists
    if version not in VERSION_INFO:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported API version: {version}. Supported versions: {list(VERSION_INFO.keys())}",
        )

    # Check if version is sunset
    version_info = VERSION_INFO[version]
    if version_info.sunset_date and datetime.now() > version_info.sunset_date:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail=f"API version {version} has been sunset on {version_info.sunset_date}",
        )

    # Warn if deprecated
    if version_info.status == "deprecated":
        logger.warning(f"Deprecated API version {version} is being used")

    return version


def version_router(version: str, prefix: str = "", deprecated: bool = False, **kwargs) -> APIRouter:
    """Create a versioned router."""
    # Validate version
    if version not in VERSION_INFO:
        raise ValueError(f"Unknown version: {version}")

    # Create router with version prefix
    router = APIRouter(prefix=f"/api/{version}{prefix}", deprecated=deprecated, **kwargs)

    # Add version metadata
    router.version = version
    router.version_info = VERSION_INFO[version]

    return router


class VersionedEndpoint:
    """Decorator for versioned endpoint implementations."""

    def __init__(self):
        self.implementations: Dict[str, Callable] = {}

    def register(self, version: str):
        """Register an implementation for a specific version."""

        def decorator(func: Callable):
            self.implementations[version] = func
            return func

        return decorator

    def get_implementation(self, version: str) -> Callable:
        """Get implementation for a specific version."""
        # Try exact match
        if version in self.implementations:
            return self.implementations[version]

        # Try to fall back to previous version
        version_num = int(version[1:]) if version[1:].isdigit() else 0
        while version_num > 0:
            prev_version = f"v{version_num - 1}"
            if prev_version in self.implementations:
                logger.info(f"Falling back from {version} to {prev_version}")
                return self.implementations[prev_version]
            version_num -= 1

        # No implementation found
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=f"No implementation for version {version}"
        )

    def __call__(self, request: Request, *args, **kwargs):
        """Execute the appropriate version implementation."""
        version = get_api_version(request)
        impl = self.get_implementation(version)
        return impl(request, *args, **kwargs)


# Version negotiation utilities


def negotiate_version(requested: str, supported: List[str], allow_fallback: bool = True) -> Optional[str]:
    """Negotiate the best API version to use."""
    # Exact match
    if requested in supported:
        return requested

    if not allow_fallback:
        return None

    # Try newer versions first
    requested_num = int(requested[1:]) if requested[1:].isdigit() else 0

    # Look for newer compatible version
    for version in sorted(supported, reverse=True):
        version_num = int(version[1:]) if version[1:].isdigit() else 0
        if version_num >= requested_num:
            return version

    # Look for older compatible version
    for version in sorted(supported, reverse=True):
        version_num = int(version[1:]) if version[1:].isdigit() else 0
        if version_num < requested_num:
            return version

    return None


def add_version_headers(response: Any, version: str) -> Any:
    """Add version information to response headers."""
    if hasattr(response, "headers"):
        response.headers["X-API-Version"] = version

        # Add deprecation warning if needed
        version_info = VERSION_INFO.get(version)
        if version_info:
            if version_info.status == "deprecated":
                response.headers["X-API-Deprecated"] = "true"
                if version_info.sunset_date:
                    response.headers["X-API-Sunset"] = version_info.sunset_date.isoformat()

            # Add link to latest version
            if version != APIVersion.LATEST.value:
                response.headers["X-API-Latest-Version"] = APIVersion.LATEST.value

    return response


# Version compatibility checks


def is_compatible(version1: str, version2: str) -> bool:
    """Check if two versions are compatible."""
    # Same major version = compatible
    v1_major = int(version1[1:].split(".")[0]) if version1[1:] else 0
    v2_major = int(version2[1:].split(".")[0]) if version2[1:] else 0

    return v1_major == v2_major


def get_breaking_changes(from_version: str, to_version: str) -> List[str]:
    """Get list of breaking changes between versions."""
    breaking_changes = []

    from_num = int(from_version[1:]) if from_version[1:].isdigit() else 0
    to_num = int(to_version[1:]) if to_version[1:].isdigit() else 0

    # Collect all changes between versions
    for version, info in VERSION_INFO.items():
        version_num = int(version[1:]) if version[1:].isdigit() else 0
        if from_num < version_num <= to_num:
            # Filter for breaking changes (simple heuristic)
            for change in info.changes:
                if any(keyword in change.lower() for keyword in ["breaking", "removed", "deprecated"]):
                    breaking_changes.append(f"{version}: {change}")

    return breaking_changes


# API version information endpoint


def create_version_info_router() -> APIRouter:
    """Create router for version information endpoints."""
    router = APIRouter(prefix="/api/versions", tags=["versions"])

    @router.get("/", response_model=Dict[str, VersionInfo])
    async def get_versions():
        """Get all available API versions."""
        return VERSION_INFO

    @router.get("/current")
    async def get_current_version(request: Request):
        """Get current API version being used."""
        version = get_api_version(request)
        return {"version": version, "info": VERSION_INFO.get(version)}

    @router.get("/latest")
    async def get_latest_version():
        """Get latest API version."""
        return {"version": APIVersion.LATEST.value, "info": VERSION_INFO.get(APIVersion.LATEST.value)}

    @router.get("/compatibility")
    async def check_compatibility(from_version: str, to_version: str):
        """Check compatibility between versions."""
        return {
            "from_version": from_version,
            "to_version": to_version,
            "compatible": is_compatible(from_version, to_version),
            "breaking_changes": get_breaking_changes(from_version, to_version),
        }

    return router
