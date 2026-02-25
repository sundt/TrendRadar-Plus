"""
Dedup Admin API — 跨源去重管理接口

提供去重统计、批量扫描触发、Source Group 管理、手动去重操作等。
"""

import time
from typing import Any, Dict

from fastapi import APIRouter, Body, Depends, Query, Request

router = APIRouter(prefix="/api/admin/dedup", tags=["dedup"])


def _get_conn(request: Request):
    from hotnews.web.deps import get_online_db
    return get_online_db()


def _get_engine(request: Request):
    from hotnews.kernel.services.dedup_engine import DedupEngine
    return DedupEngine(_get_conn(request))


# ------------------------------------------------------------------
# Stats
# ------------------------------------------------------------------

@router.get("/stats")
async def dedup_stats(request: Request):
    """去重统计概览"""
    engine = _get_engine(request)
    return engine.get_stats()


# ------------------------------------------------------------------
# Scan & Backfill
# ------------------------------------------------------------------

@router.post("/scan")
async def dedup_scan(
    request: Request,
    days: int = Body(30),
    dry_run: bool = Body(True),
):
    """触发批量去重扫描"""
    engine = _get_engine(request)
    result = engine.batch_scan(days=days, dry_run=dry_run)
    return result


@router.post("/backfill")
async def dedup_backfill(request: Request):
    """触发 fingerprint 回填"""
    engine = _get_engine(request)
    result = engine.backfill_fingerprints()
    return result


# ------------------------------------------------------------------
# Manual dedup link
# ------------------------------------------------------------------

@router.post("/link")
async def dedup_link(
    request: Request,
    canonical_source_id: str = Body(...),
    canonical_dedup_key: str = Body(...),
    dup_source_id: str = Body(...),
    dup_dedup_key: str = Body(...),
):
    """手动标记两篇文章为重复"""
    conn = _get_conn(request)
    now_ts = int(time.time())
    try:
        # 获取 dup 文章信息
        row = conn.execute(
            "SELECT title, url, published_at FROM rss_entries WHERE source_id = ? AND dedup_key = ?",
            (dup_source_id, dup_dedup_key),
        ).fetchone()
        dup_title = str(row[0] or "") if row else ""
        dup_url = str(row[1] or "") if row else ""
        dup_pub = int(row[2] or 0) if row else 0

        conn.execute(
            """INSERT OR IGNORE INTO cross_source_dedup
               (canonical_source_id, canonical_dedup_key,
                dup_source_id, dup_dedup_key,
                match_type, similarity_score,
                dup_title, dup_url, dup_published_at, detected_at)
               VALUES (?, ?, ?, ?, 'manual', 1.0, ?, ?, ?, ?)""",
            (canonical_source_id, canonical_dedup_key,
             dup_source_id, dup_dedup_key,
             dup_title, dup_url, dup_pub, now_ts),
        )
        conn.commit()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.delete("/link")
async def dedup_unlink(
    request: Request,
    canonical_source_id: str = Query(...),
    canonical_dedup_key: str = Query(...),
    dup_source_id: str = Query(...),
    dup_dedup_key: str = Query(...),
):
    """取消两篇文章的重复标记"""
    conn = _get_conn(request)
    try:
        conn.execute(
            """DELETE FROM cross_source_dedup
               WHERE canonical_source_id = ? AND canonical_dedup_key = ?
                 AND dup_source_id = ? AND dup_dedup_key = ?""",
            (canonical_source_id, canonical_dedup_key,
             dup_source_id, dup_dedup_key),
        )
        conn.commit()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ------------------------------------------------------------------
# Source Groups
# ------------------------------------------------------------------

@router.get("/source-groups")
async def list_source_groups(request: Request):
    """列出所有 Source Group"""
    conn = _get_conn(request)
    try:
        groups = []
        for g in conn.execute("SELECT id, group_name, created_at FROM source_groups ORDER BY id").fetchall():
            gid = int(g[0])
            members = conn.execute(
                "SELECT source_id FROM source_group_members WHERE group_id = ?", (gid,)
            ).fetchall()
            groups.append({
                "id": gid,
                "name": str(g[1]),
                "created_at": int(g[2] or 0),
                "sources": [str(m[0]) for m in members],
            })
        return {"groups": groups}
    except Exception as e:
        return {"error": str(e)}


@router.post("/source-groups")
async def create_source_group(
    request: Request,
    group_name: str = Body(...),
    source_ids: list = Body(default=[]),
):
    """创建 Source Group"""
    conn = _get_conn(request)
    now_ts = int(time.time())
    try:
        conn.execute(
            "INSERT INTO source_groups (group_name, created_at, updated_at) VALUES (?, ?, ?)",
            (group_name, now_ts, now_ts),
        )
        gid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        for sid in source_ids:
            conn.execute(
                "INSERT OR IGNORE INTO source_group_members (group_id, source_id, created_at) VALUES (?, ?, ?)",
                (gid, str(sid), now_ts),
            )
        conn.commit()
        return {"success": True, "group_id": gid}
    except Exception as e:
        return {"success": False, "error": str(e)}
