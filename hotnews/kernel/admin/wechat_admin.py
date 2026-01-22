"""
WeChat MP (公众号) Admin API

Provides REST API endpoints for:
- Authentication management (save/test/status)
- Official account search
- Subscription management
- Article retrieval
- Image proxy for WeChat avatars
"""

import logging
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from fastapi.responses import Response
import httpx

from hotnews.kernel.providers.wechat_provider import (
    WeChatMPProvider,
    WeChatErrorCode,
    generate_dedup_key,
    generate_source_id,
)
from hotnews.kernel.services.wechat_crypto import decrypt_cookie, encrypt_cookie
from hotnews.kernel.services.wechat_qr_login import (
    start_login_session,
    get_qrcode_url,
    check_scan_status,
    complete_login,
    cancel_login,
)

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api/wechat", tags=["wechat"])


# ========== Request/Response Models ==========

class AuthSaveRequest(BaseModel):
    """Request to save authentication credentials."""
    cookie: str
    token: str


class PluginAuthRequest(BaseModel):
    """Request from browser plugin to save Cookie credentials."""
    credentials: str  # Cookie string in "name=value; name=value" format


class AuthStatusResponse(BaseModel):
    """Authentication status response."""
    ok: bool
    status: str  # none, valid, expired, invalid
    expires_at: Optional[int] = None
    updated_at: Optional[int] = None
    error: Optional[str] = None


class SubscribeRequest(BaseModel):
    """Request to subscribe to an official account."""
    fakeid: str
    nickname: str
    round_head_img: Optional[str] = ""
    signature: Optional[str] = ""


class UnsubscribeRequest(BaseModel):
    """Request to unsubscribe from an official account."""
    fakeid: str


# ========== Helper Functions ==========

def _now_ts() -> int:
    return int(time.time())


def _get_user_db_conn(request: Request):
    """Get user database connection."""
    from hotnews.web.user_db import get_user_db_conn
    return get_user_db_conn(request.app.state.project_root)


def _get_online_db_conn(request: Request):
    """Get online database connection."""
    from hotnews.web.db_online import get_online_db_conn
    return get_online_db_conn(request.app.state.project_root)


def _get_session_token(request: Request) -> Optional[str]:
    """Get session token from cookie."""
    return request.cookies.get("hotnews_session")


