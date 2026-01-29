"""
Unified MP Credential Pool (统一凭证池模块)

Manages all available WeChat credentials for article fetching:
- Shared credentials (共享凭证) from wechat_shared_credentials table
- User credentials (用户凭证) from wechat_mp_auth table

Features:
- Priority-based selection (shared credentials first)
- Credential rotation (avoid overusing single credential)
- Cooldown mechanism (pause after rate limiting)
- Expiration tracking (mark invalid credentials)
- Usage statistics (track usage count and last used time)
"""

import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger("uvicorn.error")


# ========== Configuration ==========

# Default cooldown time after rate limiting (seconds)
DEFAULT_COOLDOWN_SECONDS = int(os.environ.get("HOTNEWS_MP_CREDENTIAL_COOLDOWN", "300"))

# Minimum interval between requests using same credential (seconds)
MIN_REQUEST_INTERVAL = 2.0


@dataclass
class Credential:
    """Unified credential data class."""
    id: str                    # Credential identifier (shared_{id} or user_{user_id})
    cookie: str                # WeChat cookie
    token: str                 # WeChat token
    source: str                # Source: "shared" or "user"
    user_id: Optional[int]     # User ID (only for user credentials)
    priority: int              # Priority (lower = higher priority, 0=shared, 1=user)
    last_used_at: int = 0      # Last used timestamp
    cooldown_until: int = 0    # Cooldown end timestamp
    is_valid: bool = True      # Whether credential is valid
    use_count: int = 0         # Total usage count


