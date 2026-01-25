"""
WeChat QR Code Login Service

基于微信公众号后台 API 实现扫码登录，无需 Playwright 浏览器。

流程：
1. 创建登录会话 (startlogin) - 获取 uuid cookie
2. 获取二维码图片 (getqrcode) - 返回二维码图片
3. 轮询扫码状态 (ask) - 检查用户是否扫码
4. 完成登录 (login) - 获取 Cookie 和 Token

风控措施：
- 全局速率限制：每分钟最多 10 次 startlogin
- 用户级限制：每用户每小时最多 5 次
- 并发限制：同时最多 3 个活跃会话
"""

import hashlib
import logging
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple
from collections import deque
import threading

import requests

logger = logging.getLogger("uvicorn.error")

# 微信公众号后台 URL
MP_BASE_URL = "https://mp.weixin.qq.com"

# 请求头
DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://mp.weixin.qq.com/",
    "Origin": "https://mp.weixin.qq.com",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

# ========== 风控配置 ==========
RATE_LIMIT_GLOBAL_PER_MINUTE = 10  # 全局每分钟最多请求数
RATE_LIMIT_USER_PER_HOUR = 5       # 每用户每小时最多请求数
MAX_CONCURRENT_SESSIONS = 3        # 最大并发会话数
SESSION_TIMEOUT = 300              # 会话超时时间（秒）

# 速率限制状态
_rate_limit_lock = threading.Lock()
_global_requests: deque = deque()  # 全局请求时间戳队列
_user_requests: Dict[int, deque] = {}  # 用户请求时间戳队列


def _check_rate_limit(user_id: int) -> Tuple[bool, str]:
    """
    检查速率限制
    
    Returns:
        (allowed, error_message)
    """
    now = time.time()
    
    with _rate_limit_lock:
        # 清理过期的全局请求记录
        while _global_requests and _global_requests[0] < now - 60:
            _global_requests.popleft()
        
        # 检查全局限制
        if len(_global_requests) >= RATE_LIMIT_GLOBAL_PER_MINUTE:
            logger.warning(f"[QRLogin] Global rate limit exceeded")
            return False, "服务繁忙，请稍后再试"
        
        # 清理过期的用户请求记录
        if user_id in _user_requests:
            user_queue = _user_requests[user_id]
            while user_queue and user_queue[0] < now - 3600:
                user_queue.popleft()
        else:
            _user_requests[user_id] = deque()
        
        # 检查用户限制
        if len(_user_requests[user_id]) >= RATE_LIMIT_USER_PER_HOUR:
            logger.warning(f"[QRLogin] User {user_id} rate limit exceeded")
            return False, "请求过于频繁，请 1 小时后再试"
        
        # 检查并发会话数
        active_sessions = sum(
            1 for s in _login_sessions.values()
            if s.status in ("waiting", "scanned") and now - s.created_at < SESSION_TIMEOUT
        )
        if active_sessions >= MAX_CONCURRENT_SESSIONS:
            logger.warning(f"[QRLogin] Max concurrent sessions reached: {active_sessions}")
            return False, "当前登录请求较多，请稍后再试"
        
        # 记录请求
        _global_requests.append(now)
        _user_requests[user_id].append(now)
        
        return True, ""


@dataclass
class QRLoginSession:
    """扫码登录会话"""
    session_id: str
    uuid: str  # 微信返回的 uuid cookie
    created_at: int
    status: str  # waiting, scanned, confirmed, expired, error
    cookies: Optional[str] = None
    token: Optional[str] = None
    error_message: Optional[str] = None


# 内存中存储登录会话（每个用户一个）
_login_sessions: Dict[int, QRLoginSession] = {}


def _generate_session_id() -> str:
    """生成会话 ID"""
    return hashlib.md5(f"{time.time()}{id(object())}".encode()).hexdigest()[:16]


def _cleanup_expired_sessions():
    """清理过期会话"""
    now = time.time()
    expired_users = [
        user_id for user_id, session in _login_sessions.items()
        if now - session.created_at > SESSION_TIMEOUT
    ]
    for user_id in expired_users:
        del _login_sessions[user_id]
    if expired_users:
        logger.info(f"[QRLogin] Cleaned up {len(expired_users)} expired sessions")


