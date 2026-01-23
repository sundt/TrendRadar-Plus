"""
WeChat MP QR Code Login Service (公众号扫码登录)

基于微信服务号的带参数二维码实现扫码登录。

流程：
1. 生成带参数的临时二维码（scene_str 包含登录会话 ID）
2. 用户扫码关注公众号（或已关注用户扫码）
3. 微信推送 subscribe/SCAN 事件到服务器
4. 服务器验证 scene_str，完成用户登录
5. 前端轮询检测登录状态

需要配置：
- WECHAT_MP_APP_ID: 服务号 AppID
- WECHAT_MP_APP_SECRET: 服务号 AppSecret
- 公众号后台配置消息推送 URL: https://your-domain.com/api/wechat/callback
"""

import hashlib
import logging
import time
import threading
from dataclasses import dataclass, field
from typing import Any, Dict, Optional, Tuple
import secrets

import httpx

logger = logging.getLogger("uvicorn.error")

# ========== 配置 ==========
QR_EXPIRE_SECONDS = 300  # 二维码有效期 5 分钟
SESSION_CLEANUP_INTERVAL = 60  # 清理间隔

# ========== Access Token 缓存 ==========
_access_token: Optional[str] = None
_access_token_expires: float = 0
_token_lock = threading.Lock()


async def get_access_token(app_id: str, app_secret: str) -> Optional[str]:
    """
    获取公众号 access_token（带缓存）
    """
    global _access_token, _access_token_expires
    
    with _token_lock:
        # 检查缓存是否有效（提前 5 分钟过期）
        if _access_token and time.time() < _access_token_expires - 300:
            return _access_token
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://api.weixin.qq.com/cgi-bin/token",
                params={
                    "grant_type": "client_credential",
                    "appid": app_id,
                    "secret": app_secret,
                }
            )
            data = resp.json()
            
            if "access_token" in data:
                with _token_lock:
                    _access_token = data["access_token"]
                    _access_token_expires = time.time() + data.get("expires_in", 7200)
                logger.info(f"[WeChatMP] Access token refreshed, expires in {data.get('expires_in')}s")
                return _access_token
            else:
                logger.error(f"[WeChatMP] Failed to get access_token: {data}")
                return None
    except Exception as e:
        logger.error(f"[WeChatMP] Get access_token error: {e}")
        return None


# ========== 登录会话管理 ==========
@dataclass
class MPLoginSession:
    """公众号扫码登录会话"""
    session_id: str
    scene_str: str  # 二维码场景值
    created_at: float
    status: str = "waiting"  # waiting, scanned, confirmed, expired
    qr_ticket: Optional[str] = None
    qr_url: Optional[str] = None
    # 登录成功后的用户信息
    openid: Optional[str] = None
    unionid: Optional[str] = None
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None
    session_token: Optional[str] = None  # 登录成功后的 session token


# 内存存储：scene_str -> session
_login_sessions: Dict[str, MPLoginSession] = {}
_sessions_lock = threading.Lock()


def _generate_scene_str() -> str:
    """生成唯一的场景值"""
    return f"login_{secrets.token_hex(8)}"


def _cleanup_expired_sessions():
    """清理过期会话"""
    now = time.time()
    with _sessions_lock:
        expired = [
            scene for scene, session in _login_sessions.items()
            if now - session.created_at > QR_EXPIRE_SECONDS + 60
        ]
        for scene in expired:
            del _login_sessions[scene]
        if expired:
            logger.info(f"[WeChatMP] Cleaned up {len(expired)} expired sessions")


