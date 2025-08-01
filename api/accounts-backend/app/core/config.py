import json
from typing import List, Optional

from pydantic import Field, validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "Shizue Accounts API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = Field(..., env="DATABASE_URL")

    # Redis
    REDIS_URL: str = Field(..., env="REDIS_URL")

    # JWT
    JWT_SECRET_KEY: str = Field(..., env="JWT_SECRET_KEY")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Google OAuth
    GOOGLE_CLIENT_ID: str = Field(..., env="GOOGLE_CLIENT_ID")
    GOOGLE_CLIENT_SECRET: str = Field(..., env="GOOGLE_CLIENT_SECRET")
    GOOGLE_REDIRECT_URI: str = Field(..., env="GOOGLE_REDIRECT_URI")

    # CORS
    ALLOWED_ORIGINS: List[str] = Field(default_factory=list)

    @validator("ALLOWED_ORIGINS", pre=True)
    def parse_allowed_origins(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except:
                return [origin.strip() for origin in v.split(",")]
        return v

    # Frontend URLs
    FRONTEND_URL: str = "https://shizue.ai"
    AUTH_SUCCESS_URL: str = "https://shizue.ai/auth/success"
    AUTH_ERROR_URL: str = "https://shizue.ai/auth/error"

    # Sentry (optional)
    SENTRY_DSN: Optional[str] = None

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Rate Limiting
    RATE_LIMIT_AUTH: str = "5/minute"
    RATE_LIMIT_API: str = "100/minute"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
