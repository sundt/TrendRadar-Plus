"""
WeChat QR Login API (公众号扫码登录 API)

提供给前端的接口：
- POST /api/auth/wechat-qr/create - 创建登录会话，获取二维码
- GET /api/auth/wechat-qr/status - 轮询登录状态
"""

import os
from fastapi import APIRouter, Request, Response
import json

router = APIRouter(prefix="/api/auth/wechat-qr", tags=["wechat-qr-login"])

WECHAT_MP_APP_ID = os.environ.get("WECHAT_MP_APP_ID", "")
WECHAT_MP_APP_SECRET = os.environ.get("WECHAT_MP_APP_SECRET", "")


@router.post("/create")
async def create_qr_login():
    """
    创建扫码登录会话
    
    Returns:
        {
            "ok": bool,
            "message": str,
            "session_id": str,  # 用于轮询状态
            "qr_url": str,      # 二维码图片 URL
            "expire_seconds": int
        }
    """
    if not WECHAT_MP_APP_ID or not WECHAT_MP_APP_SECRET:
        return {"ok": False, "message": "微信登录未配置"}
    
    from hotnews.kernel.services.wechat_mp_login import create_login_session
    
    success, message, data = await create_login_session(WECHAT_MP_APP_ID, WECHAT_MP_APP_SECRET)
    
    if success:
        return {
            "ok": True,
            "message": message,
            **data
        }
    else:
        return {"ok": False, "message": message}


@router.get("/status")
async def check_qr_login_status(session_id: str = ""):
    """
    检查登录状态（前端轮询）
    
    Query params:
        session_id: 创建时返回的 session_id
    
    Returns:
        {
            "ok": bool,
            "status": "waiting" | "scanned" | "confirmed" | "expired" | "error",
            "message": str,
            "session_token": str | None,  # 登录成功时返回
            "user": {...} | None
        }
    """
    if not session_id:
        return {"ok": False, "status": "error", "message": "缺少 session_id"}
    
    from hotnews.kernel.services.wechat_mp_login import check_login_status
    
    result = check_login_status(session_id)
    return {"ok": True, **result}


@router.post("/confirm-cookie")
async def confirm_login_with_cookie(request: Request, session_id: str = ""):
    """
    登录成功后，设置 session cookie
    
    前端检测到 status=confirmed 后调用此接口设置 cookie
    """
    if not session_id:
        return {"ok": False, "message": "缺少 session_id"}
    
    from hotnews.kernel.services.wechat_mp_login import check_login_status
    
    result = check_login_status(session_id)
    
    if result.get("status") != "confirmed" or not result.get("session_token"):
        return {"ok": False, "message": "登录未完成"}
    
    # 设置 cookie
    from hotnews.kernel.auth.auth_api import _set_session_cookie
    
    response = Response(
        content=json.dumps({"ok": True, "message": "登录成功", "user": result.get("user")}),
        media_type="application/json"
    )
    _set_session_cookie(response, result["session_token"], request)
    
    return response
