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

@router.post("/purge")
async def dedup_purge(
    request: Request,
    limit: int = Body(default=0, embed=True),
):
    """对已记录但未删除的重复文章执行物理删除"""
    engine = _get_engine(request)
    conn = _get_conn(request)
    try:
        query = """SELECT canonical_source_id, canonical_dedup_key,
                          dup_source_id, dup_dedup_key, dup_title, dup_url, dup_published_at
                   FROM cross_source_dedup
                   WHERE deleted_at = 0"""
        params: list = []
        if limit > 0:
            query += " LIMIT ?"
            params.append(limit)
        rows = conn.execute(query, params).fetchall()
        deleted = 0
        now_ts = int(time.time())
        for r in rows:
            canonical = {
                "source_id": str(r[0]), "dedup_key": str(r[1]),
                "url": "", "title": "", "published_at": 0, "description": "",
            }
            # 获取 canonical 的 url 用于摘要迁移
            crow = conn.execute(
                "SELECT url FROM rss_entries WHERE source_id = ? AND dedup_key = ?",
                (r[0], r[1]),
            ).fetchone()
            if crow:
                canonical["url"] = str(crow[0] or "")
            dup = {
                "source_id": str(r[2]), "dedup_key": str(r[3]),
                "title": str(r[4] or ""), "url": str(r[5] or ""),
                "published_at": int(r[6] or 0), "description": "",
            }
            # 检查 dup 文章是否还存在
            exists = conn.execute(
                "SELECT 1 FROM rss_entries WHERE source_id = ? AND dedup_key = ? LIMIT 1",
                (dup["source_id"], dup["dedup_key"]),
            ).fetchone()
            if exists:
                engine._physical_delete(canonical, dup, now_ts)
                deleted += 1
            else:
                # 文章已不存在，直接标记 deleted_at
                conn.execute(
                    "UPDATE cross_source_dedup SET deleted_at = ? WHERE dup_source_id = ? AND dup_dedup_key = ? AND deleted_at = 0",
                    (now_ts, dup["source_id"], dup["dedup_key"]),
                )
                conn.commit()
                deleted += 1
        return {"total_pending": len(rows), "deleted": deleted}
    except Exception as e:
        return {"error": str(e)}


@router.get("/pairs")
async def dedup_pairs(
    request: Request,
    match_type: str = Query(default=""),
    limit: int = Query(default=20),
    offset: int = Query(default=0),
):
    """查看重复对详情，用于人工抽查验证"""
    conn = _get_conn(request)
    try:
        where = "WHERE 1=1"
        params: list = []
        if match_type:
            where += " AND d.match_type = ?"
            params.append(match_type)

        rows = conn.execute(
            f"""SELECT d.canonical_source_id, d.canonical_dedup_key,
                       d.dup_source_id, d.dup_dedup_key,
                       d.match_type, d.similarity_score,
                       d.dup_title, d.dup_url, d.dup_published_at,
                       d.detected_at, d.deleted_at,
                       c.title as canonical_title, c.url as canonical_url,
                       c.published_at as canonical_published_at,
                       cs.name as canonical_source_name,
                       ds.name as dup_source_name
                FROM cross_source_dedup d
                LEFT JOIN rss_entries c
                  ON c.source_id = d.canonical_source_id
                 AND c.dedup_key = d.canonical_dedup_key
                LEFT JOIN rss_sources cs ON cs.id = d.canonical_source_id
                LEFT JOIN rss_sources ds ON ds.id = d.dup_source_id
                {where}
                ORDER BY d.detected_at DESC
                LIMIT ? OFFSET ?""",
            (*params, limit, offset),
        ).fetchall()

        pairs = []
        for r in rows:
            pairs.append({
                "canonical": {
                    "source_id": str(r[0]),
                    "source_name": str(r[14] or r[0]),
                    "title": str(r[11] or ""),
                    "url": str(r[12] or ""),
                    "published_at": int(r[13] or 0),
                },
                "duplicate": {
                    "source_id": str(r[2]),
                    "source_name": str(r[15] or r[2]),
                    "title": str(r[6] or ""),
                    "url": str(r[7] or ""),
                    "published_at": int(r[8] or 0),
                },
                "match_type": str(r[4]),
                "similarity": float(r[5] or 0),
                "detected_at": int(r[9] or 0),
                "deleted": int(r[10] or 0) > 0,
            })

        total = conn.execute(
            f"SELECT COUNT(*) FROM cross_source_dedup d {where}", params
        ).fetchone()[0]

        return {"total": total, "pairs": pairs}
    except Exception as e:
        return {"error": str(e)}



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
