"""Encryption utilities for sensitive data."""

import base64
import os
from typing import Optional

from cryptography.fernet import Fernet
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from app.core.config import settings


class EncryptionService:
    """Service for encrypting and decrypting sensitive data."""

    def __init__(self):
        self.fernet = self._get_fernet()

    def _get_fernet(self) -> Fernet:
        """Get or create Fernet encryption instance."""
        # Use JWT_SECRET_KEY from settings as the base for encryption key
        password = settings.JWT_SECRET_KEY.encode()
        salt = b"stable_salt_for_api_keys"  # In production, use a proper salt

        kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100000, backend=default_backend())

        key = base64.urlsafe_b64encode(kdf.derive(password))
        return Fernet(key)

    def encrypt(self, plaintext: str) -> str:
        """Encrypt a plaintext string."""
        if not plaintext:
            return ""

        encrypted = self.fernet.encrypt(plaintext.encode())
        return base64.urlsafe_b64encode(encrypted).decode()

    def decrypt(self, ciphertext: str) -> Optional[str]:
        """Decrypt a ciphertext string."""
        if not ciphertext:
            return ""

        try:
            decoded = base64.urlsafe_b64decode(ciphertext.encode())
            decrypted = self.fernet.decrypt(decoded)
            return decrypted.decode()
        except Exception:
            return None

    def mask_api_key(self, api_key: str) -> str:
        """Mask an API key for display."""
        if not api_key or len(api_key) < 8:
            return "****"

        # Show first 4 and last 4 characters
        return f"{api_key[:4]}...{api_key[-4:]}"


# Global encryption service instance
encryption_service = EncryptionService()