async def create_login_session(app_id: str, app_secret: str) -> Tuple[bool, str, Optional[Dict]]:
    """
    创建登录会话，生成带参数二维码
    
    Returns:
        (success, message, data)
        data: {"session_id": str, "qr_url": str, "expire_seconds": int}
    """
    _cleanup_expired_sessions()
    
    # 获取 access_token
    access_token = await get_access_token(app_id, app_secret)
    if not access_token:
        return False, "获取 access_token 失败", None
    
    # 生成场景值
    scene_str = _generate_scene_str()
    session_id = secrets.token_hex(16)
    
    try:
        # 创建临时二维码
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"https://api.weixin.qq.com/cgi-bin/qrcode/create?access_token={access_token}",
                json={
                    "expire_seconds": QR_EXPIRE_SECONDS,
                    "action_name": "QR_STR_SCENE",
                    "action_info": {
                        "scene": {"scene_str": scene_str}
                    }
                }
            )
            data = resp.json()
            
            if "ticket" not in data:
                logger.error(f"[WeChatMP] Create QR failed: {data}")
                return False, f"创建二维码失败: {data.get('errmsg', '未知错误')}", None
            
            ticket = data["ticket"]
            qr_url = f"https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket={ticket}"
            
            # 保存会话
            session = MPLoginSession(
                session_id=session_id,
                scene_str=scene_str,
                created_at=time.time(),
                qr_ticket=ticket,
                qr_url=qr_url,
            )
            
            with _sessions_lock:
                _login_sessions[scene_str] = session
            
            logger.info(f"[WeChatMP] Created login session: {session_id[:8]}..., scene={scene_str}")
            
            return True, "创建成功", {
                "session_id": session_id,
                "qr_url": qr_url,
                "expire_seconds": QR_EXPIRE_SECONDS,
            }
            
    except Exception as e:
        logger.error(f"[WeChatMP] Create session error: {e}")
        return False, f"创建会话失败: {e}", None


def get_session_by_scene(scene_str: str) -> Optional[MPLoginSession]:
    """根据场景值获取会话"""
    with _sessions_lock:
        return _login_sessions.get(scene_str)


def check_login_status(session_id: str) -> Dict[str, Any]:
    """
    检查登录状态（前端轮询用）
    
    Returns:
        {"status": str, "message": str, "user": dict|None, "session_token": str|None}
    """
    with _sessions_lock:
        for session in _login_sessions.values():
            if session.session_id == session_id:
                # 检查是否过期
                if time.time() - session.created_at > QR_EXPIRE_SECONDS:
                    session.status = "expired"
                    return {"status": "expired", "message": "二维码已过期，请刷新"}
                
                if session.status == "confirmed" and session.session_token:
                    return {
                        "status": "confirmed",
                        "message": "登录成功",
                        "session_token": session.session_token,
                        "user": {
                            "nickname": session.nickname,
                            "avatar_url": session.avatar_url,
                        }
                    }
                elif session.status == "scanned":
                    return {"status": "scanned", "message": "已扫码，请在手机上确认"}
                else:
                    return {"status": "waiting", "message": "等待扫码"}
        
        return {"status": "error", "message": "会话不存在或已过期"}


def confirm_login(
    scene_str: str,
    openid: str,
    unionid: Optional[str],
    nickname: Optional[str],
    avatar_url: Optional[str],
    session_token: str,
) -> bool:
    """
    确认登录（微信事件回调时调用）
    
    Returns:
        是否成功
    """
    with _sessions_lock:
        session = _login_sessions.get(scene_str)
        if not session:
            logger.warning(f"[WeChatMP] Confirm login failed: session not found for scene={scene_str}")
            return False
        
        if session.status == "confirmed":
            logger.info(f"[WeChatMP] Session already confirmed: {scene_str}")
            return True
        
        session.status = "confirmed"
        session.openid = openid
        session.unionid = unionid
        session.nickname = nickname
        session.avatar_url = avatar_url
        session.session_token = session_token
        
        logger.info(f"[WeChatMP] Login confirmed: scene={scene_str}, openid={openid[:8]}...")
        return True


def mark_scanned(scene_str: str) -> bool:
    """标记为已扫码"""
    with _sessions_lock:
        session = _login_sessions.get(scene_str)
        if session and session.status == "waiting":
            session.status = "scanned"
            return True
        return False
