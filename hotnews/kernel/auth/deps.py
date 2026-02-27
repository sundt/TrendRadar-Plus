"""
统一鉴权依赖模块

提供标准化的用户认证函数，替代各 API 模块中重复定义的 _get_current_user 等。

用法:
    from hotnews.kernel.auth.deps import get_current_user
    user = get_current_user(request)  # raise 401 if not logged in

    from hotnews.kernel.auth.deps import get_optional_user
    user = get_optional_user(request)  # returns None if not logged in
"""

from typing import Optional, Dict, Any

from fastapi import Request, HTTPException


def _get_session_token(request: Request) -> Optional[str]:
    """从 cookie 中获取 session token。"""
    from hotnews.kernel.auth.auth_api import _get_session_token as _get_token
    return _get_token(request)


def _get_user_db_conn(request: Request):
    """获取用户数据库连接。"""
    from hotnews.web.user_db import get_user_db_conn
    return get_user_db_conn(request.app.state.project_root)


def _validate_session(request: Request, token: str):
    """验证 session token，返回 (is_valid, user_info)。"""
    from hotnews.kernel.auth.auth_service import validate_session
    conn = _get_user_db_conn(request)
    return validate_session(conn, token)


def get_current_user(request: Request) -> dict:
    """
    获取当前登录用户。未登录则 raise HTTPException(401)。

    Returns:
        用户信息 dict，包含 id, nickname, avatar 等字段
    """
    session_token = _get_session_token(request)
    if not session_token:
        raise HTTPException(status_code=401, detail="请先登录")

    is_valid, user_info = _validate_session(request, session_token)
    if not is_valid or not user_info:
        raise HTTPException(status_code=401, detail="登录已过期")

    return user_info


def get_current_user_id(request: Request) -> int:
    """
    获取当前登录用户 ID。未登录则 raise HTTPException(401)。
    """
    user = get_current_user(request)
    return user["id"]


def get_optional_user(request: Request) -> Optional[dict]:
    """
    获取当前用户（可选）。未登录返回 None，不 raise。
    """
    session_token = _get_session_token(request)
    if not session_token:
        return None

    try:
        is_valid, user_info = _validate_session(request, session_token)
        if is_valid and user_info:
            return user_info
    except Exception:
        pass
    return None


def get_optional_user_id(request: Request) -> Optional[int]:
    """
    获取当前用户 ID（可选）。未登录返回 None。
    """
    user = get_optional_user(request)
    return user["id"] if user else None
