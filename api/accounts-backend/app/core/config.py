import json
from typing import List, Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "Shizue Accounts API"
    APP_VERSION: str = "1.0.0"
    VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "production"

    # Database
    DATABASE_URL: str

    # JWT
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Google OAuth
    GOOGLE_CLIENT_ID: str
    GOOGLE_CLIENT_SECRET: str
    GOOGLE_REDIRECT_URI: str

    # CORS
    ALLOWED_ORIGINS: List[str] = Field(default_factory=list)

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_allowed_origins(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return [origin.strip() for origin in v.split(",")]
        return v

    # Frontend URLs
    FRONTEND_URL: str = "https://shizue.ai"
    AUTH_SUCCESS_URL: str = "https://shizue.ai/auth/success"
    AUTH_ERROR_URL: str = "https://shizue.ai/auth/error"

    # Chrome Extension
    CHROME_EXTENSION_ID: Optional[str] = None
    CHROME_EXTENSION_REDIRECT_URI: Optional[str] = None

    # Sentry (optional)
    SENTRY_DSN: Optional[str] = None

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Rate Limiting (optimized defaults)
    RATE_LIMIT_AUTH: str = "5/minute"
    RATE_LIMIT_API: str = "100/minute"

    # Cache Configuration
    CACHE_MAX_SIZE: int = 2000
    CACHE_DEFAULT_TTL: int = 300  # 5 minutes

    # Performance Settings
    MAX_REQUEST_SIZE: int = 16_777_216  # 16MB
    GZIP_MINIMUM_SIZE: int = 500
    CORS_MAX_AGE: int = 3600  # 1 hour

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)


settings = Settings()  # type: ignore[call-arg]
