# coding=utf-8
"""
User Authentication API Routes

Provides REST API endpoints for:
- Email/password registration and login
- Session management (logout)
- OAuth callbacks (GitHub, Google)
- Password reset
- User profile
"""

import json
import os
import time
from typing import Optional

from fastapi import APIRouter, Request, HTTPException, Body, Response
from fastapi.responses import RedirectResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _get_user_db_conn(request: Request):
    from hotnews.web.user_db import get_user_db_conn
    return get_user_db_conn(request.app.state.project_root)


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else ""


def _get_device_info(request: Request) -> str:
    return request.headers.get("User-Agent", "")[:200]


# ==================== Session Cookie Helpers ====================

SESSION_COOKIE_NAME = "hotnews_session"
SESSION_COOKIE_MAX_AGE = 30 * 24 * 3600  # 30 days


def _set_session_cookie(response: Response, session_token: str, request: Request = None) -> None:
    # Auto-detect secure based on X-Forwarded-Proto header or environment variable
    is_secure = os.environ.get("HOTNEWS_SECURE_COOKIES", "0") == "1"
    if request:
        # Check if request came over HTTPS (via reverse proxy)
        forwarded_proto = request.headers.get("X-Forwarded-Proto", "").lower()
        if forwarded_proto == "https":
            is_secure = True
    
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_token,
        max_age=SESSION_COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=is_secure,
        path="/",  # Ensure cookie is available site-wide
    )


def _clear_session_cookie(response: Response, request: Request = None) -> None:
    # When clearing a cookie, we need to use the same attributes (especially secure/samesite)
    is_secure = os.environ.get("HOTNEWS_SECURE_COOKIES", "0") == "1"
    if request:
        forwarded_proto = request.headers.get("X-Forwarded-Proto", "").lower()
        if forwarded_proto == "https":
            is_secure = True
    
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        samesite="lax",
        secure=is_secure,
        path="/",  # Must match the path used when setting
    )


def _get_session_token(request: Request) -> Optional[str]:
    return request.cookies.get(SESSION_COOKIE_NAME)


# ==================== Passwordless Login (Email Code) ====================

@router.post("/send-code")
async def send_verification_code(
    request: Request,
    email: str = Body(..., embed=True),
):
    """Send a verification code to the email for passwordless login."""
    from hotnews.kernel.services.email_code_service import send_verification_code as do_send_code
    
    ip_address = _get_client_ip(request)
    project_root = str(request.app.state.project_root)
    
    success, message = do_send_code(project_root, email, ip_address)
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"ok": True, "message": message}