def _get_bearer_token(request: Request) -> Optional[str]:
    """Get Bearer token from Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:].strip()
    return None


def _get_current_user(request: Request) -> Optional[Dict[str, Any]]:
    """
    Get current authenticated user from session token or Bearer token.
    
    Supports two authentication methods:
    1. Session cookie (hotnews_session) - for web browser
    2. Bearer token in Authorization header - for browser plugin
    """
    from hotnews.kernel.auth.auth_service import validate_session
    
    conn = _get_user_db_conn(request)
    
    # Try session cookie first
    session_token = _get_session_token(request)
    if session_token:
        try:
            is_valid, user_info = validate_session(conn, session_token)
            if is_valid and user_info:
                return user_info
        except Exception as e:
            logger.error(f"Failed to validate session: {e}")
    
    # Try Bearer token (for plugin)
    bearer_token = _get_bearer_token(request)
    if bearer_token:
        try:
            is_valid, user_info = validate_session(conn, bearer_token)
            if is_valid and user_info:
                return user_info
        except Exception as e:
            logger.error(f"Failed to validate bearer token: {e}")
    
    return None


def _require_user(request: Request) -> Dict[str, Any]:
    """Require authenticated user, raise 401 if not authenticated."""
    user = _get_current_user(request)
    if not user or not user.get("id"):
        raise HTTPException(status_code=401, detail="请先登录")
    return user


# ========== Authentication Endpoints ==========

@router.get("/auth/status")
async def get_auth_status(request: Request) -> AuthStatusResponse:
    """
    Get current authentication status.
    
    Returns the status of the user's WeChat credentials.
    """
    user = _get_current_user(request)
    if not user or not user.get("id"):
        return AuthStatusResponse(ok=True, status="none")
    
    user_id = user["id"]
    conn = _get_user_db_conn(request)
    
    try:
        cur = conn.execute(
            "SELECT status, expires_at, updated_at, last_error FROM wechat_mp_auth WHERE user_id = ?",
            (user_id,)
        )
        row = cur.fetchone()
        
        if not row:
            return AuthStatusResponse(ok=True, status="none")
        
        status = str(row[0] or "valid")
        expires_at = int(row[1] or 0) if row[1] else None
        updated_at = int(row[2] or 0) if row[2] else None
        last_error = str(row[3] or "") if row[3] else None
        
        # Check if expired based on time
        if status == "valid" and expires_at and expires_at < _now_ts():
            status = "expired"
        
        return AuthStatusResponse(
            ok=True,
            status=status,
            expires_at=expires_at,
            updated_at=updated_at,
            error=last_error if status != "valid" else None,
        )
    except Exception as e:
        logger.error(f"Failed to get auth status: {e}")
        return AuthStatusResponse(ok=False, status="none", error=str(e))


@router.post("/auth")
async def save_auth(request: Request, body: AuthSaveRequest) -> Dict[str, Any]:
    """
    Save authentication credentials.
    
    Validates the credentials before saving.
    """
    user = _require_user(request)
    user_id = user["id"]
    
    cookie = (body.cookie or "").strip()
    token = (body.token or "").strip()
    
    if not cookie or not token:
        raise HTTPException(status_code=400, detail="Cookie 和 Token 不能为空")
    
    # Test credentials first
    provider = WeChatMPProvider(cookie, token)
    result = provider.test_auth()
    
    if not result.ok:
        if result.error_code == WeChatErrorCode.SESSION_EXPIRED:
            raise HTTPException(status_code=400, detail="Cookie/Token 已过期，请重新获取")
        raise HTTPException(status_code=400, detail=result.error_message or "认证验证失败")
    
    # Encrypt and save
    conn = _get_user_db_conn(request)
    now = _now_ts()
    
    # Estimate expiration (WeChat tokens typically last 2-4 hours)
    expires_at = now + (2 * 60 * 60)  # 2 hours from now
    
    try:
        encrypted_cookie = encrypt_cookie(cookie)
        
        conn.execute(
            """
            INSERT INTO wechat_mp_auth (user_id, cookie_encrypted, token, created_at, updated_at, expires_at, status)
            VALUES (?, ?, ?, ?, ?, ?, 'valid')
            ON CONFLICT(user_id) DO UPDATE SET
                cookie_encrypted = excluded.cookie_encrypted,
                token = excluded.token,
                updated_at = excluded.updated_at,
                expires_at = excluded.expires_at,
                status = 'valid',
                last_error = NULL
            """,
            (user_id, encrypted_cookie, token, now, now, expires_at)
        )
        conn.commit()
        
        return {"ok": True, "message": "认证信息已保存", "expires_at": expires_at}
    except Exception as e:
        logger.error(f"Failed to save auth: {e}")
        raise HTTPException(status_code=500, detail="保存认证信息失败")


@router.post("/auth/plugin")
async def save_auth_from_plugin(request: Request, body: PluginAuthRequest) -> Dict[str, Any]:
    """
    Save authentication credentials from browser plugin.
    
    This endpoint is designed for the hotnews-summarizer browser plugin.
    It accepts a Cookie string and extracts the token automatically.
    
    The plugin reads cookies from mp.weixin.qq.com and sends them here.
    This approach distributes login IP risk across users' own browsers.
    """
    user = _require_user(request)
    user_id = user["id"]
    
    credentials = (body.credentials or "").strip()
    if not credentials:
        raise HTTPException(status_code=400, detail="credentials 不能为空")
    
    # Parse cookie string to extract token
    # Cookie format: "name1=value1; name2=value2; ..."
    cookie_dict = {}
    for part in credentials.split(";"):
        part = part.strip()
        if "=" in part:
            key, value = part.split("=", 1)
            cookie_dict[key.strip()] = value.strip()
    
    # Required cookies for WeChat MP API
    required_cookies = ["slave_user", "slave_sid", "data_ticket"]
    missing = [c for c in required_cookies if c not in cookie_dict]
    if missing:
        raise HTTPException(
            status_code=400, 
            detail=f"缺少必要的 Cookie: {', '.join(missing)}"
        )
    
    # Try to extract token from cookies or fetch it
    # The token is usually in the URL or page content, not in cookies
    # We'll need to make a request to get it
    token = ""
    
    try:
        import httpx
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Fetch the home page to extract token
            resp = await client.get(
                "https://mp.weixin.qq.com/cgi-bin/home?t=home/index&lang=zh_CN",
                headers={
                    "Cookie": credentials,
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                    "Referer": "https://mp.weixin.qq.com/",
                },
                follow_redirects=True,
            )
            
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=400, 
                    detail="Cookie 无效或已过期，请重新登录公众号后台"
                )
            
            # Extract token from response
            import re
            html = resp.text
            
            # Try multiple patterns to find token
            patterns = [
                r'token["\s]*[:=]["\s]*["\']?(\d+)["\']?',
                r'token=(\d+)',
                r'"token"\s*:\s*"?(\d+)"?',
            ]
            
            for pattern in patterns:
                match = re.search(pattern, html)
                if match:
                    token = match.group(1)
                    break
            
            if not token:
                # Check if redirected to login page
                if "login" in str(resp.url).lower() or "请登录" in html:
                    raise HTTPException(
                        status_code=400, 
                        detail="Cookie 已过期，请重新登录公众号后台"
                    )
                raise HTTPException(
                    status_code=400, 
                    detail="无法从页面提取 token，请确保已登录公众号后台"
                )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="验证超时，请稍后重试")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to extract token: {e}")
        raise HTTPException(status_code=500, detail=f"验证失败: {str(e)}")
    
    # Test credentials
    provider = WeChatMPProvider(credentials, token)
    result = provider.test_auth()
    
    if not result.ok:
        if result.error_code == WeChatErrorCode.SESSION_EXPIRED:
            raise HTTPException(status_code=400, detail="Cookie 已过期，请重新登录公众号后台")
        raise HTTPException(status_code=400, detail=result.error_message or "认证验证失败")
    
    # Encrypt and save
    conn = _get_user_db_conn(request)
    now = _now_ts()
    
    # WeChat cookies typically last 2-4 hours
    expires_at = now + (2 * 60 * 60)
    
    try:
        encrypted_cookie = encrypt_cookie(credentials)
        
        conn.execute(
            """
            INSERT INTO wechat_mp_auth (user_id, cookie_encrypted, token, created_at, updated_at, expires_at, status)
            VALUES (?, ?, ?, ?, ?, ?, 'valid')
            ON CONFLICT(user_id) DO UPDATE SET
                cookie_encrypted = excluded.cookie_encrypted,
                token = excluded.token,
                updated_at = excluded.updated_at,
                expires_at = excluded.expires_at,
                status = 'valid',
                last_error = NULL
            """,
            (user_id, encrypted_cookie, token, now, now, expires_at)
        )
        conn.commit()
        
        logger.info(f"[Plugin] Saved WeChat auth for user {user_id}")
        return {
            "ok": True, 
            "message": "授权成功，hotnews 将自动抓取您订阅的公众号文章",
            "expires_at": expires_at,
        }
    except Exception as e:
        logger.error(f"Failed to save auth from plugin: {e}")
        raise HTTPException(status_code=500, detail="保存认证信息失败")


@router.post("/auth/test")
async def test_auth(request: Request) -> Dict[str, Any]:
    """
    Test if saved credentials are still valid.
    """
    user = _require_user(request)
    user_id = user["id"]
    conn = _get_user_db_conn(request)
    
    # Get saved credentials
    cur = conn.execute(
        "SELECT cookie_encrypted, token FROM wechat_mp_auth WHERE user_id = ?",
        (user_id,)
    )
    row = cur.fetchone()
    
    if not row:
        return {"ok": False, "valid": False, "error": "未配置认证信息"}
    
    cookie = decrypt_cookie(row[0])
    token = row[1]
    
    if not cookie:
        return {"ok": False, "valid": False, "error": "无法解密 Cookie"}
    
    # Test credentials
    provider = WeChatMPProvider(cookie, token)
    result = provider.test_auth()
    
    # Update status in database
    now = _now_ts()
    if result.ok:
        conn.execute(
            "UPDATE wechat_mp_auth SET status = 'valid', last_error = NULL, updated_at = ? WHERE user_id = ?",
            (now, user_id)
        )
    else:
        status = "expired" if result.error_code == WeChatErrorCode.SESSION_EXPIRED else "invalid"
        conn.execute(
            "UPDATE wechat_mp_auth SET status = ?, last_error = ?, updated_at = ? WHERE user_id = ?",
            (status, result.error_message, now, user_id)
        )
    conn.commit()
    
    return {
        "ok": True,
        "valid": result.ok,
        "error": result.error_message if not result.ok else None,
        "error_code": result.error_code if not result.ok else None,
    }


@router.get("/auth/expiration-warning")
async def get_auth_expiration_warning(request: Request) -> Dict[str, Any]:
    """
    Lightweight endpoint to check if WeChat auth is expiring soon.
    
    Used by homepage to show expiration reminders.
    Returns warning if auth expires within 1 hour or is already expired.
    """
    user = _get_current_user(request)
    if not user or not user.get("id"):
        return {"ok": True, "show_warning": False}
    
    user_id = user["id"]
    conn = _get_user_db_conn(request)
    
    try:
        cur = conn.execute(
            "SELECT status, expires_at FROM wechat_mp_auth WHERE user_id = ?",
            (user_id,)
        )
        row = cur.fetchone()
        
        if not row:
            return {"ok": True, "show_warning": False}
        
        status = str(row[0] or "valid")
        expires_at = int(row[1] or 0) if row[1] else None
        now = _now_ts()
        
        # Check if expired
        if status == "expired" or (expires_at and expires_at < now):
            return {
                "ok": True,
                "show_warning": True,
                "warning_type": "expired",
                "message": "微信公众号认证已过期，请重新配置",
            }
        
        # Check if expiring soon (within 1 hour)
        if expires_at and expires_at - now < 3600:
            remaining_minutes = max(0, (expires_at - now) // 60)
            return {
                "ok": True,
                "show_warning": True,
                "warning_type": "expiring_soon",
                "message": f"微信公众号认证将在 {remaining_minutes} 分钟后过期",
                "remaining_minutes": remaining_minutes,
            }
        
        return {"ok": True, "show_warning": False}
    except Exception as e:
        logger.error(f"Failed to check auth expiration: {e}")
        return {"ok": True, "show_warning": False}


# ========== QR Code Login Endpoints ==========

@router.post("/auth/qr/start")
async def start_qr_login(request: Request) -> Dict[str, Any]:
    """
    开始扫码登录流程，创建登录会话。
    """
    user = _require_user(request)
    user_id = user["id"]
    
    success, message, session_id = start_login_session(user_id)
    
    if not success:
        return {"ok": False, "error": message}
    
    return {"ok": True, "message": message, "session_id": session_id}


@router.get("/auth/qr/image")
async def get_qr_image(request: Request):
    """
    获取二维码图片。
    
    返回 PNG 图片数据。
    """
    user = _require_user(request)
    user_id = user["id"]
    
    success, message, image_bytes = get_qrcode_url(user_id)
    
    if not success or not image_bytes:
        raise HTTPException(status_code=400, detail=message)
    
    return Response(
        content=image_bytes,
        media_type="image/png",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
    )


@router.get("/auth/qr/status")
async def get_qr_status(request: Request) -> Dict[str, Any]:
    """
    检查扫码状态。
    
    前端应该每 2 秒轮询一次。
    
    返回状态：
    - waiting: 等待扫码
    - scanned: 已扫码，等待确认
    - confirmed: 已确认，可以完成登录
    - expired: 二维码已过期
    - error: 出错
    """
    user = _require_user(request)
    user_id = user["id"]
    
    result = check_scan_status(user_id)
    return result


@router.post("/auth/qr/complete")
async def complete_qr_login(request: Request) -> Dict[str, Any]:
    """
    完成扫码登录，保存认证信息。
    
    在扫码状态变为 confirmed 后调用。
    """
    user = _require_user(request)
    user_id = user["id"]
    conn = _get_user_db_conn(request)
    
    success, message, cookie, token = complete_login(user_id)
    
    if not success or not cookie or not token:
        return {"ok": False, "error": message}
    
    # 验证获取的凭证是否有效
    provider = WeChatMPProvider(cookie, token)
    test_result = provider.test_auth()
    
    if not test_result.ok:
        return {"ok": False, "error": f"认证验证失败: {test_result.error_message}"}
    
    # 保存到数据库
    now = _now_ts()
    expires_at = now + (2 * 60 * 60)  # 2 小时后过期
    
    try:
        encrypted_cookie = encrypt_cookie(cookie)
        
        conn.execute(
            """
            INSERT INTO wechat_mp_auth (user_id, cookie_encrypted, token, created_at, updated_at, expires_at, status)
            VALUES (?, ?, ?, ?, ?, ?, 'valid')
            ON CONFLICT(user_id) DO UPDATE SET
                cookie_encrypted = excluded.cookie_encrypted,
                token = excluded.token,
                updated_at = excluded.updated_at,
                expires_at = excluded.expires_at,
                status = 'valid',
                last_error = NULL
            """,
            (user_id, encrypted_cookie, token, now, now, expires_at)
        )
        conn.commit()
        
        logger.info(f"[QRLogin] Saved auth for user {user_id}")
        return {"ok": True, "message": "登录成功", "expires_at": expires_at}
    except Exception as e:
        logger.error(f"[QRLogin] Failed to save auth: {e}")
        return {"ok": False, "error": f"保存认证信息失败: {e}"}


@router.post("/auth/qr/cancel")
async def cancel_qr_login(request: Request) -> Dict[str, Any]:
    """
    取消扫码登录。
    """
    user = _require_user(request)
    user_id = user["id"]
    
    cancel_login(user_id)
    return {"ok": True, "message": "已取消"}


# ========== Auto Auth Endpoint (简化用户体验) ==========

@router.post("/auth/auto")
async def auto_acquire_auth(request: Request) -> Dict[str, Any]:
    """
    自动获取公众号凭证（简化用户体验）
    
    逻辑：
    1. 检查用户自己是否有有效凭证 → 有则直接返回成功
    2. 没有则自动尝试从共享池获取 → 成功则保存到用户账号
    3. 共享池也没有 → 返回需要扫码
    
    前端只需要调用这一个接口，根据返回决定是否显示二维码。
    """
    user = _require_user(request)
    user_id = user["id"]
    conn = _get_user_db_conn(request)
    now = _now_ts()
    
    # Step 1: 检查用户自己的凭证
    cur = conn.execute(
        "SELECT cookie_encrypted, token, status, expires_at FROM wechat_mp_auth WHERE user_id = ?",
        (user_id,)
    )
    row = cur.fetchone()
    
    if row:
        cookie_encrypted, token, status, expires_at = row
        # 检查是否有效
        if status == "valid" and expires_at and expires_at > now:
            cookie = decrypt_cookie(cookie_encrypted)
            if cookie and token:
                # 验证凭证是否真的有效
                provider = WeChatMPProvider(cookie, token)
                test_result = provider.test_auth()
                
                if test_result.ok:
                    remaining_minutes = (expires_at - now) // 60
                    return {
                        "ok": True,
                        "has_auth": True,
                        "source": "user",
                        "expires_at": expires_at,
                        "remaining_minutes": remaining_minutes,
                    }
                else:
                    # 凭证失效，更新状态
                    conn.execute(
                        "UPDATE wechat_mp_auth SET status = 'expired', last_error = ? WHERE user_id = ?",
                        (test_result.error_message, user_id)
                    )
                    conn.commit()
    
    # Step 2: 尝试从共享池获取
    from hotnews.kernel.services.wechat_shared_credentials import (
        get_available_credential,
        mark_credential_used,
    )
    
    cred = get_available_credential()
    
    if cred:
        # 验证共享凭证
        provider = WeChatMPProvider(cred.cookie, cred.token)
        test_result = provider.test_auth()
        
        if test_result.ok:
            # 保存到用户账号
            try:
                encrypted_cookie = encrypt_cookie(cred.cookie)
                
                conn.execute(
                    """
                    INSERT INTO wechat_mp_auth (user_id, cookie_encrypted, token, created_at, updated_at, expires_at, status)
                    VALUES (?, ?, ?, ?, ?, ?, 'valid')
                    ON CONFLICT(user_id) DO UPDATE SET
                        cookie_encrypted = excluded.cookie_encrypted,
                        token = excluded.token,
                        updated_at = excluded.updated_at,
                        expires_at = excluded.expires_at,
                        status = 'valid',
                        last_error = NULL
                    """,
                    (user_id, encrypted_cookie, cred.token, now, now, cred.expires_at)
                )
                conn.commit()
                
                mark_credential_used(cred.id, success=True)
                
                remaining_minutes = max(0, (cred.expires_at - now) // 60)
                logger.info(f"[AutoAuth] User {user_id} acquired shared credential #{cred.id}")
                
                return {
                    "ok": True,
                    "has_auth": True,
                    "source": "shared",
                    "expires_at": cred.expires_at,
                    "remaining_minutes": remaining_minutes,
                }
            except Exception as e:
                logger.error(f"[AutoAuth] Failed to save shared credential: {e}")
                mark_credential_used(cred.id, success=False, error=str(e))
        else:
            # 共享凭证失效
            mark_credential_used(cred.id, success=False, error=test_result.error_message)
    
    # Step 3: 没有可用凭证，需要扫码
    return {
        "ok": True,
        "has_auth": False,
        "need_scan": True,
        "message": "请扫码登录公众号后台",
    }


# ========== Search Endpoint ==========

@router.get("/search")
async def search_mp(
    request: Request,
    keyword: str = Query(..., min_length=2, description="搜索关键词"),
    limit: int = Query(10, ge=1, le=20, description="返回数量"),
) -> Dict[str, Any]:
    """
    Search for official accounts by keyword.
    """
    user = _require_user(request)
    user_id = user["id"]
    conn = _get_user_db_conn(request)
    
    # Get credentials
    cur = conn.execute(
        "SELECT cookie_encrypted, token, status FROM wechat_mp_auth WHERE user_id = ?",
        (user_id,)
    )
    row = cur.fetchone()
    
    if not row:
        raise HTTPException(status_code=400, detail="请先配置认证信息")
    
    if row[2] == "expired":
        raise HTTPException(status_code=400, detail="认证已过期，请更新认证信息")
    
    cookie = decrypt_cookie(row[0])
    token = row[1]
    
    if not cookie:
        raise HTTPException(status_code=500, detail="无法解密 Cookie")
    
    # Search
    provider = WeChatMPProvider(cookie, token)
    result = provider.search_mp(keyword, limit=limit)
    
    if not result.ok:
        # Update auth status if expired
        if result.error_code == WeChatErrorCode.SESSION_EXPIRED:
            conn.execute(
                "UPDATE wechat_mp_auth SET status = 'expired', last_error = ? WHERE user_id = ?",
                (result.error_message, user_id)
            )
            conn.commit()
        
        return {
            "ok": False,
            "error": result.error_message,
            "error_code": result.error_code,
            "list": [],
        }
    
    # Get user's subscriptions to mark subscribed accounts
    sub_cur = conn.execute(
        "SELECT fakeid FROM wechat_mp_subscriptions WHERE user_id = ?",
        (user_id,)
    )
    subscribed_fakeids = {str(r[0]) for r in sub_cur.fetchall()}
    
    # Format response
    accounts = []
    for acc in result.accounts:
        accounts.append({
            "fakeid": acc.fakeid,
            "nickname": acc.nickname,
            "round_head_img": acc.round_head_img,
            "signature": acc.signature,
            "is_subscribed": acc.fakeid in subscribed_fakeids,
        })
    
    return {
        "ok": True,
        "list": accounts,
        "total": result.total,
    }


# ========== Subscription Endpoints ==========

@router.get("/subscriptions")
async def get_subscriptions(request: Request) -> Dict[str, Any]:
    """
    Get user's subscribed official accounts.
    """
    user = _require_user(request)
    user_id = user["id"]
    conn = _get_user_db_conn(request)
    
    cur = conn.execute(
        """
        SELECT fakeid, nickname, round_head_img, signature, subscribed_at
        FROM wechat_mp_subscriptions
        WHERE user_id = ?
        ORDER BY subscribed_at DESC
        """,
        (user_id,)
    )
    rows = cur.fetchall() or []
    
    subscriptions = []
    for r in rows:
        subscriptions.append({
            "fakeid": r[0],
            "nickname": r[1],
            "round_head_img": r[2] or "",
            "signature": r[3] or "",
            "subscribed_at": r[4],
        })
    
    return {"ok": True, "subscriptions": subscriptions}


@router.post("/subscribe")
async def subscribe(request: Request, body: SubscribeRequest) -> Dict[str, Any]:
    """
    Subscribe to an official account and fetch its articles.
    """
    user = _require_user(request)
    user_id = user["id"]
    user_conn = _get_user_db_conn(request)
    online_conn = _get_online_db_conn(request)
    
    fakeid = (body.fakeid or "").strip()
    nickname = (body.nickname or "").strip()
    
    if not fakeid or not nickname:
        raise HTTPException(status_code=400, detail="fakeid 和 nickname 不能为空")
    
    now = _now_ts()
    
    try:
        # Save subscription
        user_conn.execute(
            """
            INSERT INTO wechat_mp_subscriptions (user_id, fakeid, nickname, round_head_img, signature, subscribed_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, fakeid) DO UPDATE SET
                nickname = excluded.nickname,
                round_head_img = excluded.round_head_img,
                signature = excluded.signature
            """,
            (user_id, fakeid, nickname, body.round_head_img or "", body.signature or "", now)
        )
        user_conn.commit()
        
        # Fetch articles for this MP immediately
        articles_fetched = 0
        try:
            # Get user's auth credentials
            cur = user_conn.execute(
                "SELECT cookie_encrypted, token FROM wechat_mp_auth WHERE user_id = ? AND status = 'valid'",
                (user_id,)
            )
            auth_row = cur.fetchone()
            
            if auth_row:
                cookie = decrypt_cookie(auth_row[0])
                token = auth_row[1]
                
                if cookie and token:
                    provider = WeChatMPProvider(cookie, token)
                    result = provider.get_articles(fakeid, 20)
                    
                    if result.ok:
                        for art in result.articles:
                            if not art.url:
                                continue
                            
                            dedup_key = generate_dedup_key(art.url)
                            
                            try:
                                online_conn.execute(
                                    """
                                    INSERT OR IGNORE INTO wechat_mp_articles
                                    (fakeid, dedup_key, title, url, digest, cover_url, publish_time, fetched_at, mp_nickname)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                                    """,
                                    (
                                        fakeid,
                                        dedup_key,
                                        art.title,
                                        art.url,
                                        art.digest or "",
                                        art.cover_url or "",
                                        art.publish_time or now,
                                        now,
                                        nickname,
                                    )
                                )
                                if online_conn.total_changes > 0:
                                    articles_fetched += 1
                            except Exception as e:
                                logger.warning(f"Failed to store article: {e}")
                        
                        online_conn.commit()
                        logger.info(f"[WeChat] Fetched {articles_fetched} articles for {nickname} on subscribe")
        except Exception as e:
            logger.warning(f"[WeChat] Failed to fetch articles on subscribe: {e}")
        
        message = f"已订阅 {nickname}"
        if articles_fetched > 0:
            message += f"，获取了 {articles_fetched} 篇文章"
        
        return {"ok": True, "message": message, "articles_fetched": articles_fetched}
    except Exception as e:
        logger.error(f"Failed to subscribe: {e}")
        raise HTTPException(status_code=500, detail="订阅失败")


@router.post("/unsubscribe")
async def unsubscribe(request: Request, body: UnsubscribeRequest) -> Dict[str, Any]:
    """
    Unsubscribe from an official account.
    """
    user = _require_user(request)
    user_id = user["id"]
    conn = _get_user_db_conn(request)
    
    fakeid = (body.fakeid or "").strip()
    if not fakeid:
        raise HTTPException(status_code=400, detail="fakeid 不能为空")
    
    try:
        conn.execute(
            "DELETE FROM wechat_mp_subscriptions WHERE user_id = ? AND fakeid = ?",
            (user_id, fakeid)
        )
        conn.commit()
        
        return {"ok": True, "message": "已取消订阅"}
    except Exception as e:
        logger.error(f"Failed to unsubscribe: {e}")
        raise HTTPException(status_code=500, detail="取消订阅失败")


# ========== Articles Endpoint ==========

@router.get("/articles")
async def get_articles(
    request: Request,
    limit: int = Query(50, ge=1, le=200, description="返回数量"),
    offset: int = Query(0, ge=0, description="偏移量"),
) -> Dict[str, Any]:
    """
    Get articles from user's subscribed official accounts.
    """
    user = _require_user(request)
    user_id = user["id"]
    user_conn = _get_user_db_conn(request)
    online_conn = _get_online_db_conn(request)
    
    # Get user's subscriptions
    sub_cur = user_conn.execute(
        "SELECT fakeid, nickname FROM wechat_mp_subscriptions WHERE user_id = ?",
        (user_id,)
    )
    subscriptions = {r[0]: r[1] for r in sub_cur.fetchall()}
    
    if not subscriptions:
        return {"ok": True, "articles": [], "total": 0}
    
    # Query articles from cache
    fakeids = list(subscriptions.keys())
    placeholders = ",".join(["?"] * len(fakeids))
    
    cur = online_conn.execute(
        f"""
        SELECT id, fakeid, title, url, digest, cover_url, publish_time, mp_nickname
        FROM wechat_mp_articles
        WHERE fakeid IN ({placeholders})
        ORDER BY publish_time DESC
        LIMIT ? OFFSET ?
        """,
        (*fakeids, limit, offset)
    )
    rows = cur.fetchall() or []
    
    articles = []
    for r in rows:
        articles.append({
            "id": r[0],
            "fakeid": r[1],
            "mp_name": r[7] or subscriptions.get(r[1], ""),
            "title": r[2],
            "url": r[3],
            "digest": r[4] or "",
            "cover_url": r[5] or "",
            "publish_time": r[6],
            "source_type": "wechat",
        })
    
    # Get total count
    count_cur = online_conn.execute(
        f"SELECT COUNT(*) FROM wechat_mp_articles WHERE fakeid IN ({placeholders})",
        fakeids
    )
    total = count_cur.fetchone()[0] or 0
    
    return {"ok": True, "articles": articles, "total": total}


@router.post("/refresh")
async def refresh_articles(request: Request) -> Dict[str, Any]:
    """
    Manually trigger article refresh for user's subscriptions.
    
    Fetches latest articles from all subscribed official accounts.
    """
    user = _require_user(request)
    user_id = user["id"]
    user_conn = _get_user_db_conn(request)
    online_conn = _get_online_db_conn(request)
    
    # Get user's auth credentials
    cur = user_conn.execute(
        "SELECT cookie_encrypted, token, status FROM wechat_mp_auth WHERE user_id = ?",
        (user_id,)
    )
    row = cur.fetchone()
    
    if not row:
        return {"ok": False, "error": "请先配置认证信息"}
    
    if row[2] == "expired":
        return {"ok": False, "error": "认证已过期，请重新配置"}
    
    cookie = decrypt_cookie(row[0])
    token = row[1]
    
    if not cookie:
        return {"ok": False, "error": "无法解密 Cookie"}
    
    # Get user's subscriptions
    sub_cur = user_conn.execute(
        "SELECT fakeid, nickname FROM wechat_mp_subscriptions WHERE user_id = ?",
        (user_id,)
    )
    subscriptions = sub_cur.fetchall() or []
    
    if not subscriptions:
        return {"ok": False, "error": "没有订阅任何公众号"}
    
    # Fetch articles for each subscription
    provider = WeChatMPProvider(cookie, token)
    total_new = 0
    errors = []
    now = _now_ts()
    
    for fakeid, nickname in subscriptions:
        try:
            result = provider.get_articles(fakeid, 20)
            
            if not result.ok:
                if result.error_code == WeChatErrorCode.SESSION_EXPIRED:
                    # Mark auth as expired
                    user_conn.execute(
                        "UPDATE wechat_mp_auth SET status = 'expired', last_error = ? WHERE user_id = ?",
                        (result.error_message, user_id)
                    )
                    user_conn.commit()
                    return {"ok": False, "error": "认证已过期，请重新配置"}
                errors.append(f"{nickname}: {result.error_message}")
                continue
            
            # Store articles
            new_count = 0
            for art in result.articles:
                if not art.url:
                    continue
                
                dedup_key = generate_dedup_key(art.url)
                
                try:
                    online_conn.execute(
                        """
                        INSERT OR IGNORE INTO wechat_mp_articles
                        (fakeid, dedup_key, title, url, digest, cover_url, publish_time, fetched_at, mp_nickname)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            fakeid,
                            dedup_key,
                            art.title,
                            art.url,
                            art.digest or "",
                            art.cover_url or "",
                            art.publish_time or now,
                            now,
                            nickname,
                        )
                    )
                    if online_conn.total_changes > 0:
                        new_count += 1
                except Exception as e:
                    logger.warning(f"Failed to store article: {e}")
            
            total_new += new_count
            logger.info(f"[WeChat] Fetched {len(result.articles)} articles for {nickname}, {new_count} new")
            
            # Small delay between requests to avoid rate limiting
            import time as time_module
            time_module.sleep(0.5)
            
        except Exception as e:
            logger.error(f"[WeChat] Error fetching {nickname}: {e}")
            errors.append(f"{nickname}: {str(e)}")
    
    online_conn.commit()
    
    message = f"已获取 {total_new} 篇新文章"
    if errors:
        message += f"，{len(errors)} 个公众号获取失败"
    
    return {
        "ok": True,
        "message": message,
        "new_articles": total_new,
        "errors": errors if errors else None,
    }


