"""
WeChat MP Event Callback Handler (公众号消息/事件回调)

处理微信服务号推送的事件：
- subscribe: 用户关注公众号（带参数二维码）
- SCAN: 已关注用户扫描带参数二维码
- unsubscribe: 用户取消关注

配置步骤：
1. 在公众号后台 -> 开发 -> 基本配置 -> 服务器配置
2. URL: https://your-domain.com/api/wechat/callback
3. Token: 自定义一个 token（需要配置到环境变量 WECHAT_MP_TOKEN）
4. EncodingAESKey: 可选，用于消息加密
5. 消息加解密方式: 明文模式（简单）或安全模式
"""

import hashlib
import logging
import os
import time
import xml.etree.ElementTree as ET
from typing import Optional, Tuple

from fastapi import APIRouter, Request, Response
import httpx

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api/wechat", tags=["wechat"])

# 配置
WECHAT_MP_TOKEN = os.environ.get("WECHAT_MP_TOKEN", "hotnews_wechat_token")
WECHAT_MP_APP_ID = os.environ.get("WECHAT_MP_APP_ID", "")
WECHAT_MP_APP_SECRET = os.environ.get("WECHAT_MP_APP_SECRET", "")


def _verify_signature(signature: str, timestamp: str, nonce: str) -> bool:
    """验证微信签名"""
    items = sorted([WECHAT_MP_TOKEN, timestamp, nonce])
    hash_str = hashlib.sha1("".join(items).encode()).hexdigest()
    return hash_str == signature


def _parse_xml(xml_str: str) -> dict:
    """解析微信 XML 消息"""
    root = ET.fromstring(xml_str)
    data = {}
    for child in root:
        data[child.tag] = child.text
    return data


def _build_text_reply(to_user: str, from_user: str, content: str) -> str:
    """构建文本回复消息"""
    return f"""<xml>
<ToUserName><![CDATA[{to_user}]]></ToUserName>
<FromUserName><![CDATA[{from_user}]]></FromUserName>
<CreateTime>{int(time.time())}</CreateTime>
<MsgType><![CDATA[text]]></MsgType>
<Content><![CDATA[{content}]]></Content>
</xml>"""


