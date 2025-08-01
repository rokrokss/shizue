from fastapi import APIRouter

from app.api.v1 import auth, usage, users

api_router = APIRouter()

# Include routers
api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])

api_router.include_router(users.router, prefix="/users", tags=["users"])

api_router.include_router(usage.router, prefix="/usage", tags=["usage"])
