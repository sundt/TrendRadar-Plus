"""
WeChat Shared Credentials Service

共享公众号凭证池（SQLite 持久化版本）：
- 允许一个用户扫码登录后，其他用户共享使用
- 自动轮换凭证，避免单个凭证过度使用
- 凭证过期自动标记，等待刷新
- 服务重启后凭证不丢失

风控策略：
1. 单凭证限制：每个凭证每小时最多使用 30 次
2. 请求间隔：同一凭证两次使用间隔至少 10 秒
3. 凭证轮换：优先使用休息时间长的凭证
4. 池子容量：最多保留 5 个有效凭证（避免浪费）
5. 过期时间：默认 4 小时（与微信一致）

存储：
- SQLite 持久化存储（online.db）
- Cookie 加密存储
- 启动时从数据库加载到内存
"""

import logging
import time
import threading
import base64
import hashlib
import sqlite3
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple
from collections import deque
from pathlib import Path

logger = logging.getLogger("uvicorn.error")


# ========== 风控配置 ==========
MAX_POOL_SIZE = 5                    # 池子最大容量
CREDENTIAL_EXPIRE_SECONDS = 4 * 3600 # 凭证有效期 4 小时
MAX_USE_PER_HOUR = 30                # 单凭证每小时最多使用次数
MIN_USE_INTERVAL = 10                # 同一凭证两次使用最小间隔（秒）
COOLDOWN_AFTER_ERROR = 300           # 出错后冷却时间（秒）

# 加密密钥（简单混淆，防止直接读取）
_ENCRYPT_KEY = "hotnews_wechat_2024"


@dataclass
class SharedCredential:
    """共享凭证"""
    id: int
    cookie: str
    token: str
    status: str  # valid, expired, invalid, cooldown
    created_at: int
    updated_at: int
    expires_at: int
    contributed_by: Optional[int]
    use_count: int
    last_used_at: int
    last_error: Optional[str]
    cooldown_until: int = 0
    # 内存中的风控数据（不持久化）
    hourly_use_times: deque = field(default_factory=deque)


# 内存缓存
_credentials_cache: Dict[int, SharedCredential] = {}
_cache_lock = threading.Lock()
_db_conn: Optional[sqlite3.Connection] = None
_initialized = False


def _now_ts() -> int:
    return int(time.time())


def _encrypt_cookie(cookie: str) -> str:
    """简单加密 Cookie（base64 + XOR 混淆）"""
    if not cookie:
        return ""
    key_bytes = hashlib.md5(_ENCRYPT_KEY.encode()).digest()
    cookie_bytes = cookie.encode('utf-8')
    encrypted = bytes(b ^ key_bytes[i % len(key_bytes)] for i, b in enumerate(cookie_bytes))
    return base64.b64encode(encrypted).decode('ascii')


def _decrypt_cookie(encrypted: str) -> str:
    """解密 Cookie"""
    if not encrypted:
        return ""
    try:
        key_bytes = hashlib.md5(_ENCRYPT_KEY.encode()).digest()
        encrypted_bytes = base64.b64decode(encrypted.encode('ascii'))
        decrypted = bytes(b ^ key_bytes[i % len(key_bytes)] for i, b in enumerate(encrypted_bytes))
        return decrypted.decode('utf-8')
    except Exception as e:
        logger.error(f"[SharedCred] Failed to decrypt cookie: {e}")
        return ""


