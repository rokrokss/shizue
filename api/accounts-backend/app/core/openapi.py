from typing import Any, Dict

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi


def custom_openapi(app: FastAPI) -> Dict[str, Any]:
    """Generate custom OpenAPI schema with enhanced documentation."""
    if app.openapi_schema:
        return app.openapi_schema

    openapi_schema = get_openapi(
        title="Shizue Accounts API",
        version="1.0.0",
        description="""
## Overview

Shizue Accounts API는 Shizue Chrome Extension의 사용자 계정 관리를 위한 백엔드 서비스입니다.

### 주요 기능

- **🔐 인증**: Google OAuth 2.0을 통한 안전한 로그인
- **👤 사용자 관리**: 프로필 관리 및 설정
- **📊 사용량 추적**: API 사용량 모니터링 및 통계
- **🎫 토큰 관리**: JWT 기반 인증 및 자동 갱신

### 시작하기

1. Google OAuth로 로그인: `GET /v1/auth/login/google`
2. 콜백 처리 후 액세스 토큰 받기
3. Authorization 헤더에 토큰 포함: `Bearer {access_token}`
4. API 엔드포인트 호출

### 인증

모든 보호된 엔드포인트는 Authorization 헤더가 필요합니다:

```
Authorization: Bearer {access_token}
```

액세스 토큰은 30분 후 만료되며, 리프레시 토큰으로 갱신할 수 있습니다.

### 에러 응답

API는 일관된 에러 응답 형식을 사용합니다:

```json
{
    "detail": "Error message",
    "status_code": 400,
    "timestamp": "2024-01-01T00:00:00Z",
    "request_id": "uuid"
}
```

### Rate Limiting

- 인증된 사용자: 분당 100 요청
- 인증되지 않은 사용자: 분당 10 요청

### 지원

문제가 있으시면 [GitHub Issues](https://github.com/shizue/accounts-api/issues)에 보고해주세요.
        """,
        routes=app.routes,
        tags=[
            {
                "name": "authentication",
                "description": "OAuth 로그인 및 토큰 관리",
            },
            {
                "name": "users",
                "description": "사용자 프로필 및 설정 관리",
            },
            {
                "name": "usage",
                "description": "API 사용량 추적 및 통계",
            },
        ],
        servers=[
            {
                "url": "http://localhost:8000",
                "description": "Local development server",
            },
            {
                "url": "https://api.shizue.app",
                "description": "Production server",
            },
        ],
    )

    # Add security schemes
    openapi_schema["components"]["securitySchemes"] = {
        "bearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "JWT token obtained from OAuth login",
        }
    }

    # Add global security requirement for protected endpoints
    for path, path_item in openapi_schema["paths"].items():
        # Skip auth endpoints and health check
        if path.startswith("/v1/auth") or path == "/health":
            continue

        for method in path_item:
            if method in ["get", "post", "put", "patch", "delete"]:
                if "security" not in path_item[method]:
                    path_item[method]["security"] = [{"bearerAuth": []}]

    # Add examples
    add_response_examples(openapi_schema)

    app.openapi_schema = openapi_schema
    return app.openapi_schema


def add_response_examples(schema: Dict[str, Any]) -> None:
    """Add response examples to OpenAPI schema."""
    examples = {
        "/v1/auth/login/google": {
            "get": {
                "200": {
                    "content": {
                        "application/json": {
                            "example": {
                                "authorization_url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=..."
                            }
                        }
                    }
                }
            }
        },
        "/v1/users/me": {
            "get": {
                "200": {
                    "content": {
                        "application/json": {
                            "example": {
                                "id": "123e4567-e89b-12d3-a456-426614174000",
                                "google_id": "1234567890",
                                "email": "user@example.com",
                                "name": "John Doe",
                                "profile_picture": "https://example.com/photo.jpg",
                                "locale": "en",
                                "is_active": True,
                                "is_premium": False,
                                "created_at": "2024-01-01T00:00:00Z",
                                "last_login_at": "2024-01-01T12:00:00Z",
                            }
                        }
                    }
                }
            }
        },
        "/v1/usage/summary": {
            "get": {
                "200": {
                    "content": {
                        "application/json": {
                            "example": {
                                "period": "month",
                                "total_messages": 150,
                                "total_tokens": 45000,
                                "models": {
                                    "gpt-4": {"messages": 50, "tokens": 25000},
                                    "claude-3": {"messages": 100, "tokens": 20000},
                                },
                                "daily_breakdown": [
                                    {
                                        "date": "2024-01-01",
                                        "messages": 10,
                                        "tokens": 3000,
                                    }
                                ],
                            }
                        }
                    }
                }
            }
        },
    }

    # Apply examples to schema
    for path, methods in examples.items():
        if path in schema["paths"]:
            for method, responses in methods.items():
                if method in schema["paths"][path]:
                    for status_code, response_data in responses.items():
                        if "responses" in schema["paths"][path][method]:
                            if status_code in schema["paths"][path][method]["responses"]:
                                schema["paths"][path][method]["responses"][status_code].update(response_data)