@router.post("/verify-code")
async def verify_code_and_login(
    request: Request,
    email: str = Body(..., embed=True),
    code: str = Body(..., embed=True),
):
    """Verify the code and login (auto-register if new user)."""
    from hotnews.kernel.services.email_code_service import verify_code
    from hotnews.kernel.auth.auth_service import passwordless_login_or_register
    
    project_root = str(request.app.state.project_root)
    
    # Verify the code first
    success, message = verify_code(project_root, email, code)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    # Login or register
    conn = _get_user_db_conn(request)
    device_info = _get_device_info(request)
    ip_address = _get_client_ip(request)
    
    success, message, session_token, user_info = passwordless_login_or_register(
        conn, email, device_info, ip_address
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    response = Response(
        content=json.dumps({"ok": True, "message": message, "user": user_info}),
        media_type="application/json"
    )
    _set_session_cookie(response, session_token, request)
    return response


# ==================== Registration (Legacy - Password) ====================

@router.post("/register")
async def register(
    request: Request,
    email: str = Body(...),
    password: str = Body(...),
    nickname: str = Body(""),
):
    """Register a new user with email and password."""
    from hotnews.kernel.auth.auth_service import register_user_with_email
    
    conn = _get_user_db_conn(request)
    success, message, user_id = register_user_with_email(conn, email, password, nickname)
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    # Send welcome email (async, don't block registration)
    try:
        from hotnews.kernel.services.email_service import send_welcome_email
        send_welcome_email(email, nickname)
    except Exception as e:
        print(f"[AUTH] Failed to send welcome email: {e}")
    
    return {"ok": True, "message": message, "user_id": user_id}


# ==================== Login ====================

@router.post("/login")
async def login(
    request: Request,
    email: str = Body(...),
    password: str = Body(...),
):
    """Login with email and password."""
    from hotnews.kernel.auth.auth_service import login_with_email
    
    conn = _get_user_db_conn(request)
    device_info = _get_device_info(request)
    ip_address = _get_client_ip(request)
    
    success, message, session_token, user_info = login_with_email(
        conn, email, password, device_info, ip_address
    )
    
    if not success:
        raise HTTPException(status_code=401, detail=message)
    
    response = Response(
        content=json.dumps({"ok": True, "message": message, "user": user_info}),
        media_type="application/json"
    )
    _set_session_cookie(response, session_token, request)
    return response


# ==================== Session & Logout ====================

@router.get("/me")
async def get_current_user(request: Request):
    """Get current authenticated user info."""
    try:
        from hotnews.kernel.auth.auth_service import validate_session
        
        session_token = _get_session_token(request)
        if not session_token:
            return {"ok": False, "user": None}
        
        conn = _get_user_db_conn(request)
        is_valid, user_info = validate_session(conn, session_token)
        
        if not is_valid:
            return {"ok": False, "user": None}
        
        return {"ok": True, "user": user_info}
    except Exception as e:
        # Log error but return a valid response
        print(f"[AUTH] Error in /me endpoint: {e}")
        import traceback
        traceback.print_exc()
        return {"ok": False, "user": None, "error": str(e)}


@router.get("/token")
async def get_session_token(request: Request):
    """
    Get current session token for use in browser plugins.
    
    This endpoint allows browser plugins to obtain the session token
    for making authenticated API calls.
    
    Returns the session token if the user is authenticated via cookie.
    """
    session_token = _get_session_token(request)
    if not session_token:
        return {"ok": False, "token": None, "error": "Not authenticated"}
    
    from hotnews.kernel.auth.auth_service import validate_session
    conn = _get_user_db_conn(request)
    is_valid, user_info = validate_session(conn, session_token)
    
    if not is_valid:
        return {"ok": False, "token": None, "error": "Session expired"}
    
    return {
        "ok": True, 
        "token": session_token,
        "user": user_info,
    }


@router.post("/logout")
async def logout(request: Request):
    """Logout current session."""
    from hotnews.kernel.auth.auth_service import logout_session
    
    session_token = _get_session_token(request)
    if session_token:
        conn = _get_user_db_conn(request)
        logout_session(conn, session_token)
    
    response = Response(
        content=json.dumps({"ok": True, "message": "Logged out"}),
        media_type="application/json"
    )
    _clear_session_cookie(response, request)
    return response


# ==================== Password Reset ====================

@router.post("/forgot-password")
async def forgot_password(
    request: Request,
    email: str = Body(...),
):
    """Request a password reset email."""
    from hotnews.kernel.auth.auth_service import create_password_reset_token
    
    conn = _get_user_db_conn(request)
    success, message, token = create_password_reset_token(conn, email)
    
    if token:
        # Send password reset email
        try:
            from hotnews.kernel.services.email_service import send_password_reset_email
            base_url = os.environ.get("HOTNEWS_BASE_URL", "")
            if not base_url:
                base_url = _get_base_url(request)
            send_password_reset_email(email, token, base_url)
            print(f"[AUTH] Password reset email sent to {email}")
        except Exception as e:
            print(f"[AUTH] Failed to send password reset email: {e}")
    
    return {"ok": True, "message": "If the email exists, a reset link will be sent"}


@router.post("/reset-password")
async def reset_password(
    request: Request,
    token: str = Body(...),
    new_password: str = Body(...),
):
    """Reset password using reset token."""
    from hotnews.kernel.auth.auth_service import reset_password_with_token
    
    conn = _get_user_db_conn(request)
    success, message = reset_password_with_token(conn, token, new_password)
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"ok": True, "message": message}


# ==================== OAuth Endpoints ====================

# Base URL for OAuth callbacks (set this to your external domain, e.g., https://hot.uihash.com)
HOTNEWS_BASE_URL = os.environ.get("HOTNEWS_BASE_URL", "").rstrip("/")

def _get_base_url(request: Request) -> str:
    """Get the base URL for OAuth callbacks."""
    if HOTNEWS_BASE_URL:
        return HOTNEWS_BASE_URL
    # Fallback to request base_url (may not work behind reverse proxy)
    return str(request.base_url).rstrip("/")

