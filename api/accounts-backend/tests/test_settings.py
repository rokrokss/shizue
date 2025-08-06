"""Tests for user settings endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.skip(reason="Settings endpoints not implemented yet")
@pytest.mark.asyncio
async def test_get_settings_unauthenticated(client: AsyncClient):
    """Test getting settings without authentication."""
    response = await client.get("/api/v1/settings")
    assert response.status_code == 401


@pytest.mark.skip(reason="Settings endpoints not implemented yet")
@pytest.mark.asyncio
async def test_get_settings_authenticated(client: AsyncClient, auth_headers: dict):
    """Test getting settings with authentication."""
    response = await client.get("/api/v1/settings", headers=auth_headers)
    assert response.status_code == 200

    data = response.json()
    assert "general" in data
    assert "models" in data
    assert "layout" in data
    assert "apiKeys" in data

    # Check default values
    assert data["general"]["language"] == "English"
    assert data["models"]["chatModel"] == "gpt-4.1-mini"
    assert data["layout"]["theme"] == "light"


@pytest.mark.skip(reason="Settings endpoints not implemented yet")
@pytest.mark.asyncio
async def test_update_settings(client: AsyncClient, auth_headers: dict):
    """Test updating all settings."""
    settings = {
        "general": {
            "language": "Korean_한국어",
            "translateTargetLanguage": "English",
            "userMemory": "Test memory"
        },
        "models": {
            "chatModel": "gpt-4.1",
            "translateModel": "gemini-2.5-flash"
        },
        "layout": {
            "theme": "dark",
            "showToggle": False,
            "toggleYPosition": 75.5
        },
        "apiKeys": {
            "openai": "sk-test123",
            "gemini": "AIza-test456",
            "anthropic": "sk-ant-test789"
        }
    }

    response = await client.put("/api/v1/settings", json=settings, headers=auth_headers)
    assert response.status_code == 200

    data = response.json()
    assert data["general"]["language"] == "Korean_한국어"
    assert data["models"]["chatModel"] == "gpt-4.1"
    assert data["layout"]["theme"] == "dark"

    # API keys should be masked
    assert "..." in data["apiKeys"]["openai"]
    assert "..." in data["apiKeys"]["gemini"]
    assert "..." in data["apiKeys"]["anthropic"]


@pytest.mark.skip(reason="Settings endpoints not implemented yet")
@pytest.mark.asyncio
async def test_patch_settings(client: AsyncClient, auth_headers: dict):
    """Test partially updating settings."""
    update = {
        "general": {
            "language": "Japanese_日本語"
        },
        "layout": {
            "theme": "light"
        }
    }

    response = await client.patch("/api/v1/settings", json=update, headers=auth_headers)
    assert response.status_code == 200

    data = response.json()
    assert data["general"]["language"] == "Japanese_日本語"
    assert data["layout"]["theme"] == "light"


@pytest.mark.skip(reason="Settings endpoints not implemented yet")
@pytest.mark.asyncio
async def test_update_api_key(client: AsyncClient, auth_headers: dict):
    """Test updating a specific API key."""
    request = {
        "provider": "openai",
        "key": "sk-proj-abcdef123456"
    }

    response = await client.post("/api/v1/settings/api-keys", json=request, headers=auth_headers)
    assert response.status_code == 200

    data = response.json()
    assert data["provider"] == "openai"
    assert data["maskedKey"] == "sk-p...3456"
    assert data["validated"] == False


@pytest.mark.skip(reason="Settings endpoints not implemented yet")
@pytest.mark.asyncio
async def test_update_invalid_api_key_provider(client: AsyncClient, auth_headers: dict):
    """Test updating API key with invalid provider."""
    request = {
        "provider": "invalid",
        "key": "test-key"
    }

    response = await client.post("/api/v1/settings/api-keys", json=request, headers=auth_headers)
    assert response.status_code == 400
    assert "Invalid provider" in response.json()["detail"]


@pytest.mark.skip(reason="Settings endpoints not implemented yet")
@pytest.mark.asyncio
async def test_delete_api_key(client: AsyncClient, auth_headers: dict):
    """Test deleting an API key."""
    # First add an API key
    request = {
        "provider": "gemini",
        "key": "AIza-test-key"
    }
    await client.post("/api/v1/settings/api-keys", json=request, headers=auth_headers)

    # Then delete it
    response = await client.delete("/api/v1/settings/api-keys/gemini", headers=auth_headers)
    assert response.status_code == 200
    assert "deleted successfully" in response.json()["message"]

    # Verify it's deleted
    response = await client.get("/api/v1/settings", headers=auth_headers)
    data = response.json()
    assert data["apiKeys"]["gemini"] is None
    assert data["apiKeys"]["geminiValidated"] == False


@pytest.mark.skip(reason="Settings endpoints not implemented yet")
@pytest.mark.asyncio
async def test_migrate_settings(client: AsyncClient, auth_headers: dict):
    """Test migrating settings from localStorage."""
    local_settings = {
        "LANGUAGE": "Spanish_Español",
        "TRANSLATE_TARGET_LANGUAGE": "French_Français",
        "CHAT_MODEL": "claude-sonnet-4-20250514",
        "TRANSLATE_MODEL": "gpt-4.1-mini",
        "THEME": "dark",
        "SHOW_TOGGLE": False,
        "TOGGLE_Y_POSITION": 25.0,
        "OPENAI_KEY": "sk-old-key",
        "OPENAI_VALIDATED": True,
        "API_MODE": "keys",
        "PDF_TRANSLATE_NO_DUAL": True
    }

    response = await client.post("/api/v1/settings/migrate", json=local_settings, headers=auth_headers)
    assert response.status_code == 200

    data = response.json()
    assert data["general"]["language"] == "Spanish_Español"
    assert data["general"]["translateTargetLanguage"] == "French_Français"
    assert data["models"]["chatModel"] == "claude-sonnet-4-20250514"
    assert data["layout"]["theme"] == "dark"
    assert data["layout"]["showToggle"] == False
    assert data["pdfTranslateNoDual"] == True

    # API key should be encrypted and masked
    assert "..." in data["apiKeys"]["openai"]
    assert data["apiKeys"]["openaiValidated"] == True