class CredentialPool:
    """
    Unified credential pool for WeChat MP article fetching.
    
    Manages both shared credentials and user credentials with:
    - Priority sorting (shared credentials first)
    - Credential rotation (avoid overusing single credential)
    - Cooldown mechanism (pause after rate limiting)
    - Expiration tracking (mark invalid credentials)
    """
    
    def __init__(self, cooldown_seconds: int = DEFAULT_COOLDOWN_SECONDS):
        self._credentials: Dict[str, Credential] = {}
        self._cooldown_seconds = cooldown_seconds
        self._last_load_time = 0
    
    def load_credentials(self, online_conn, user_conn) -> int:
        """
        Load all available credentials from database.
        
        Args:
            online_conn: Online database connection (for shared credentials)
            user_conn: User database connection (for user credentials)
            
        Returns:
            Number of credentials loaded
        """
        self._credentials.clear()
        now = int(time.time())
        self._last_load_time = now
        
        # 1. Load shared credentials (priority 0)
        shared_count = self._load_shared_credentials(online_conn, now)
        
        # 2. Load user credentials (priority 1)
        user_count = self._load_user_credentials(user_conn, now)
        
        total = shared_count + user_count
        logger.info(f"[CredentialPool] Loaded {total} credentials (shared={shared_count}, user={user_count})")
        return total
    
    def _load_shared_credentials(self, online_conn, now: int) -> int:
        """Load shared credentials from wechat_shared_credentials table."""
        count = 0
        try:
            cur = online_conn.execute(
                """
                SELECT id, cookie_encrypted, token, status, expires_at, 
                       use_count, last_used_at, cooldown_until
                FROM wechat_shared_credentials
                WHERE status = 'valid' AND expires_at > ?
                """,
                (now,)
            )
            
            # Import decryption function
            from hotnews.kernel.services.wechat_shared_credentials import _decrypt_cookie
            
            for row in cur.fetchall() or []:
                cred_id = row[0]
                cookie_encrypted = row[1]
                token = row[2]
                cooldown_until = row[7] or 0
                
                # Decrypt cookie
                cookie = _decrypt_cookie(cookie_encrypted)
                if not cookie:
                    continue
                
                self._credentials[f"shared_{cred_id}"] = Credential(
                    id=f"shared_{cred_id}",
                    cookie=cookie,
                    token=token,
                    source="shared",
                    user_id=None,
                    priority=0,
                    last_used_at=row[6] or 0,
                    cooldown_until=cooldown_until,
                    is_valid=True,
                    use_count=row[5] or 0,
                )
                count += 1
                
        except Exception as e:
            logger.warning(f"[CredentialPool] Failed to load shared credentials: {e}")
        
        return count
    
    def _load_user_credentials(self, user_conn, now: int) -> int:
        """Load user credentials from wechat_mp_auth table."""
        count = 0
        try:
            cur = user_conn.execute(
                """
                SELECT user_id, cookie_encrypted, token, expires_at
                FROM wechat_mp_auth
                WHERE status = 'valid'
                """
            )
            
            # Import decryption function
            from hotnews.kernel.services.wechat_crypto import decrypt_cookie
            
            for row in cur.fetchall() or []:
                user_id = row[0]
                cookie_encrypted = row[1]
                token = row[2]
                expires_at = row[3]
                
                # Skip expired
                if expires_at and expires_at < now:
                    continue
                
                # Decrypt cookie
                cookie = decrypt_cookie(cookie_encrypted)
                if not cookie:
                    continue
                
                self._credentials[f"user_{user_id}"] = Credential(
                    id=f"user_{user_id}",
                    cookie=cookie,
                    token=token,
                    source="user",
                    user_id=user_id,
                    priority=1,
                    last_used_at=0,
                    cooldown_until=0,
                    is_valid=True,
                    use_count=0,
                )
                count += 1
                
        except Exception as e:
            logger.warning(f"[CredentialPool] Failed to load user credentials: {e}")
        
        return count
    
    def get_credential(self) -> Optional[Credential]:
        """
        Get an available credential.
        
        Selection strategy:
        1. Filter out invalid and cooling down credentials
        2. Sort by priority (shared first)
        3. Within same priority, prefer least recently used
        
        Returns:
            Available credential, or None if no credential available
        """
        now = int(time.time())
        
        # Filter available credentials
        available = [
            c for c in self._credentials.values()
            if c.is_valid and c.cooldown_until <= now
        ]
        
        if not available:
            return None
        
        # Sort by priority and last used time
        available.sort(key=lambda c: (c.priority, c.last_used_at))
        
        # Select first (highest priority, least recently used)
        cred = available[0]
        cred.last_used_at = now
        cred.use_count += 1
        
        return cred
    
    def mark_rate_limited(self, cred_id: str) -> None:
        """
        Mark credential as rate limited, enter cooldown.
        
        Args:
            cred_id: Credential identifier
        """
        if cred_id in self._credentials:
            cred = self._credentials[cred_id]
            cred.cooldown_until = int(time.time()) + self._cooldown_seconds
            logger.warning(
                f"[CredentialPool] Credential {cred_id} rate limited, "
                f"cooldown until {cred.cooldown_until}"
            )
    
    def mark_expired(self, cred_id: str, user_conn=None) -> None:
        """
        Mark credential as expired/invalid.
        
        Args:
            cred_id: Credential identifier
            user_conn: User database connection (to update user auth status)
        """
        if cred_id in self._credentials:
            cred = self._credentials[cred_id]
            cred.is_valid = False
            logger.warning(f"[CredentialPool] Credential {cred_id} marked as expired")
            
            # Update database for user credentials
            if cred.source == "user" and cred.user_id and user_conn:
                try:
                    user_conn.execute(
                        "UPDATE wechat_mp_auth SET status = 'expired' WHERE user_id = ?",
                        (cred.user_id,)
                    )
                    user_conn.commit()
                except Exception as e:
                    logger.error(f"[CredentialPool] Failed to update user auth status: {e}")
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Get credential pool statistics.
        
        Returns:
            {
                "total": int,
                "valid": int,
                "available": int,
                "shared": int,
                "user": int,
                "in_cooldown": int,
            }
        """
        now = int(time.time())
        
        total = len(self._credentials)
        valid = sum(1 for c in self._credentials.values() if c.is_valid)
        available = sum(
            1 for c in self._credentials.values()
            if c.is_valid and c.cooldown_until <= now
        )
        shared = sum(
            1 for c in self._credentials.values()
            if c.source == "shared" and c.is_valid
        )
        user = sum(
            1 for c in self._credentials.values()
            if c.source == "user" and c.is_valid
        )
        in_cooldown = sum(
            1 for c in self._credentials.values()
            if c.is_valid and c.cooldown_until > now
        )
        
        return {
            "total": total,
            "valid": valid,
            "available": available,
            "shared": shared,
            "user": user,
            "in_cooldown": in_cooldown,
        }
    
    def get_credential_details(self) -> List[Dict[str, Any]]:
        """
        Get detailed info for all credentials.
        
        Returns:
            List of credential details
        """
        now = int(time.time())
        details = []
        
        for cred in self._credentials.values():
            cooldown_remaining = max(0, cred.cooldown_until - now)
            details.append({
                "id": cred.id,
                "source": cred.source,
                "priority": cred.priority,
                "is_valid": cred.is_valid,
                "in_cooldown": cred.cooldown_until > now,
                "cooldown_remaining": cooldown_remaining if cooldown_remaining > 0 else None,
                "use_count": cred.use_count,
                "last_used_at": cred.last_used_at,
            })
        
        # Sort by priority and validity
        details.sort(key=lambda x: (not x["is_valid"], x["priority"], -x["use_count"]))
        return details


# ========== Global Instance ==========

_credential_pool: Optional[CredentialPool] = None


def get_credential_pool() -> CredentialPool:
    """Get global credential pool instance."""
    global _credential_pool
    if _credential_pool is None:
        _credential_pool = CredentialPool()
    return _credential_pool


def reset_credential_pool() -> None:
    """Reset global credential pool (for testing)."""
    global _credential_pool
    _credential_pool = None