def start_login_session(user_id: int) -> Tuple[bool, str, Optional[str]]:
    """
    创建新的登录会话
    
    Returns:
        (success, message, session_id)
    """
    # 清理过期会话
    _cleanup_expired_sessions()
    
    # 检查速率限制
    allowed, error_msg = _check_rate_limit(user_id)
    if not allowed:
        return False, error_msg, None
    
    try:
        session_id = _generate_session_id()
        timestamp = str(int(time.time() * 1000))
        
        # 调用微信 startlogin API
        url = f"{MP_BASE_URL}/cgi-bin/bizlogin"
        params = {"action": "startlogin"}
        data = {
            "userlang": "zh_CN",
            "redirect_url": "",
            "login_type": "3",
            "sessionid": timestamp,
            "token": "",
            "lang": "zh_CN",
            "f": "json",
            "ajax": "1",
        }
        
        resp = requests.post(
            url,
            params=params,
            data=data,
            headers=DEFAULT_HEADERS,
            timeout=10,
        )
        
        if resp.status_code != 200:
            return False, f"请求失败: HTTP {resp.status_code}", None
        
        result = resp.json()
        if result.get("base_resp", {}).get("ret") != 0:
            err_msg = result.get("base_resp", {}).get("err_msg", "未知错误")
            return False, f"创建会话失败: {err_msg}", None
        
        # 提取 uuid cookie
        uuid_cookie = ""
        for cookie in resp.cookies:
            if cookie.name == "uuid":
                uuid_cookie = cookie.value
                break
        
        if not uuid_cookie:
            # 从 Set-Cookie header 中提取
            set_cookies = resp.headers.get("Set-Cookie", "")
            for part in set_cookies.split(";"):
                if part.strip().startswith("uuid="):
                    uuid_cookie = part.strip().split("=", 1)[1]
                    break
        
        if not uuid_cookie:
            return False, "未获取到 uuid", None
        
        # 保存会话
        session = QRLoginSession(
            session_id=session_id,
            uuid=uuid_cookie,
            created_at=int(time.time()),
            status="waiting",
        )
        _login_sessions[user_id] = session
        
        logger.info(f"[QRLogin] Created session for user {user_id}, uuid={uuid_cookie[:8]}...")
        return True, "会话创建成功", session_id
        
    except requests.RequestException as e:
        logger.error(f"[QRLogin] Start login error: {e}")
        return False, f"网络错误: {e}", None
    except Exception as e:
        logger.error(f"[QRLogin] Start login error: {e}")
        return False, f"创建会话失败: {e}", None


def get_qrcode_url(user_id: int) -> Tuple[bool, str, Optional[bytes]]:
    """
    获取二维码图片
    
    Returns:
        (success, message, image_bytes)
    """
    session = _login_sessions.get(user_id)
    if not session:
        return False, "请先创建登录会话", None
    
    # 检查会话是否过期（5分钟）
    if time.time() - session.created_at > 300:
        session.status = "expired"
        return False, "会话已过期，请重新扫码", None
    
    try:
        url = f"{MP_BASE_URL}/cgi-bin/scanloginqrcode"
        params = {
            "action": "getqrcode",
            "random": str(int(time.time() * 1000)),
        }
        headers = {**DEFAULT_HEADERS, "Cookie": f"uuid={session.uuid}"}
        
        resp = requests.get(url, params=params, headers=headers, timeout=10)
        
        if resp.status_code != 200:
            return False, f"获取二维码失败: HTTP {resp.status_code}", None
        
        # 检查是否是图片
        content_type = resp.headers.get("Content-Type", "")
        if "image" not in content_type:
            return False, "返回内容不是图片", None
        
        return True, "获取成功", resp.content
        
    except requests.RequestException as e:
        logger.error(f"[QRLogin] Get QRCode error: {e}")
        return False, f"网络错误: {e}", None
    except Exception as e:
        logger.error(f"[QRLogin] Get QRCode error: {e}")
        return False, f"获取二维码失败: {e}", None


