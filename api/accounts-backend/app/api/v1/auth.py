from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
import logging
from datetime import datetime, timezone

from app.core.database import get_db
from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    verify_token,
    generate_state_token,
    generate_device_id,
    hash_token
)
from app.services.google_oauth import google_oauth
from app.models.user import User
from app.models.auth_token import AuthToken
from app.core.redis import cache
from app.schemas.auth import (
    TokenResponse,
    RefreshTokenRequest,
    LoginURLResponse
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/login/google", response_model=LoginURLResponse,
    summary="Google 로그인 URL 생성",
    description="""
    Google OAuth 2.0 로그인을 위한 인증 URL을 생성합니다.
    
    이 엔드포인트는:
    - CSRF 보호를 위한 state 토큰을 생성합니다
    - Google OAuth 인증 URL을 반환합니다
    - State 토큰을 10분간 캐시에 저장합니다
    
    사용자는 반환된 URL로 리다이렉트되어 Google 로그인을 진행합니다.
    """,
    responses={
        200: {
            "description": "Google OAuth 인증 URL 반환",
            "content": {
                "application/json": {
                    "example": {
                        "authorization_url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=...&state=..."
                    }
                }
            }
        },
        500: {"description": "서버 오류"}
    }
)
async def login_google():
    """Get Google OAuth login URL"""
    try:
        # Generate state token for CSRF protection
        state = generate_state_token()
        
        # Store state in cache (expires in 10 minutes)
        await cache.set_oauth_state(state, {"provider": "google"}, expire=600)
        
        # Get authorization URL
        authorization_url = await google_oauth.get_authorization_url(state)
        
        return LoginURLResponse(authorization_url=authorization_url)
    except Exception as e:
        logger.error(f"Failed to generate Google login URL: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate login URL"
        )


@router.get("/callback/google")
async def callback_google(
    code: str = Query(..., description="Authorization code from Google"),
    state: str = Query(..., description="State token for CSRF protection"),
    db: AsyncSession = Depends(get_db)
):
    """Handle Google OAuth callback"""
    try:
        # Verify state token
        state_data = await cache.get_oauth_state(state)
        if not state_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired state token"
            )
        
        # Delete state from cache
        await cache.delete_oauth_state(state)
        
        # Exchange code for user info
        user_data = await google_oauth.verify_and_get_user_info(code)
        
        # Check if email is verified
        if not user_data.get("email_verified"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email not verified with Google"
            )
        
        # Find or create user
        result = await db.execute(
            select(User).where(User.google_id == user_data["google_id"])
        )
        user = result.scalar_one_or_none()
        
        if not user:
            # Create new user
            user = User(
                google_id=user_data["google_id"],
                email=user_data["email"],
                name=user_data.get("name"),
                profile_picture=user_data.get("picture"),
                locale=user_data.get("locale", "en"),
                created_via="google_oauth"
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
            
            # Track new user registration
            logger.info(f"New user registered: {user.email}")
        else:
            # Update existing user info
            user.name = user_data.get("name", user.name)
            user.profile_picture = user_data.get("picture", user.profile_picture)
            user.locale = user_data.get("locale", user.locale)
            user.last_login_at = datetime.now(timezone.utc)
            await db.commit()
        
        # Generate tokens
        access_token = create_access_token(data={"sub": str(user.id)})
        refresh_token = create_refresh_token(data={"sub": str(user.id)})
        
        # Generate device ID for this session
        device_id = generate_device_id()
        
        # Store refresh token in database
        auth_token = AuthToken(
            user_id=user.id,
            token_hash=hash_token(refresh_token),
            device_id=device_id,
            user_agent="Chrome Extension"  # This will be passed from extension
        )
        db.add(auth_token)
        await db.commit()
        
        # Cache user profile
        await cache.set_user_profile(str(user.id), user.to_dict())
        
        # Redirect to extension with tokens
        redirect_url = f"{settings.CHROME_EXTENSION_REDIRECT_URI}?access_token={access_token}&refresh_token={refresh_token}"
        
        return RedirectResponse(url=redirect_url)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OAuth callback error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication failed"
        )


@router.post("/refresh", response_model=TokenResponse,
    summary="액세스 토큰 갱신",
    description="""
    만료된 액세스 토큰을 리프레시 토큰을 사용하여 갱신합니다.
    
    리프레시 토큰은:
    - 30일간 유효합니다
    - 데이터베이스에 저장되어 관리됩니다
    - 사용될 때마다 사용 횟수가 기록됩니다
    - 로그아웃 시 무효화됩니다
    """,
    responses={
        200: {"description": "새로운 액세스 토큰 반환"},
        401: {"description": "유효하지 않은 리프레시 토큰"},
        500: {"description": "서버 오류"}
    }
)
async def refresh_token(
    request: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db)
):
    """Refresh access token using refresh token"""
    try:
        # Verify refresh token
        payload = verify_token(request.refresh_token, token_type="refresh")
        if not payload:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )
        
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload"
            )
        
        # Check if refresh token exists in database
        token_hash = hash_token(request.refresh_token)
        result = await db.execute(
            select(AuthToken).where(
                AuthToken.token_hash == token_hash,
                AuthToken.user_id == user_id,
                AuthToken.is_active == True
            )
        )
        auth_token = result.scalar_one_or_none()
        
        if not auth_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token not found or revoked"
            )
        
        # Update last used timestamp
        auth_token.last_used_at = datetime.now(timezone.utc)
        auth_token.usage_count += 1
        await db.commit()
        
        # Generate new access token
        new_access_token = create_access_token(data={"sub": user_id})
        
        return TokenResponse(
            access_token=new_access_token,
            refresh_token=request.refresh_token,  # Keep same refresh token
            token_type="Bearer",
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token refresh error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to refresh token"
        )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    refresh_token: Optional[str] = None,
    response: Response = None,
    db: AsyncSession = Depends(get_db)
):
    """Logout user and revoke tokens"""
    try:
        if refresh_token:
            # Revoke specific refresh token
            token_hash = hash_token(refresh_token)
            result = await db.execute(
                select(AuthToken).where(
                    AuthToken.token_hash == token_hash,
                    AuthToken.is_active == True
                )
            )
            auth_token = result.scalar_one_or_none()
            
            if auth_token:
                auth_token.is_active = False
                auth_token.revoked_at = datetime.now(timezone.utc)
                await db.commit()
                
                # Clear user cache
                await cache.delete_user_profile(str(auth_token.user_id))
        
        return Response(status_code=status.HTTP_204_NO_CONTENT)
        
    except Exception as e:
        logger.error(f"Logout error: {e}")
        # Don't raise error on logout - just log it
        return Response(status_code=status.HTTP_204_NO_CONTENT)