def _get_db_conn() -> sqlite3.Connection:
    """获取数据库连接"""
    global _db_conn
    if _db_conn is not None:
        return _db_conn
    
    # 查找 online.db 路径
    possible_paths = [
        Path("output/online.db"),
        Path("hotnews/output/online.db"),
        Path("/app/output/online.db"),
    ]
    
    db_path = None
    for p in possible_paths:
        if p.exists():
            db_path = p
            break
    
    if db_path is None:
        # 创建默认路径
        db_path = Path("output/online.db")
        db_path.parent.mkdir(parents=True, exist_ok=True)
    
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    
    # 创建表
    conn.execute("""
        CREATE TABLE IF NOT EXISTS wechat_shared_credentials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cookie_encrypted TEXT NOT NULL,
            token TEXT NOT NULL,
            status TEXT DEFAULT 'valid',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            contributed_by INTEGER,
            use_count INTEGER DEFAULT 0,
            last_used_at INTEGER DEFAULT 0,
            last_error TEXT,
            cooldown_until INTEGER DEFAULT 0
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_shared_cred_status ON wechat_shared_credentials(status)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_shared_cred_expires ON wechat_shared_credentials(expires_at)")
    conn.commit()
    
    _db_conn = conn
    return conn


def _load_from_db():
    """从数据库加载凭证到内存"""
    global _credentials_cache, _initialized
    
    if _initialized:
        return
    
    conn = _get_db_conn()
    now = _now_ts()
    
    with _cache_lock:
        cursor = conn.execute("""
            SELECT id, cookie_encrypted, token, status, created_at, updated_at,
                   expires_at, contributed_by, use_count, last_used_at, last_error, cooldown_until
            FROM wechat_shared_credentials
            WHERE status IN ('valid', 'cooldown') AND expires_at > ?
        """, (now,))
        
        for row in cursor.fetchall():
            cookie = _decrypt_cookie(row['cookie_encrypted'])
            if not cookie:
                continue
            
            cred = SharedCredential(
                id=row['id'],
                cookie=cookie,
                token=row['token'],
                status=row['status'],
                created_at=row['created_at'],
                updated_at=row['updated_at'],
                expires_at=row['expires_at'],
                contributed_by=row['contributed_by'],
                use_count=row['use_count'],
                last_used_at=row['last_used_at'],
                last_error=row['last_error'],
                cooldown_until=row['cooldown_until'] or 0,
                hourly_use_times=deque(),
            )
            _credentials_cache[cred.id] = cred
        
        _initialized = True
        logger.info(f"[SharedCred] Loaded {len(_credentials_cache)} credentials from database")


def _save_to_db(cred: SharedCredential):
    """保存凭证到数据库"""
    conn = _get_db_conn()
    
    if cred.id == 0:
        # 新增
        cursor = conn.execute("""
            INSERT INTO wechat_shared_credentials 
            (cookie_encrypted, token, status, created_at, updated_at, expires_at,
             contributed_by, use_count, last_used_at, last_error, cooldown_until)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            _encrypt_cookie(cred.cookie),
            cred.token,
            cred.status,
            cred.created_at,
            cred.updated_at,
            cred.expires_at,
            cred.contributed_by,
            cred.use_count,
            cred.last_used_at,
            cred.last_error,
            cred.cooldown_until,
        ))
        cred.id = cursor.lastrowid
    else:
        # 更新
        conn.execute("""
            UPDATE wechat_shared_credentials SET
                cookie_encrypted = ?,
                token = ?,
                status = ?,
                updated_at = ?,
                expires_at = ?,
                use_count = ?,
                last_used_at = ?,
                last_error = ?,
                cooldown_until = ?
            WHERE id = ?
        """, (
            _encrypt_cookie(cred.cookie),
            cred.token,
            cred.status,
            cred.updated_at,
            cred.expires_at,
            cred.use_count,
            cred.last_used_at,
            cred.last_error,
            cred.cooldown_until,
            cred.id,
        ))
    
    conn.commit()


def _cleanup_hourly_uses(cred: SharedCredential, now: int):
    """清理超过 1 小时的使用记录"""
    cutoff = now - 3600
    while cred.hourly_use_times and cred.hourly_use_times[0] < cutoff:
        cred.hourly_use_times.popleft()


def _can_use_credential(cred: SharedCredential, now: int) -> Tuple[bool, str]:
    """检查凭证是否可以使用"""
    if cred.status != "valid":
        return False, f"状态异常: {cred.status}"
    
    if cred.expires_at <= now:
        return False, "已过期"
    
    if cred.cooldown_until > now:
        remaining = cred.cooldown_until - now
        return False, f"冷却中，还需 {remaining} 秒"
    
    if cred.last_used_at > 0 and (now - cred.last_used_at) < MIN_USE_INTERVAL:
        return False, f"使用过于频繁，请等待 {MIN_USE_INTERVAL - (now - cred.last_used_at)} 秒"
    
    _cleanup_hourly_uses(cred, now)
    
    if len(cred.hourly_use_times) >= MAX_USE_PER_HOUR:
        oldest = cred.hourly_use_times[0]
        wait_seconds = oldest + 3600 - now
        return False, f"本小时使用次数已达上限，请等待 {wait_seconds} 秒"
    
    return True, ""