def check_scan_status(user_id: int) -> Dict[str, Any]:
    """
    检查扫码状态
    
    Returns:
        {
            "ok": bool,
            "status": "waiting" | "scanned" | "confirmed" | "expired" | "error",
            "message": str,
            "need_refresh": bool,  # 是否需要刷新二维码
        }
    """
    session = _login_sessions.get(user_id)
    if not session:
        return {"ok": False, "status": "error", "message": "请先创建登录会话", "need_refresh": True}
    
    # 检查会话是否过期
    if time.time() - session.created_at > 300:
        session.status = "expired"
        return {"ok": True, "status": "expired", "message": "二维码已过期", "need_refresh": True}
    
    try:
        url = f"{MP_BASE_URL}/cgi-bin/scanloginqrcode"
        params = {
            "action": "ask",
            "token": "",
            "lang": "zh_CN",
            "f": "json",
            "ajax": "1",
        }
        headers = {**DEFAULT_HEADERS, "Cookie": f"uuid={session.uuid}"}
        
        resp = requests.get(url, params=params, headers=headers, timeout=10)
        
        if resp.status_code != 200:
            return {"ok": False, "status": "error", "message": f"HTTP {resp.status_code}", "need_refresh": False}
        
        result = resp.json()
        status_code = result.get("status", -1)
        
        # 状态码含义：
        # 0 - 等待扫码
        # 1 - 已确认登录
        # 2, 3 - 需要刷新二维码
        # 4, 6 - 已扫码，等待确认
        # 5 - 未绑定邮箱
        
        if status_code == 0:
            return {"ok": True, "status": "waiting", "message": "等待扫码", "need_refresh": False}
        elif status_code == 1:
            session.status = "confirmed"
            return {"ok": True, "status": "confirmed", "message": "已确认登录", "need_refresh": False}
        elif status_code in (2, 3):
            return {"ok": True, "status": "expired", "message": "二维码已过期", "need_refresh": True}
        elif status_code in (4, 6):
            acct_size = result.get("acct_size", 0)
            if acct_size >= 1:
                session.status = "scanned"
                return {"ok": True, "status": "scanned", "message": "已扫码，请在手机上确认", "need_refresh": False}
            else:
                return {"ok": True, "status": "error", "message": "没有可登录的公众号账号", "need_refresh": True}
        elif status_code == 5:
            return {"ok": True, "status": "error", "message": "该账号未绑定邮箱，无法扫码登录", "need_refresh": True}
        else:
            return {"ok": True, "status": "waiting", "message": "等待扫码", "need_refresh": False}
        
    except requests.RequestException as e:
        logger.error(f"[QRLogin] Check status error: {e}")
        return {"ok": False, "status": "error", "message": f"网络错误: {e}", "need_refresh": False}
    except Exception as e:
        logger.error(f"[QRLogin] Check status error: {e}")
        return {"ok": False, "status": "error", "message": str(e), "need_refresh": False}


