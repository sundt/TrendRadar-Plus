# coding=utf-8
"""
Permission Checker - 权限检查服务

检查用户是否可以使用AI总结功能，并处理配额消耗。
统一使用次数计费（免费用户50次/月，VIP用户150次/月）
"""

import time
import logging
from typing import Tuple, Dict, Any, Literal

from .subscription_service import (
    get_user_subscription,
    consume_usage_quota,
    check_and_reset_monthly_quota,
    ensure_user_subscription,
)

logger = logging.getLogger(__name__)

PermissionType = Literal["vip", "free", "quota_exceeded"]


def can_use_summary(conn, user_id: int) -> Tuple[bool, PermissionType, Dict[str, Any]]:
    """
    检查用户是否可以使用总结功能
    
    Returns: (can_use, permission_type, extra_info)
    
    permission_type:
    - "vip": VIP用户且有剩余次数
    - "free": 免费用户且有剩余次数
    - "quota_exceeded": 次数用完
    """
    # 确保用户有订阅记录
    ensure_user_subscription(conn, user_id)
    
    # 检查是否需要重置月度配额
    check_and_reset_monthly_quota(conn, user_id)
    
    # 获取订阅信息
    sub = get_user_subscription(conn, user_id)
    
    if not sub:
        return False, "quota_exceeded", {}
    
    if sub['usage_remaining'] > 0:
        permission_type = "vip" if sub['is_vip'] else "free"
        return True, permission_type, {
            "usage_remaining": sub['usage_remaining'],
            "usage_quota": sub['usage_quota'],
            "is_vip": sub['is_vip'],
            "expire_at": sub.get('expire_at'),
            "days_remaining": sub.get('days_remaining'),
        }
    else:
        return False, "quota_exceeded", {
            "is_vip": sub['is_vip'],
            "plan_type": sub['plan_type'],
            "expire_at": sub.get('expire_at'),
            "days_remaining": sub.get('days_remaining'),
        }


def consume_quota(
    conn,
    user_id: int,
    permission_type: PermissionType,
    tokens_used: int = 0,
    news_id: str = None,
    title: str = None
) -> bool:
    """
    消耗一次使用配额
    
    Returns True if successful.
    """
    now = int(time.time())
    
    # 扣减使用次数
    success = consume_usage_quota(conn, user_id)
    
    # 记录token消耗（仅用于统计）
    if success and tokens_used > 0:
        conn.execute("""
            INSERT INTO token_usage_logs (user_id, news_id, title, tokens_used, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (user_id, news_id, title, tokens_used, now))
        conn.commit()
        logger.info(f"[Permission] Usage logged: user={user_id}, tokens={tokens_used}")
    
    return success


def get_permission_error_message(permission_type: PermissionType, extra_info: Dict[str, Any]) -> str:
    """获取权限不足时的错误提示"""
    if permission_type == "quota_exceeded":
        is_vip = extra_info.get('is_vip', False)
        if is_vip:
            return "本月使用次数已用完，请等待下月重置"
        else:
            return "本月免费次数已用完，订阅会员可获得更多次数"
    return "无法使用此功能"