def init_shared_credentials():
    """初始化共享凭证服务（应用启动时调用）"""
    _load_from_db()


def add_shared_credential(
    cookie: str,
    token: str,
    contributed_by: Optional[int] = None,
    expires_in: int = CREDENTIAL_EXPIRE_SECONDS,
) -> Tuple[bool, str, Optional[int]]:
    """添加共享凭证到池子"""
    _load_from_db()
    
    if not cookie or not token:
        return False, "Cookie 和 Token 不能为空", None
    
    now = _now_ts()
    
    with _cache_lock:
        # 检查池子容量
        valid_count = sum(
            1 for c in _credentials_cache.values()
            if c.status == "valid" and c.expires_at > now
        )
        
        if valid_count >= MAX_POOL_SIZE:
            return False, f"共享池已满（最多 {MAX_POOL_SIZE} 个），请等待现有凭证过期", None
        
        # 检查是否已存在相同的凭证
        for existing in _credentials_cache.values():
            if existing.cookie == cookie and existing.status == "valid":
                return False, "该凭证已在共享池中", existing.id
        
        cred = SharedCredential(
            id=0,  # 新增时为 0，保存后更新
            cookie=cookie,
            token=token,
            status="valid",
            created_at=now,
            updated_at=now,
            expires_at=now + expires_in,
            contributed_by=contributed_by,
            use_count=0,
            last_used_at=0,
            last_error=None,
            cooldown_until=0,
            hourly_use_times=deque(),
        )
        
        _save_to_db(cred)
        _credentials_cache[cred.id] = cred
        
    logger.info(f"[SharedCred] Added credential #{cred.id} by user {contributed_by}, expires in {expires_in}s")
    return True, "凭证已添加到共享池", cred.id


def get_available_credential() -> Optional[SharedCredential]:
    """获取一个可用的共享凭证"""
    _load_from_db()
    
    now = _now_ts()
    
    with _cache_lock:
        available = []
        for cred in _credentials_cache.values():
            can_use, reason = _can_use_credential(cred, now)
            if can_use:
                available.append(cred)
        
        if not available:
            return None
        
        # 按休息时间排序
        available.sort(key=lambda c: (c.last_used_at, len(c.hourly_use_times)))
        selected = available[0]
        
        # 更新使用统计
        selected.use_count += 1
        selected.last_used_at = now
        selected.updated_at = now
        selected.hourly_use_times.append(now)
        
        # 异步保存（避免阻塞）
        _save_to_db(selected)
        
        logger.debug(f"[SharedCred] Selected credential #{selected.id}, hourly uses: {len(selected.hourly_use_times)}")
        return selected


def mark_credential_used(cred_id: int, success: bool, error: Optional[str] = None):
    """标记凭证使用结果"""
    now = _now_ts()
    
    with _cache_lock:
        cred = _credentials_cache.get(cred_id)
        if not cred:
            return
        
        cred.updated_at = now
        
        if not success:
            cred.last_error = error
            
            if error:
                error_lower = error.lower()
                if "expired" in error_lower or "登录" in error or "过期" in error or "session" in error_lower:
                    cred.status = "expired"
                    logger.warning(f"[SharedCred] Credential #{cred_id} marked as expired: {error}")
                elif "频繁" in error or "limit" in error_lower or "rate" in error_lower:
                    cred.cooldown_until = now + COOLDOWN_AFTER_ERROR
                    logger.warning(f"[SharedCred] Credential #{cred_id} entering cooldown: {error}")
                else:
                    cred.cooldown_until = now + 60
                    logger.warning(f"[SharedCred] Credential #{cred_id} short cooldown: {error}")
        
        _save_to_db(cred)


def mark_credential_expired(cred_id: int, reason: str = ""):
    """标记凭证为过期"""
    with _cache_lock:
        cred = _credentials_cache.get(cred_id)
        if cred:
            cred.status = "expired"
            cred.last_error = reason
            cred.updated_at = _now_ts()
            _save_to_db(cred)
            logger.info(f"[SharedCred] Credential #{cred_id} expired: {reason}")