def complete_login(user_id: int) -> Tuple[bool, str, Optional[str], Optional[str], Optional[int]]:
    """
    完成登录，获取 Cookie 和 Token
    
    Returns:
        (success, message, cookie, token, expires_at)
        expires_at: Cookie 过期时间戳（从 slave_sid cookie 提取），如果无法提取则为 None
    """
    session = _login_sessions.get(user_id)
    if not session:
        return False, "请先创建登录会话", None, None, None
    
    if session.status != "confirmed":
        return False, "请先完成扫码确认", None, None, None
    
    try:
        url = f"{MP_BASE_URL}/cgi-bin/bizlogin"
        params = {"action": "login"}
        data = {
            "userlang": "zh_CN",
            "redirect_url": "",
            "cookie_forbidden": "0",
            "cookie_cleaned": "0",
            "plugin_used": "0",
            "login_type": "3",
            "token": "",
            "lang": "zh_CN",
            "f": "json",
            "ajax": "1",
        }
        headers = {**DEFAULT_HEADERS, "Cookie": f"uuid={session.uuid}"}
        
        resp = requests.post(url, params=params, data=data, headers=headers, timeout=15)
        
        if resp.status_code != 200:
            return False, f"登录失败: HTTP {resp.status_code}", None, None, None
        
        result = resp.json()
        base_resp = result.get("base_resp", {})
        
        if base_resp.get("ret") != 0:
            err_msg = base_resp.get("err_msg", "未知错误")
            return False, f"登录失败: {err_msg}", None, None, None
        
        # 从 redirect_url 中提取 token
        redirect_url = result.get("redirect_url", "")
        token = ""
        if "token=" in redirect_url:
            token = redirect_url.split("token=")[1].split("&")[0]
        
        if not token:
            return False, "未获取到 token", None, None, None
        
        # 收集所有 Cookie 并提取过期时间
        cookies_list = []
        expires_at = None
        
        for cookie in resp.cookies:
            cookies_list.append(f"{cookie.name}={cookie.value}")
            # 尝试从 slave_sid cookie 提取过期时间（微信公众号后台的关键 session cookie）
            if cookie.name == "slave_sid" and cookie.expires:
                try:
                    expires_at = int(cookie.expires)
                    logger.info(f"[QRLogin] Extracted expires_at from slave_sid: {expires_at}")
                except (ValueError, TypeError):
                    pass
        
        # 从 Set-Cookie header 中也提取
        set_cookie_header = resp.headers.get("Set-Cookie", "")
        if set_cookie_header:
            # 简单解析，只取 name=value 部分
            for part in set_cookie_header.split(","):
                part = part.strip()
                if "=" in part:
                    name_value = part.split(";")[0].strip()
                    if name_value and "=" in name_value:
                        cookies_list.append(name_value)
                    
                    # 尝试从 Set-Cookie header 提取 slave_sid 的过期时间
                    if "slave_sid=" in part and expires_at is None:
                        # 查找 expires= 或 max-age=
                        for attr in part.split(";"):
                            attr = attr.strip().lower()
                            if attr.startswith("expires="):
                                try:
                                    from email.utils import parsedate_to_datetime
                                    exp_str = attr.split("=", 1)[1].strip()
                                    exp_dt = parsedate_to_datetime(exp_str)
                                    expires_at = int(exp_dt.timestamp())
                                    logger.info(f"[QRLogin] Extracted expires_at from header: {expires_at}")
                                except Exception as e:
                                    logger.debug(f"[QRLogin] Failed to parse expires: {e}")
                            elif attr.startswith("max-age="):
                                try:
                                    max_age = int(attr.split("=", 1)[1].strip())
                                    expires_at = int(time.time()) + max_age
                                    logger.info(f"[QRLogin] Calculated expires_at from max-age: {expires_at}")
                                except (ValueError, TypeError):
                                    pass
        
        cookie_str = "; ".join(cookies_list)
        
        # 如果没有提取到过期时间，使用默认值（24小时）
        if expires_at is None:
            expires_at = int(time.time()) + 24 * 3600
            logger.info(f"[QRLogin] Using default expires_at (24h): {expires_at}")
        
        # 更新会话
        session.cookies = cookie_str
        session.token = token
        session.status = "completed"
        
        logger.info(f"[QRLogin] Login completed for user {user_id}, token={token[:8]}..., expires_at={expires_at}")
        return True, "登录成功", cookie_str, token, expires_at
        
    except requests.RequestException as e:
        logger.error(f"[QRLogin] Complete login error: {e}")
        return False, f"网络错误: {e}", None, None, None
    except Exception as e:
        logger.error(f"[QRLogin] Complete login error: {e}")
        return False, f"登录失败: {e}", None, None, None


def cancel_login(user_id: int) -> bool:
    """取消登录会话"""
    if user_id in _login_sessions:
        del _login_sessions[user_id]
        return True
    return False


def get_session_status(user_id: int) -> Optional[str]:
    """获取会话状态"""
    session = _login_sessions.get(user_id)
    if session:
        return session.status
    return None
