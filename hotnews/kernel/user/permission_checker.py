# coding=utf-8
"""
Permission Checker - 权限检查服务

检查用户是否可以使用AI总结功能，并处理配额消耗。
"""

import time
import logging
from typing import Tuple, Dict, Any, Literal

from .subscription_service import (
    get_user_subscription,
    consume_usage_quota,
    check_and_reset_monthly_quota,
)
from .payment_api import get_user_token_balance, consume_tokens

logger = logging.getLogger(__name__)

PermissionType = Literal["vip", "token", "quota_exceeded", "no_quota"]


def can_use_summary(conn, user_id: int) -> Tuple[bool, PermissionType, Dict[str, Any]]:
    """
    检查用户是否可以使用总结功能
    
    Returns: (can_use, permission_type, extra_info)
    
    permission_type:
    - "vip": VIP用户且有剩余次数
    - "token": 免费用户且有Token余额
    - "quota_exceeded": VIP用户但次数用完
    - "no_quota": 免费用户且Token用完
    """
    now = int(time.time())
    
    # 1. 检查是否是VIP会员
    sub = get_user_subscription(conn, user_id)
    
    if sub and sub['is_vip']:
        # 检查是否需要重置月度配额
        check_and_reset_monthly_quota(conn, user_id)
        # 重新获取更新后的订阅信息
        sub = get_user_subscription(conn, user_id)
        
        if sub['usage_remaining'] > 0:
            return True, "vip", {
                "usage_remaining": sub['usage_remaining'],
                "usage_quota": sub['usage_quota'],
                "expire_at": sub['expire_at'],
                "days_remaining": sub['days_remaining'],
            }
        else:
            return False, "quota_exceeded", {
                "expire_at": sub['expire_at'],
                "plan_type": sub['plan_type'],
                "days_remaining": sub['days_remaining'],
            }
    
    # 2. 非VIP用户检查Token余额
    balance = get_user_token_balance(conn, user_id)
    
    if balance['total'] > 0:
        return True, "token", {
            "token_balance": balance['total'],
        }
    
    # 3. 无配额
    return False, "no_quota", {}


def consume_quota(
    conn,
    user_id: int,
    permission_type: PermissionType,
    tokens_used: int,
    news_id: str = None,
    title: str = None
) -> bool:
    """
    根据权限类型消耗配额
    
    - vip: 扣减使用次数，记录token消耗（不扣减余额）
    - token: 扣减token余额
    
    Returns True if successful.
    """
    now = int(time.time())
    
    if permission_type == "vip":
        # VIP用户：扣减使用次数
        success = consume_usage_quota(conn, user_id)
        
        # 记录token消耗（仅用于统计，不扣减余额）
        if tokens_used > 0:
            conn.execute("""
                INSERT INTO token_usage_logs (user_id, news_id, title, tokens_used, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (user_id, news_id, title, tokens_used, now))
            conn.commit()
            logger.info(f"[Permission] VIP usage logged: user={user_id}, tokens={tokens_used}")
        
        return success
    
    elif permission_type == "token":
        # 免费用户：扣减token余额
        return consume_tokens(conn, user_id, tokens_used, news_id, title)
    
    return False


def get_permission_error_message(permission_type: PermissionType, extra_info: Dict[str, Any]) -> str:
    """获取权限不足时的错误提示"""
    if permission_type == "quota_exceeded":
        plan_type = extra_info.get('plan_type', 'monthly')
        if plan_type == 'monthly':
            return "本月使用次数已用完，请等待下月重置或续费升级"
        else:
            return "年度使用次数已用完，请续费"
    elif permission_type == "no_quota":
        return "Token余额不足，请订阅会员"
    return "无法使用此功能"