def refresh_credential(cred_id: int, new_cookie: str, new_token: str, expires_in: int = CREDENTIAL_EXPIRE_SECONDS):
    """刷新凭证"""
    now = _now_ts()
    
    with _cache_lock:
        cred = _credentials_cache.get(cred_id)
        if cred:
            cred.cookie = new_cookie
            cred.token = new_token
            cred.status = "valid"
            cred.updated_at = now
            cred.expires_at = now + expires_in
            cred.last_error = None
            cred.cooldown_until = 0
            cred.hourly_use_times.clear()
            _save_to_db(cred)
            logger.info(f"[SharedCred] Credential #{cred_id} refreshed")


def get_pool_status() -> Dict[str, Any]:
    """获取凭证池状态"""
    _load_from_db()
    
    now = _now_ts()
    
    with _cache_lock:
        total = len(_credentials_cache)
        valid = 0
        available_now = 0
        
        creds = []
        for c in _credentials_cache.values():
            is_valid = c.status == "valid" and c.expires_at > now
            can_use, reason = _can_use_credential(c, now) if is_valid else (False, c.status)
            
            if is_valid:
                valid += 1
            if can_use:
                available_now += 1
            
            _cleanup_hourly_uses(c, now)
            
            creds.append({
                "id": c.id,
                "status": "valid" if is_valid else c.status,
                "can_use": can_use,
                "reason": reason if not can_use else None,
                "expires_at": c.expires_at,
                "expires_in_minutes": max(0, (c.expires_at - now) // 60),
                "use_count": c.use_count,
                "hourly_uses": len(c.hourly_use_times),
                "max_hourly_uses": MAX_USE_PER_HOUR,
                "last_used_at": c.last_used_at,
                "last_used_ago": now - c.last_used_at if c.last_used_at > 0 else None,
                "contributed_by": c.contributed_by,
                "last_error": c.last_error,
                "cooldown_until": c.cooldown_until if c.cooldown_until > now else None,
            })
        
        return {
            "total": total,
            "valid": valid,
            "available_now": available_now,
            "expired": total - valid,
            "max_size": MAX_POOL_SIZE,
            "limits": {
                "max_use_per_hour": MAX_USE_PER_HOUR,
                "min_use_interval": MIN_USE_INTERVAL,
                "credential_expire_hours": CREDENTIAL_EXPIRE_SECONDS // 3600,
            },
            "credentials": sorted(creds, key=lambda x: (-x["expires_at"] if x["status"] == "valid" else 0)),
        }


def remove_credential(cred_id: int) -> bool:
    """移除凭证"""
    conn = _get_db_conn()
    
    with _cache_lock:
        if cred_id in _credentials_cache:
            del _credentials_cache[cred_id]
        
        conn.execute("DELETE FROM wechat_shared_credentials WHERE id = ?", (cred_id,))
        conn.commit()
        logger.info(f"[SharedCred] Credential #{cred_id} removed")
        return True
    
    return False


def cleanup_expired_credentials():
    """清理过期凭证"""
    conn = _get_db_conn()
    now = _now_ts()
    cutoff = now - 24 * 3600  # 保留 24 小时内的过期记录
    
    with _cache_lock:
        # 从内存中移除
        to_remove = [
            cred_id for cred_id, cred in _credentials_cache.items()
            if cred.status == "expired" and cred.updated_at < cutoff
        ]
        
        for cred_id in to_remove:
            del _credentials_cache[cred_id]
        
        # 从数据库中删除
        conn.execute("""
            DELETE FROM wechat_shared_credentials 
            WHERE status = 'expired' AND updated_at < ?
        """, (cutoff,))
        conn.commit()
        
        if to_remove:
            logger.info(f"[SharedCred] Cleaned up {len(to_remove)} old expired credentials")


def get_usage_stats() -> Dict[str, Any]:
    """获取使用统计"""
    _load_from_db()
    
    with _cache_lock:
        total_uses = sum(c.use_count for c in _credentials_cache.values())
        hourly_uses = sum(len(c.hourly_use_times) for c in _credentials_cache.values())
        
        return {
            "total_uses": total_uses,
            "hourly_uses": hourly_uses,
            "pool_size": len(_credentials_cache),
        }