# ========== Image Proxy Endpoint ==========

# Simple in-memory cache for proxied images
_image_cache: Dict[str, tuple] = {}  # url -> (content, content_type, timestamp)
_IMAGE_CACHE_TTL = 3600  # 1 hour

@router.get("/img-proxy")
async def proxy_wechat_image(
    url: str = Query(..., description="WeChat image URL to proxy"),
) -> Response:
    """
    Proxy WeChat images to bypass referer restrictions.
    
    WeChat images (mmbiz.qpic.cn) require proper referer headers,
    which browsers won't send for cross-origin requests.
    This endpoint fetches the image server-side and returns it.
    """
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    
    # Validate URL - only allow WeChat image domains
    allowed_domains = ["mmbiz.qpic.cn", "mmbiz.qlogo.cn", "wx.qlogo.cn"]
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        if parsed.hostname not in allowed_domains:
            raise HTTPException(status_code=400, detail="Only WeChat image URLs are allowed")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid URL")
    
    # Check cache
    now = _now_ts()
    if url in _image_cache:
        content, content_type, cached_at = _image_cache[url]
        if now - cached_at < _IMAGE_CACHE_TTL:
            return Response(
                content=content,
                media_type=content_type,
                headers={
                    "Cache-Control": "public, max-age=3600",
                    "Access-Control-Allow-Origin": "*",
                },
            )
    
    # Fetch image
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                url,
                headers={
                    "Referer": "https://mp.weixin.qq.com/",
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                },
                follow_redirects=True,
            )
            
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail="Failed to fetch image")
            
            content = resp.content
            content_type = resp.headers.get("content-type", "image/jpeg")
            
            # Cache the result
            _image_cache[url] = (content, content_type, now)
            
            # Clean old cache entries (simple cleanup)
            if len(_image_cache) > 1000:
                old_keys = [k for k, v in _image_cache.items() if now - v[2] > _IMAGE_CACHE_TTL]
                for k in old_keys:
                    del _image_cache[k]
            
            return Response(
                content=content,
                media_type=content_type,
                headers={
                    "Cache-Control": "public, max-age=3600",
                    "Access-Control-Allow-Origin": "*",
                },
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Image fetch timeout")
    except Exception as e:
        logger.error(f"Failed to proxy image: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch image")


# ========== Helper Function for QR Login ==========

def save_wechat_credentials(conn, user_id: int, cookie_str: str) -> bool:
    """
    Save WeChat MP credentials for a user.
    
    This is called after QR login to save the obtained credentials.
    
    Args:
        conn: Database connection
        user_id: User ID
        cookie_str: Cookie string from WeChat MP login
        
    Returns:
        True if saved successfully, False otherwise
    """
    if not cookie_str:
        return False
    
    now = _now_ts()
    expires_at = now + (2 * 60 * 60)  # 2 hours
    
    try:
        encrypted_cookie = encrypt_cookie(cookie_str)
        
        # We don't have the token yet, but we can extract it later
        # For now, save with empty token - it will be fetched on first use
        conn.execute(
            """
            INSERT INTO wechat_mp_auth (user_id, cookie_encrypted, token, created_at, updated_at, expires_at, status)
            VALUES (?, ?, '', ?, ?, ?, 'valid')
            ON CONFLICT(user_id) DO UPDATE SET
                cookie_encrypted = excluded.cookie_encrypted,
                updated_at = excluded.updated_at,
                expires_at = excluded.expires_at,
                status = 'valid',
                last_error = NULL
            """,
            (user_id, encrypted_cookie, now, now, expires_at)
        )
        conn.commit()
        
        logger.info(f"[QRLogin] Saved WeChat credentials for user {user_id}")
        return True
    except Exception as e:
        logger.error(f"[QRLogin] Failed to save credentials: {e}")
        return False

# ========== Shared Credentials Pool API ==========

@router.get("/shared/status")
async def get_shared_pool_status(request: Request) -> Dict[str, Any]:
    """
    获取共享凭证池状态
    
    任何登录用户都可以查看（不显示敏感信息）
    """
    user = _get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="请先登录")
    
    from hotnews.kernel.services.wechat_shared_credentials import get_pool_status
    
    status = get_pool_status()
    return {
        "ok": True,
        "pool": status,
    }


