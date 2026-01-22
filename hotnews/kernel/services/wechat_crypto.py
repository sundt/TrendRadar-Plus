"""
WeChat Cookie/Token encryption utilities.

Uses Fernet symmetric encryption for secure storage of sensitive credentials.
"""

import base64
import hashlib
import os
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken


# Encryption key derived from environment variable or a default seed
_ENCRYPTION_KEY: Optional[bytes] = None


def _get_encryption_key() -> bytes:
    """Get or generate the encryption key."""
    global _ENCRYPTION_KEY
    
    if _ENCRYPTION_KEY is not None:
        return _ENCRYPTION_KEY
    
    # Try to get key from environment
    env_key = os.environ.get("HOTNEWS_WECHAT_ENCRYPTION_KEY", "").strip()
    
    if env_key:
        # If provided, use it directly (must be valid Fernet key)
        try:
            _ENCRYPTION_KEY = env_key.encode("utf-8")
            # Validate it's a valid Fernet key
            Fernet(_ENCRYPTION_KEY)
            return _ENCRYPTION_KEY
        except Exception:
            pass
    
    # Generate a deterministic key from a seed (for development)
    # In production, set HOTNEWS_WECHAT_ENCRYPTION_KEY environment variable
    seed = os.environ.get("HOTNEWS_SECRET_KEY", "hotnews-default-secret-key-change-me")
    key_bytes = hashlib.sha256(seed.encode("utf-8")).digest()
    _ENCRYPTION_KEY = base64.urlsafe_b64encode(key_bytes)
    
    return _ENCRYPTION_KEY


def encrypt_cookie(plaintext: str) -> str:
    """
    Encrypt a cookie string for secure storage.
    
    Args:
        plaintext: The raw cookie string to encrypt
        
    Returns:
        Base64-encoded encrypted string
    """
    if not plaintext:
        return ""
    
    key = _get_encryption_key()
    fernet = Fernet(key)
    encrypted = fernet.encrypt(plaintext.encode("utf-8"))
    return encrypted.decode("utf-8")


def decrypt_cookie(ciphertext: str) -> Optional[str]:
    """
    Decrypt a stored cookie string.
    
    Args:
        ciphertext: The encrypted cookie string
        
    Returns:
        The decrypted cookie string, or None if decryption fails
    """
    if not ciphertext:
        return None
    
    try:
        key = _get_encryption_key()
        fernet = Fernet(key)
        decrypted = fernet.decrypt(ciphertext.encode("utf-8"))
        return decrypted.decode("utf-8")
    except InvalidToken:
        return None
    except Exception:
        return None


def is_encrypted(text: str) -> bool:
    """
    Check if a string appears to be Fernet-encrypted.
    
    Args:
        text: The string to check
        
    Returns:
        True if the string looks like a Fernet token
    """
    if not text:
        return False
    
    # Fernet tokens are base64-encoded and start with 'gAAAAA'
    try:
        return text.startswith("gAAAAA") and len(text) > 50
    except Exception:
        return False
