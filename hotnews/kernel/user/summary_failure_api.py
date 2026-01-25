# coding=utf-8
"""
Summary Failure API

提供总结失败追踪的 API 接口：
1. 获取失败统计
2. 检查 URL 是否可总结
3. 管理域名黑名单
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Request, HTTPException, Body, Query

router = APIRouter(prefix="/api/summary/failures", tags=["summary-failures"])


def _get_online_db_conn(request: Request):
    from hotnews.web.db_online import get_online_db_conn
    return get_online_db_conn(request.app.state.project_root)


def _get_current_user(request: Request):
    """Get current authenticated user or raise 401."""
    from hotnews.kernel.auth.auth_api import _get_session_token
    from hotnews.kernel.auth.auth_service import validate_session
    from hotnews.web.user_db import get_user_db_conn
    
    session_token = _get_session_token(request)
    if not session_token:
        raise HTTPException(status_code=401, detail="请先登录")
    
    conn = get_user_db_conn(request.app.state.project_root)
    is_valid, user_info = validate_session(conn, session_token)
    
    if not is_valid or not user_info:
        raise HTTPException(status_code=401, detail="登录已过期")
    
    return user_info


def _require_admin(user: dict):
    """Check if user is admin."""
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="需要管理员权限")


@router.get("/stats")
async def get_failure_stats(request: Request):
    """
    获取总结失败统计概览
    
    Returns:
        total_failures: 总失败数
        blocked_domains: 被拉黑的域名数
        by_reason: 按原因分组的统计
        top_domains: Top 10 失败域名
        top_sources: Top 10 失败 RSS 源
    """
    from hotnews.kernel.services.summary_failure_tracker import get_failure_stats
    
    conn = _get_online_db_conn(request)
    stats = get_failure_stats(conn)
    
    return {"ok": True, **stats}


@router.get("/check")
async def check_url_summarizable(
    request: Request,
    url: str = Query(..., description="要检查的 URL")
):
    """
    检查 URL 是否可以总结
    
    Returns:
        summarizable: 是否可以总结
        warning: 警告信息（如果有）
        failure_count: 该 URL 的失败次数
        domain_blocked: 域名是否被拉黑
        reason: 失败原因代码
        source_name: 关联的 RSS 源名称
    """
    from hotnews.kernel.services.summary_failure_tracker import check_summarizable
    
    conn = _get_online_db_conn(request)
    can_summarize, warning, extra_info = check_summarizable(conn, url)
    
    return {
        "ok": True,
        "summarizable": can_summarize,
        "warning": warning,
        **extra_info
    }


@router.post("/check-batch")
async def check_urls_batch(
    request: Request,
    urls: List[str] = Body(..., description="要检查的 URL 列表")
):
    """
    批量检查 URL 是否可以总结
    
    Body:
        urls: URL 列表（最多 100 个）
    
    Returns:
        results: {url: {summarizable, warning, failure_count, domain_blocked}}
    """
    from hotnews.kernel.services.summary_failure_tracker import check_summarizable_batch
    
    if len(urls) > 100:
        urls = urls[:100]
    
    conn = _get_online_db_conn(request)
    results = check_summarizable_batch(conn, urls)
    
    return {"ok": True, "results": results}


@router.get("/blocked-domains")
async def get_blocked_domains(
    request: Request,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100)
):
    """
    获取被拉黑的域名列表
    
    Query params:
        page: 页码（从 1 开始）
        limit: 每页数量（最多 100）
    
    Returns:
        domains: 域名列表
        total: 总数
        page: 当前页
        limit: 每页数量
    """
    from hotnews.kernel.services.summary_failure_tracker import get_blocked_domains
    
    conn = _get_online_db_conn(request)
    domains, total = get_blocked_domains(conn, page, limit)
    
    return {
        "ok": True,
        "domains": domains,
        "total": total,
        "page": page,
        "limit": limit
    }


@router.post("/blocked-domains/{domain}/unblock")
async def unblock_domain(
    request: Request,
    domain: str
):
    """
    解除域名黑名单（需要管理员权限）
    
    Path params:
        domain: 要解除的域名
    """
    from hotnews.kernel.services.summary_failure_tracker import unblock_domain as do_unblock
    
    user = _get_current_user(request)
    _require_admin(user)
    
    conn = _get_online_db_conn(request)
    success = do_unblock(conn, domain)
    
    if success:
        return {"ok": True, "message": f"已解除 {domain} 的黑名单"}
    else:
        raise HTTPException(status_code=500, detail="解除黑名单失败")


@router.post("/blocked-domains/{domain}/block")
async def block_domain(
    request: Request,
    domain: str,
    reason: str = Body("手动拉黑", embed=True)
):
    """
    手动拉黑域名（需要管理员权限）
    
    Path params:
        domain: 要拉黑的域名
    Body:
        reason: 拉黑原因
    """
    from hotnews.kernel.services.summary_failure_tracker import block_domain_manually
    
    user = _get_current_user(request)
    _require_admin(user)
    
    conn = _get_online_db_conn(request)
    success = block_domain_manually(conn, domain, reason)
    
    if success:
        return {"ok": True, "message": f"已将 {domain} 加入黑名单"}
    else:
        raise HTTPException(status_code=500, detail="加入黑名单失败")


@router.get("/recent")
async def get_recent_failures(
    request: Request,
    limit: int = Query(20, ge=1, le=100)
):
    """
    获取最近的失败记录
    
    Query params:
        limit: 返回数量（最多 100）
    
    Returns:
        failures: 失败记录列表
    """
    from hotnews.kernel.services.summary_failure_tracker import FAILURE_REASONS
    
    conn = _get_online_db_conn(request)
    
    cur = conn.execute("""
        SELECT url, domain, source_name, reason, error_detail, 
               attempt_count, first_failed_at, last_failed_at
        FROM summary_failures
        ORDER BY last_failed_at DESC
        LIMIT ?
    """, (limit,))
    
    failures = []
    for row in cur.fetchall():
        reason_info = FAILURE_REASONS.get(row[3], {"name": row[3], "retryable": True})
        failures.append({
            "url": row[0],
            "domain": row[1],
            "source_name": row[2],
            "reason": row[3],
            "reason_name": reason_info["name"],
            "retryable": reason_info["retryable"],
            "error_detail": row[4],
            "attempt_count": row[5],
            "first_failed_at": row[6],
            "last_failed_at": row[7]
        })
    
    return {"ok": True, "failures": failures}


@router.post("/record")
async def record_failure(
    request: Request,
    url: str = Body(...),
    reason: str = Body(...),
    error_detail: str = Body(None),
    source_id: str = Body(None),
    source_name: str = Body(None)
):
    """
    记录总结失败（供前端调用）
    
    Body:
        url: 失败的 URL
        reason: 失败原因代码
        error_detail: 详细错误信息
        source_id: RSS 源 ID
        source_name: RSS 源名称
    """
    from hotnews.kernel.services.summary_failure_tracker import record_summary_failure
    
    # 获取用户（可选，未登录也可以记录）
    user_id = None
    try:
        user = _get_current_user(request)
        user_id = user.get("id")
    except:
        pass
    
    conn = _get_online_db_conn(request)
    
    try:
        record_summary_failure(
            conn=conn,
            url=url,
            reason=reason,
            error_detail=error_detail,
            fetch_method="client",
            user_id=user_id,
            source_id=source_id,
            source_name=source_name
        )
        return {"ok": True, "message": "已记录"}
    except Exception as e:
        logging.warning(f"Failed to record failure: {e}")
        return {"ok": False, "error": str(e)}