@router.post("/shared/contribute")
async def contribute_to_shared_pool(request: Request) -> Dict[str, Any]:
    """
    贡献凭证到共享池
    
    用户扫码登录后，可以选择将凭证贡献到共享池，
    让其他用户也能使用。
    """
    user = _require_user(request)
    user_id = user["id"]
    conn = _get_user_db_conn(request)
    
    # 获取用户的凭证
    cur = conn.execute(
        "SELECT cookie_encrypted, token, expires_at FROM wechat_mp_auth WHERE user_id = ? AND status = 'valid'",
        (user_id,)
    )
    row = cur.fetchone()
    
    if not row:
        return {"ok": False, "error": "您还没有有效的公众号凭证，请先扫码登录"}
    
    cookie_encrypted, token, expires_at = row
    cookie = decrypt_cookie(cookie_encrypted)
    
    if not cookie or not token:
        return {"ok": False, "error": "凭证无效"}
    
    # 检查是否已过期
    now = _now_ts()
    if expires_at and expires_at < now:
        return {"ok": False, "error": "凭证已过期，请重新扫码"}
    
    # 添加到共享池
    from hotnews.kernel.services.wechat_shared_credentials import add_shared_credential
    
    expires_in = max(0, expires_at - now) if expires_at else 7200
    success, message, cred_id = add_shared_credential(
        cookie=cookie,
        token=token,
        contributed_by=user_id,
        expires_in=expires_in,
    )
    
    if success:
        logger.info(f"[SharedCred] User {user_id} contributed credential #{cred_id}")
        return {
            "ok": True,
            "message": "感谢您的贡献！其他用户现在可以使用共享凭证了",
            "credential_id": cred_id,
        }
    else:
        return {"ok": False, "error": message}