async def _get_user_info(openid: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    获取用户信息
    
    Returns:
        (nickname, avatar_url, unionid)
    """
    from hotnews.kernel.services.wechat_mp_login import get_access_token
    
    access_token = await get_access_token(WECHAT_MP_APP_ID, WECHAT_MP_APP_SECRET)
    if not access_token:
        return None, None, None
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://api.weixin.qq.com/cgi-bin/user/info",
                params={
                    "access_token": access_token,
                    "openid": openid,
                    "lang": "zh_CN",
                }
            )
            data = resp.json()
            
            if data.get("subscribe") == 1:
                return (
                    data.get("nickname"),
                    data.get("headimgurl"),
                    data.get("unionid"),
                )
            else:
                logger.warning(f"[WeChatMP] User not subscribed: {openid}")
                return None, None, data.get("unionid")
    except Exception as e:
        logger.error(f"[WeChatMP] Get user info error: {e}")
        return None, None, None


@router.get("/callback")
async def wechat_verify(
    signature: str = "",
    timestamp: str = "",
    nonce: str = "",
    echostr: str = "",
):
    """
    微信服务器验证（GET 请求）
    用于首次配置服务器 URL 时的验证
    """
    if _verify_signature(signature, timestamp, nonce):
        logger.info("[WeChatMP] Server verification passed")
        return Response(content=echostr, media_type="text/plain")
    else:
        logger.warning("[WeChatMP] Server verification failed")
        return Response(content="Invalid signature", status_code=403)


@router.post("/callback")
async def wechat_event(
    request: Request,
    signature: str = "",
    timestamp: str = "",
    nonce: str = "",
):
    """
    处理微信事件推送（POST 请求）
    """
    # 验证签名
    if not _verify_signature(signature, timestamp, nonce):
        logger.warning("[WeChatMP] Event signature verification failed")
        return Response(content="Invalid signature", status_code=403)
    
    # 解析 XML
    body = await request.body()
    try:
        data = _parse_xml(body.decode("utf-8"))
    except Exception as e:
        logger.error(f"[WeChatMP] Parse XML error: {e}")
        return Response(content="success", media_type="text/plain")
    
    msg_type = data.get("MsgType", "")
    event = data.get("Event", "")
    from_user = data.get("FromUserName", "")  # 用户 openid
    to_user = data.get("ToUserName", "")  # 公众号原始 ID
    event_key = data.get("EventKey", "")  # 场景值
    
    logger.info(f"[WeChatMP] Received event: type={msg_type}, event={event}, from={from_user[:8]}..., key={event_key}")
    
    reply_content = ""
    
    # 处理事件
    if msg_type == "event":
        if event == "subscribe":
            # 用户关注（可能带参数二维码）
            scene_str = event_key.replace("qrscene_", "") if event_key.startswith("qrscene_") else ""
            reply_content = await _handle_subscribe(from_user, scene_str, request)
            
        elif event == "SCAN":
            # 已关注用户扫描带参数二维码
            scene_str = event_key
            reply_content = await _handle_scan(from_user, scene_str, request)
            
        elif event == "unsubscribe":
            # 用户取消关注
            logger.info(f"[WeChatMP] User unsubscribed: {from_user[:8]}...")
    
    # 返回回复（空字符串表示不回复）
    if reply_content:
        return Response(
            content=_build_text_reply(from_user, to_user, reply_content),
            media_type="application/xml"
        )
    else:
        return Response(content="success", media_type="text/plain")


async def _handle_subscribe(openid: str, scene_str: str, request: Request) -> str:
    """处理用户关注事件"""
    logger.info(f"[WeChatMP] User subscribed: {openid[:8]}..., scene={scene_str}")
    
    if scene_str and scene_str.startswith("login_"):
        # 带参数二维码关注 = 扫码登录
        return await _complete_qr_login(openid, scene_str, request)
    else:
        # 普通关注
        return "🔥 欢迎关注 HotNews！\n\n这里汇聚全网热点资讯，让你快速了解今日热点。"


async def _handle_scan(openid: str, scene_str: str, request: Request) -> str:
    """处理已关注用户扫码事件"""
    logger.info(f"[WeChatMP] User scanned: {openid[:8]}..., scene={scene_str}")
    
    if scene_str and scene_str.startswith("login_"):
        return await _complete_qr_login(openid, scene_str, request)
    
    return ""


async def _complete_qr_login(openid: str, scene_str: str, request: Request) -> str:
    """完成扫码登录"""
    from hotnews.kernel.services.wechat_mp_login import get_session_by_scene, confirm_login
    from hotnews.kernel.auth.auth_service import oauth_login_or_register
    from hotnews.web.user_db import get_user_db_conn
    
    # 检查会话是否存在
    session = get_session_by_scene(scene_str)
    if not session:
        logger.warning(f"[WeChatMP] Login session not found: {scene_str}")
        return "❌ 登录会话已过期，请重新扫码"
    
    # 获取用户信息
    nickname, avatar_url, unionid = await _get_user_info(openid)
    
    # 使用 unionid（如果有）或 openid 作为唯一标识
    auth_id = unionid if unionid else f"mp_{openid}"
    
    # 创建或关联用户账号
    try:
        conn = get_user_db_conn(request.app.state.project_root)
        success, message, session_token, user_info = oauth_login_or_register(
            conn,
            auth_type="wechat_mp",
            auth_id=auth_id,
            auth_data={
                "openid": openid,
                "unionid": unionid,
                "source": "qr_login",
            },
            email=None,
            nickname=nickname or f"微信用户",
            avatar_url=avatar_url,
            device_info="WeChat QR Login",
            ip_address="",
        )
        
        if not success:
            logger.error(f"[WeChatMP] Login failed: {message}")
            return f"❌ 登录失败: {message}"
        
        # 确认登录
        confirm_login(
            scene_str=scene_str,
            openid=openid,
            unionid=unionid,
            nickname=nickname,
            avatar_url=avatar_url,
            session_token=session_token,
        )
        
        logger.info(f"[WeChatMP] QR login completed: {openid[:8]}..., user_id={user_info.get('id')}")
        return f"✅ 登录成功！\n\n欢迎回来，{nickname or '用户'}！"
        
    except Exception as e:
        logger.error(f"[WeChatMP] Complete login error: {e}")
        import traceback
        traceback.print_exc()
        return "❌ 登录失败，请稍后重试"