# GitHub OAuth
GITHUB_CLIENT_ID = os.environ.get("GITHUB_OAUTH_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.environ.get("GITHUB_OAUTH_CLIENT_SECRET", "")

@router.get("/oauth/github")
async def github_oauth_start(request: Request):
    """Start GitHub OAuth flow."""
    if not GITHUB_CLIENT_ID:
        raise HTTPException(status_code=501, detail="GitHub OAuth not configured")
    
    redirect_uri = _get_base_url(request) + "/api/auth/oauth/github/callback"
    oauth_url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={GITHUB_CLIENT_ID}"
        f"&redirect_uri={redirect_uri}"
        f"&scope=read:user user:email"
    )
    return RedirectResponse(url=oauth_url)


@router.get("/oauth/github/callback")
async def github_oauth_callback(request: Request, code: str = ""):
    """Handle GitHub OAuth callback."""
    import httpx
    from hotnews.kernel.auth.auth_service import oauth_login_or_register
    
    if not code or not GITHUB_CLIENT_ID or not GITHUB_CLIENT_SECRET:
        raise HTTPException(status_code=400, detail="Invalid OAuth callback")
    
    # Use proxy if configured (for China servers)
    client_kwargs = {"timeout": 30.0}
    if HOTNEWS_OAUTH_PROXY:
        client_kwargs["proxy"] = HOTNEWS_OAUTH_PROXY
    
    # Exchange code for access token
    async with httpx.AsyncClient(**client_kwargs) as client:
        token_resp = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
            },
            headers={"Accept": "application/json"},
        )
        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        
        if not access_token:
            raise HTTPException(status_code=400, detail="Failed to get access token")
        
        # Get user info
        user_resp = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        user_data = user_resp.json()
        
        # Get email
        email_resp = await client.get(
            "https://api.github.com/user/emails",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        emails = email_resp.json()
        primary_email = next((e["email"] for e in emails if e.get("primary")), None)
    
    conn = _get_user_db_conn(request)
    success, message, session_token, user_info = oauth_login_or_register(
        conn,
        auth_type="github",
        auth_id=str(user_data.get("id")),
        auth_data={"access_token": access_token},
        email=primary_email,
        nickname=user_data.get("login") or user_data.get("name"),
        avatar_url=user_data.get("avatar_url"),
        device_info=_get_device_info(request),
        ip_address=_get_client_ip(request),
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    # Redirect to frontend with session cookie
    response = RedirectResponse(url=f"/?login={int(time.time())}")
    _set_session_cookie(response, session_token, request)
    return response


# Google OAuth
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET", "")
# Proxy for OAuth (needed in China to access Google)
HOTNEWS_OAUTH_PROXY = os.environ.get("HOTNEWS_OAUTH_PROXY", "")

# WeChat OAuth (微信开放平台 - 网站应用)
WECHAT_APP_ID = os.environ.get("WECHAT_OAUTH_APP_ID", "")
WECHAT_APP_SECRET = os.environ.get("WECHAT_OAUTH_APP_SECRET", "")

# WeChat MP OAuth (微信服务号 - 网页授权)
WECHAT_MP_APP_ID = os.environ.get("WECHAT_MP_APP_ID", "")
WECHAT_MP_APP_SECRET = os.environ.get("WECHAT_MP_APP_SECRET", "")

@router.get("/oauth/google")
async def google_oauth_start(request: Request):
    """Start Google OAuth flow."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")
    
    redirect_uri = _get_base_url(request) + "/api/auth/oauth/google/callback"
    oauth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={GOOGLE_CLIENT_ID}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code"
        f"&scope=openid email profile"
    )
    return RedirectResponse(url=oauth_url)


@router.get("/oauth/google/callback")
async def google_oauth_callback(request: Request, code: str = ""):
    """Handle Google OAuth callback."""
    import httpx
    from hotnews.kernel.auth.auth_service import oauth_login_or_register
    
    print(f"[AUTH] Google OAuth callback received, code: {code[:20] if code else 'NONE'}...")
    
    if not code or not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        print(f"[AUTH] Google OAuth callback validation failed: code={bool(code)}, client_id={bool(GOOGLE_CLIENT_ID)}, secret={bool(GOOGLE_CLIENT_SECRET)}")
        raise HTTPException(status_code=400, detail="Invalid OAuth callback")
    
    redirect_uri = _get_base_url(request) + "/api/auth/oauth/google/callback"
    
    # Use proxy if configured (for China servers)
    client_kwargs = {"timeout": 30.0}
    if HOTNEWS_OAUTH_PROXY:
        client_kwargs["proxy"] = HOTNEWS_OAUTH_PROXY
    
    async with httpx.AsyncClient(**client_kwargs) as client:
        # Exchange code for access token
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
            },
        )
        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        
        if not access_token:
            print(f"[AUTH] Google Token Error: {token_data}")
            raise HTTPException(status_code=400, detail=f"Failed to get access token: {token_data.get('error_description') or token_data.get('error')}")
        
        print(f"[AUTH] Google access token obtained successfully")
        
        # Get user info
        user_resp = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        user_data = user_resp.json()
        print(f"[AUTH] Google user info: email={user_data.get('email')}, name={user_data.get('name')}")
    
    conn = _get_user_db_conn(request)
    print(f"[AUTH] Calling oauth_login_or_register for Google user: {user_data.get('email')}")
    
    success, message, session_token, user_info = oauth_login_or_register(
        conn,
        auth_type="google",
        auth_id=str(user_data.get("id")),
        auth_data={"access_token": access_token},
        email=user_data.get("email"),
        nickname=user_data.get("name"),
        avatar_url=user_data.get("picture"),
        device_info=_get_device_info(request),
        ip_address=_get_client_ip(request),
    )
    
    print(f"[AUTH] oauth_login_or_register result: success={success}, message={message}, user_id={user_info.get('id') if user_info else None}")
    
    if not success:
        print(f"[AUTH] OAuth login failed: {message}")
        raise HTTPException(status_code=400, detail=message)
    
    print(f"[AUTH] Setting session cookie and redirecting to homepage")
    response = RedirectResponse(url=f"/?login={int(time.time())}")
    _set_session_cookie(response, session_token, request)
    return response


# ==================== WeChat OAuth ====================

@router.get("/oauth/wechat")
async def wechat_oauth_start(request: Request):
    """Start WeChat OAuth flow (微信扫码登录)."""
    if not WECHAT_APP_ID:
        raise HTTPException(status_code=501, detail="WeChat OAuth not configured")
    
    redirect_uri = _get_base_url(request) + "/api/auth/oauth/wechat/callback"
    
    # 微信开放平台网站应用授权
    # 文档: https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html
    oauth_url = (
        f"https://open.weixin.qq.com/connect/qrconnect"
        f"?appid={WECHAT_APP_ID}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code"
        f"&scope=snsapi_login"
        f"&state=STATE#wechat_redirect"
    )
    return RedirectResponse(url=oauth_url)


@router.get("/oauth/wechat/callback")
async def wechat_oauth_callback(request: Request, code: str = "", state: str = ""):
    """Handle WeChat OAuth callback."""
    import httpx
    from hotnews.kernel.auth.auth_service import oauth_login_or_register
    
    if not code or not WECHAT_APP_ID or not WECHAT_APP_SECRET:
        raise HTTPException(status_code=400, detail="Invalid OAuth callback")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Step 1: Exchange code for access_token
        # 文档: https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Authorized_Interface_Calling_UnionID.html
        token_resp = await client.get(
            "https://api.weixin.qq.com/sns/oauth2/access_token",
            params={
                "appid": WECHAT_APP_ID,
                "secret": WECHAT_APP_SECRET,
                "code": code,
                "grant_type": "authorization_code",
            },
        )
        token_data = token_resp.json()
        
        if "errcode" in token_data:
            error_msg = token_data.get("errmsg", "Unknown error")
            print(f"[AUTH] WeChat token error: {token_data}")
            raise HTTPException(status_code=400, detail=f"WeChat auth failed: {error_msg}")
        
        access_token = token_data.get("access_token")
        openid = token_data.get("openid")
        unionid = token_data.get("unionid")  # 如果开发者账号下有多个应用，unionid 可以统一用户身份
        
        if not access_token or not openid:
            raise HTTPException(status_code=400, detail="Failed to get WeChat access token")
        
        # Step 2: Get user info
        user_resp = await client.get(
            "https://api.weixin.qq.com/sns/userinfo",
            params={
                "access_token": access_token,
                "openid": openid,
            },
        )
        user_data = user_resp.json()
        
        if "errcode" in user_data:
            error_msg = user_data.get("errmsg", "Unknown error")
            print(f"[AUTH] WeChat userinfo error: {user_data}")
            raise HTTPException(status_code=400, detail=f"Failed to get WeChat user info: {error_msg}")
    
    # 使用 unionid（如果有）或 openid 作为唯一标识
    auth_id = unionid if unionid else openid
    
    conn = _get_user_db_conn(request)
    success, message, session_token, user_info = oauth_login_or_register(
        conn,
        auth_type="wechat",
        auth_id=auth_id,
        auth_data={
            "access_token": access_token,
            "openid": openid,
            "unionid": unionid,
        },
        email=None,  # 微信不提供邮箱
        nickname=user_data.get("nickname"),
        avatar_url=user_data.get("headimgurl"),
        device_info=_get_device_info(request),
        ip_address=_get_client_ip(request),
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    response = RedirectResponse(url=f"/?login={int(time.time())}")
    _set_session_cookie(response, session_token, request)
    return response


# ==================== WeChat MP OAuth (服务号网页授权) ====================

@router.get("/oauth/wechat-mp")
async def wechat_mp_oauth_start(request: Request):
    """
    Start WeChat MP OAuth flow (微信服务号网页授权).
    
    适用于：
    - 微信内打开网页时，用户点击授权按钮
    - PC 端会显示二维码让用户扫码
    
    文档: https://developers.weixin.qq.com/doc/offiaccount/OA_Web_Apps/Wechat_webpage_authorization.html
    """
    from urllib.parse import quote
    
    if not WECHAT_MP_APP_ID:
        raise HTTPException(status_code=501, detail="WeChat MP OAuth not configured")
    
    redirect_uri = _get_base_url(request) + "/api/auth/oauth/wechat-mp/callback"
    encoded_redirect_uri = quote(redirect_uri, safe='')
    
    # 使用 snsapi_userinfo 获取用户信息（需要用户确认授权）
    # snsapi_base 只能获取 openid，静默授权
    oauth_url = (
        f"https://open.weixin.qq.com/connect/oauth2/authorize"
        f"?appid={WECHAT_MP_APP_ID}"
        f"&redirect_uri={encoded_redirect_uri}"
        f"&response_type=code"
        f"&scope=snsapi_userinfo"
        f"&state=STATE#wechat_redirect"
    )
    return RedirectResponse(url=oauth_url)


@router.get("/oauth/wechat-mp/callback")
async def wechat_mp_oauth_callback(request: Request, code: str = "", state: str = ""):
    """Handle WeChat MP OAuth callback (服务号网页授权回调)."""
    import httpx
    from hotnews.kernel.auth.auth_service import oauth_login_or_register
    
    print(f"[AUTH] WeChat MP OAuth callback: code={code[:20] if code else 'NONE'}...")
    
    if not code or not WECHAT_MP_APP_ID or not WECHAT_MP_APP_SECRET:
        print(f"[AUTH] WeChat MP OAuth validation failed: code={bool(code)}, app_id={bool(WECHAT_MP_APP_ID)}, secret={bool(WECHAT_MP_APP_SECRET)}")
        raise HTTPException(status_code=400, detail="Invalid OAuth callback")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Step 1: Exchange code for access_token
        # 文档: https://developers.weixin.qq.com/doc/offiaccount/OA_Web_Apps/Wechat_webpage_authorization.html#1
        token_resp = await client.get(
            "https://api.weixin.qq.com/sns/oauth2/access_token",
            params={
                "appid": WECHAT_MP_APP_ID,
                "secret": WECHAT_MP_APP_SECRET,
                "code": code,
                "grant_type": "authorization_code",
            },
        )
        token_data = token_resp.json()
        
        if "errcode" in token_data:
            error_msg = token_data.get("errmsg", "Unknown error")
            print(f"[AUTH] WeChat MP token error: {token_data}")
            raise HTTPException(status_code=400, detail=f"WeChat MP auth failed: {error_msg}")
        
        access_token = token_data.get("access_token")
        openid = token_data.get("openid")
        unionid = token_data.get("unionid")  # 需要绑定开放平台才有
        
        print(f"[AUTH] WeChat MP token obtained: openid={openid}, unionid={unionid}")
        
        if not access_token or not openid:
            raise HTTPException(status_code=400, detail="Failed to get WeChat MP access token")
        
        # Step 2: Get user info (snsapi_userinfo scope)
        # 文档: https://developers.weixin.qq.com/doc/offiaccount/OA_Web_Apps/Wechat_webpage_authorization.html#3
        user_resp = await client.get(
            "https://api.weixin.qq.com/sns/userinfo",
            params={
                "access_token": access_token,
                "openid": openid,
                "lang": "zh_CN",
            },
        )
        user_data = user_resp.json()
        
        if "errcode" in user_data:
            error_msg = user_data.get("errmsg", "Unknown error")
            print(f"[AUTH] WeChat MP userinfo error: {user_data}")
            raise HTTPException(status_code=400, detail=f"Failed to get WeChat MP user info: {error_msg}")
        
        print(f"[AUTH] WeChat MP user info: nickname={user_data.get('nickname')}, headimgurl={user_data.get('headimgurl', '')[:50]}...")
    
    # 使用 unionid（如果有）或 openid 作为唯一标识
    # 注意：服务号的 openid 和开放平台的 openid 不同，但 unionid 相同
    auth_id = unionid if unionid else f"mp_{openid}"
    
    conn = _get_user_db_conn(request)
    success, message, session_token, user_info = oauth_login_or_register(
        conn,
        auth_type="wechat_mp",  # 区分服务号和开放平台
        auth_id=auth_id,
        auth_data={
            "access_token": access_token,
            "openid": openid,
            "unionid": unionid,
            "source": "mp",  # 标记来源是服务号
        },
        email=None,  # 微信不提供邮箱
        nickname=user_data.get("nickname"),
        avatar_url=user_data.get("headimgurl"),
        device_info=_get_device_info(request),
        ip_address=_get_client_ip(request),
    )
    
    print(f"[AUTH] WeChat MP oauth_login_or_register result: success={success}, message={message}")
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    response = RedirectResponse(url=f"/?login={int(time.time())}")
    _set_session_cookie(response, session_token, request)
    return response


# ==================== Profile ====================

@router.put("/profile")
async def update_profile(
    request: Request,
    nickname: Optional[str] = Body(None),
    avatar_url: Optional[str] = Body(None),
):
    """Update user profile."""
    from hotnews.kernel.auth.auth_service import validate_session, update_user_profile
    
    session_token = _get_session_token(request)
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    conn = _get_user_db_conn(request)
    is_valid, user_info = validate_session(conn, session_token)
    
    if not is_valid:
        raise HTTPException(status_code=401, detail="Session expired")
    
    success, message = update_user_profile(conn, user_info["id"], nickname, avatar_url)
    
    return {"ok": success, "message": message}


@router.post("/change-password")
async def change_password(
    request: Request,
    old_password: str = Body(...),
    new_password: str = Body(...),
):
    """Change user password."""
    from hotnews.kernel.auth.auth_service import validate_session, change_password as do_change_password
    
    session_token = _get_session_token(request)
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    conn = _get_user_db_conn(request)
    is_valid, user_info = validate_session(conn, session_token)
    
    if not is_valid:
        raise HTTPException(status_code=401, detail="Session expired")
    
    success, message = do_change_password(conn, user_info["id"], old_password, new_password)
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {"ok": True, "message": message}


# ==================== Auth Page ====================

@router.get("/page", include_in_schema=False)
async def auth_page(request: Request):
    """Redirect to home page with login modal trigger."""
    from fastapi.responses import RedirectResponse
    
    # Redirect to home page with ?login=1 to trigger login modal
    return RedirectResponse(url="/?login=1", status_code=302)


@router.get("/reset-password-page", include_in_schema=False)
async def reset_password_page(request: Request):
    """Serve the reset password HTML page."""
    from pathlib import Path
    from fastapi.responses import HTMLResponse
    
    template_path = Path(__file__).parent.parent / "templates" / "reset_password.html"
    if template_path.exists():
        return HTMLResponse(content=template_path.read_text(encoding="utf-8"))
    else:
        return HTMLResponse(content="<h1>Reset password page not found</h1>", status_code=404)


# ==================== WeChat MP QR Login (公众号后台扫码登录) ====================
# 这是用于插件的登录方式，用户扫描公众号后台的二维码登录

# 临时用户 ID 计数器（用于未登录用户的 QR 登录会话）
_temp_user_counter = 0

def _get_temp_user_id() -> int:
    """生成临时用户 ID（负数，避免与真实用户 ID 冲突）"""
    global _temp_user_counter
    _temp_user_counter += 1
    return -_temp_user_counter


@router.post("/qr/start")
async def qr_login_start(request: Request):
    """
    开始 QR 登录会话
    
    为插件提供的登录方式：
    1. 插件调用此接口创建登录会话
    2. 获取二维码图片
    3. 用户用微信扫码
    4. 轮询状态直到登录成功
    """
    from hotnews.kernel.services.wechat_qr_login import start_login_session
    
    # 使用临时用户 ID
    temp_user_id = _get_temp_user_id()
    
    success, message, session_id = start_login_session(temp_user_id)
    
    if not success:
        return {"ok": False, "error": message}
    
    return {
        "ok": True,
        "session_id": session_id,
        "temp_user_id": temp_user_id,
        "message": message,
    }


@router.get("/qr/image/{temp_user_id}")
async def qr_login_image(request: Request, temp_user_id: int):
    """
    获取 QR 登录二维码图片
    
    Returns: PNG image bytes
    """
    from fastapi.responses import Response as FastAPIResponse
    from hotnews.kernel.services.wechat_qr_login import get_qrcode_url
    
    success, message, image_bytes = get_qrcode_url(temp_user_id)
    
    if not success or not image_bytes:
        raise HTTPException(status_code=400, detail=message)
    
    return FastAPIResponse(
        content=image_bytes,
        media_type="image/png",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
    )


@router.get("/qr/status/{temp_user_id}")
async def qr_login_status(request: Request, temp_user_id: int):
    """
    检查 QR 登录扫码状态
    
    Returns:
        {
            "ok": bool,
            "status": "waiting" | "scanned" | "confirmed" | "expired" | "error",
            "message": str,
            "need_refresh": bool,
        }
    """
    from hotnews.kernel.services.wechat_qr_login import check_scan_status
    
    result = check_scan_status(temp_user_id)
    return result


@router.post("/qr/complete/{temp_user_id}")
async def qr_login_complete(request: Request, temp_user_id: int):
    """
    完成 QR 登录，获取 hotnews session token
    
    当扫码状态为 confirmed 时调用此接口完成登录。
    会创建或关联 hotnews 用户账号，并返回 session token。
    """
    from hotnews.kernel.services.wechat_qr_login import complete_login, cancel_login
    from hotnews.kernel.auth.auth_service import oauth_login_or_register
    
    # 完成微信登录，获取 Cookie 和 Token（现在返回 expires_at）
    success, message, cookie_str, mp_token, expires_at = complete_login(temp_user_id)
    
    if not success:
        return {"ok": False, "error": message}
    
    # 使用 mp_token 作为唯一标识创建/关联 hotnews 用户
    # 这里我们用 "wechat_mp" 作为 auth_type，mp_token 作为 auth_id
    conn = _get_user_db_conn(request)
    
    login_success, login_message, session_token, user_info = oauth_login_or_register(
        conn,
        auth_type="wechat_mp",
        auth_id=mp_token,  # 使用 mp_token 作为唯一标识
        auth_data={
            "mp_token": mp_token,
            "cookie": cookie_str,
        },
        email=None,
        nickname=f"公众号用户",  # 后续可以从公众号 API 获取真实昵称
        avatar_url=None,
        device_info=_get_device_info(request),
        ip_address=_get_client_ip(request),
    )
    
    # 清理临时会话
    cancel_login(temp_user_id)
    
    if not login_success:
        return {"ok": False, "error": login_message}
    
    # 同时保存公众号 Cookie 到用户的 wechat_auth（使用实际过期时间）
    # 这样用户登录后就自动完成了公众号授权
    try:
        from hotnews.kernel.admin.wechat_admin import save_wechat_credentials
        save_wechat_credentials(conn, user_info["id"], cookie_str, expires_at)
    except Exception as e:
        print(f"[AUTH] Failed to save wechat credentials: {e}")
    
    return {
        "ok": True,
        "token": session_token,
        "user": user_info,
        "message": "登录成功",
    }


@router.post("/qr/cancel/{temp_user_id}")
async def qr_login_cancel(request: Request, temp_user_id: int):
    """取消 QR 登录会话"""
    from hotnews.kernel.services.wechat_qr_login import cancel_login
    
    cancel_login(temp_user_id)
    return {"ok": True, "message": "已取消"}