@router.get("/shared/available")
async def check_shared_available(request: Request) -> Dict[str, Any]:
    """
    检查是否有可用的共享凭证
    
    用于前端判断是否显示"使用共享凭证"选项
    """
    from hotnews.kernel.services.wechat_shared_credentials import get_pool_status
    
    status = get_pool_status()
    return {
        "ok": True,
        "available": status["valid"] > 0,
        "count": status["valid"],
    }


@router.post("/shared/use")
async def use_shared_credential(request: Request) -> Dict[str, Any]:
    """
    使用共享凭证
    
    从共享池获取一个可用凭证，保存到用户自己的账号下。
    这样用户就可以使用共享凭证来抓取文章了。
    """
    user = _require_user(request)
    user_id = user["id"]
    conn = _get_user_db_conn(request)
    
    from hotnews.kernel.services.wechat_shared_credentials import (
        get_available_credential,
        mark_credential_used,
    )
    
    # 获取可用凭证
    cred = get_available_credential()
    
    if not cred:
        return {
            "ok": False,
            "error": "当前没有可用的共享凭证，请等待其他用户贡献或自行扫码登录",
        }
    
    # 验证凭证是否有效
    provider = WeChatMPProvider(cred.cookie, cred.token)
    test_result = provider.test_auth()
    
    if not test_result.ok:
        # 标记凭证失效
        mark_credential_used(cred.id, success=False, error=test_result.error_message)
        return {
            "ok": False,
            "error": "共享凭证已失效，请稍后重试或自行扫码登录",
        }
    
    # 保存到用户账号
    now = _now_ts()
    expires_at = cred.expires_at
    
    try:
        encrypted_cookie = encrypt_cookie(cred.cookie)
        
        conn.execute(
            """
            INSERT INTO wechat_mp_auth (user_id, cookie_encrypted, token, created_at, updated_at, expires_at, status)
            VALUES (?, ?, ?, ?, ?, ?, 'valid')
            ON CONFLICT(user_id) DO UPDATE SET
                cookie_encrypted = excluded.cookie_encrypted,
                token = excluded.token,
                updated_at = excluded.updated_at,
                expires_at = excluded.expires_at,
                status = 'valid',
                last_error = NULL
            """,
            (user_id, encrypted_cookie, cred.token, now, now, expires_at)
        )
        conn.commit()
        
        # 标记凭证使用成功
        mark_credential_used(cred.id, success=True)
        
        logger.info(f"[SharedCred] User {user_id} using shared credential #{cred.id}")
        
        remaining_minutes = max(0, (expires_at - now) // 60)
        return {
            "ok": True,
            "message": f"已启用共享凭证，有效期约 {remaining_minutes} 分钟",
            "expires_at": expires_at,
        }
    except Exception as e:
        logger.error(f"[SharedCred] Failed to save for user {user_id}: {e}")
        return {"ok": False, "error": "保存凭证失败"}


# ========== QR Login with Auto-Contribute ==========

@router.post("/auth/qr/complete-and-share")
async def complete_qr_login_and_share(request: Request) -> Dict[str, Any]:
    """
    完成扫码登录并自动贡献到共享池
    
    这是推荐的登录方式：
    1. 用户扫码登录
    2. 凭证保存到用户账号
    3. 同时贡献到共享池，让其他用户也能用
    """
    user = _require_user(request)
    user_id = user["id"]
    conn = _get_user_db_conn(request)
    
    # 完成登录
    success, message, cookie, token = complete_login(user_id)
    
    if not success or not cookie or not token:
        return {"ok": False, "error": message}
    
    # 验证凭证
    provider = WeChatMPProvider(cookie, token)
    test_result = provider.test_auth()
    
    if not test_result.ok:
        return {"ok": False, "error": f"认证验证失败: {test_result.error_message}"}
    
    # 保存到用户账号
    now = _now_ts()
    expires_at = now + (2 * 60 * 60)  # 2 小时
    
    try:
        encrypted_cookie = encrypt_cookie(cookie)
        
        conn.execute(
            """
            INSERT INTO wechat_mp_auth (user_id, cookie_encrypted, token, created_at, updated_at, expires_at, status)
            VALUES (?, ?, ?, ?, ?, ?, 'valid')
            ON CONFLICT(user_id) DO UPDATE SET
                cookie_encrypted = excluded.cookie_encrypted,
                token = excluded.token,
                updated_at = excluded.updated_at,
                expires_at = excluded.expires_at,
                status = 'valid',
                last_error = NULL
            """,
            (user_id, encrypted_cookie, token, now, now, expires_at)
        )
        conn.commit()
    except Exception as e:
        logger.error(f"[QRLogin] Failed to save auth: {e}")
        return {"ok": False, "error": f"保存认证信息失败: {e}"}
    
    # 自动贡献到共享池
    from hotnews.kernel.services.wechat_shared_credentials import add_shared_credential
    
    add_shared_credential(
        cookie=cookie,
        token=token,
        contributed_by=user_id,
        expires_in=2 * 60 * 60,
    )
    
    logger.info(f"[QRLogin] User {user_id} logged in and contributed to shared pool")
    
    return {
        "ok": True,
        "message": "登录成功！您的凭证已贡献到共享池，感谢您的支持",
        "expires_at": expires_at,
        "shared": True,
    }
