import logging
from typing import Any, Dict, Optional

import httpx
from authlib.integrations.httpx_client import AsyncOAuth2Client

from app.core.config import settings

logger = logging.getLogger(__name__)

# Google OAuth endpoints
GOOGLE_DISCOVERY_URL = "https://accounts.google.com/.well-known/openid-configuration"


class GoogleOAuthService:
    """Google OAuth 2.0 service"""

    def __init__(self):
        self.client_id = settings.GOOGLE_CLIENT_ID
        self.client_secret = settings.GOOGLE_CLIENT_SECRET
        self.redirect_uri = settings.GOOGLE_REDIRECT_URI
        self._discovery_doc: Optional[Dict[str, Any]] = None

    async def get_discovery_document(self) -> Dict[str, Any]:
        """Get Google OAuth discovery document"""
        if self._discovery_doc:
            return self._discovery_doc

        async with httpx.AsyncClient() as client:
            response = await client.get(GOOGLE_DISCOVERY_URL)
            response.raise_for_status()
            self._discovery_doc = response.json()
            return self._discovery_doc

    async def get_authorization_url(self, state: str) -> str:
        """Get Google OAuth authorization URL"""
        discovery = await self.get_discovery_document()

        client = AsyncOAuth2Client(
            client_id=self.client_id,
            redirect_uri=self.redirect_uri,
            scope="openid email profile",
            state=state,
        )

        authorization_url, _ = client.create_authorization_url(
            discovery["authorization_endpoint"],
            state=state,
            access_type="offline",  # Request refresh token
            prompt="consent",  # Force consent screen
        )

        return authorization_url

    async def exchange_code_for_token(self, code: str) -> Dict[str, Any]:
        """Exchange authorization code for tokens"""
        discovery = await self.get_discovery_document()

        client = AsyncOAuth2Client(
            client_id=self.client_id,
            client_secret=self.client_secret,
            redirect_uri=self.redirect_uri,
        )

        token_endpoint = discovery["token_endpoint"]

        token = await client.fetch_token(
            token_endpoint,
            authorization_response=f"{self.redirect_uri}?code={code}",
            code=code,
        )

        return token

    async def get_user_info(self, access_token: str) -> Dict[str, Any]:
        """Get user info from Google"""
        discovery = await self.get_discovery_document()
        userinfo_endpoint = discovery["userinfo_endpoint"]

        async with httpx.AsyncClient() as client:
            response = await client.get(
                userinfo_endpoint, headers={"Authorization": f"Bearer {access_token}"}
            )
            response.raise_for_status()
            return response.json()

    async def verify_and_get_user_info(self, code: str) -> Dict[str, Any]:
        """Verify code and get user info in one step"""
        try:
            # Exchange code for tokens
            token_data = await self.exchange_code_for_token(code)

            # Get user info
            user_info = await self.get_user_info(token_data["access_token"])

            return {
                "google_id": user_info.get("sub"),
                "email": user_info.get("email"),
                "email_verified": user_info.get("email_verified", False),
                "name": user_info.get("name"),
                "picture": user_info.get("picture"),
                "locale": user_info.get("locale", "en"),
                "tokens": token_data,
            }
        except Exception as e:
            logger.error(f"Google OAuth error: {e}")
            raise


# Singleton instance
google_oauth = GoogleOAuthService()
