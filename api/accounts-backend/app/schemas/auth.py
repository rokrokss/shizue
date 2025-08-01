from typing import Optional

from pydantic import BaseModel, Field


class LoginURLResponse(BaseModel):
    """Response with OAuth login URL"""

    authorization_url: str = Field(..., description="OAuth authorization URL")


class TokenResponse(BaseModel):
    """JWT token response"""

    access_token: str = Field(..., description="JWT access token")
    refresh_token: str = Field(..., description="JWT refresh token")
    token_type: str = Field(default="Bearer", description="Token type")
    expires_in: int = Field(..., description="Token expiration time in seconds")


class RefreshTokenRequest(BaseModel):
    """Request to refresh access token"""

    refresh_token: str = Field(..., description="JWT refresh token")


class TokenPayload(BaseModel):
    """JWT token payload"""

    sub: str = Field(..., description="User ID")
    exp: int = Field(..., description="Expiration timestamp")
    iat: int = Field(..., description="Issued at timestamp")
    type: str = Field(..., description="Token type (access/refresh)")
    jti: Optional[str] = Field(None, description="JWT ID for refresh tokens")
