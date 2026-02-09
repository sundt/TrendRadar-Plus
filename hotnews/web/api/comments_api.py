"""
Article Comments API
评论 CRUD、Emoji 反应、文章统计
"""
import hashlib
import time
import sqlite3
from typing import Optional, Dict, Any, List, Tuple

from fastapi import APIRouter, Request, HTTPException, Body
from starlette.responses import JSONResponse

router = APIRouter(prefix="/api/comments", tags=["comments"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_ts() -> int:
    return int(time.time())


def _sha256(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def _normalize_url(url: str) -> str:
    """去除 query 和 fragment，保留 scheme + host + path"""
    from urllib.parse import urlparse, urlunparse
    p = urlparse(url)
    return urlunparse((p.scheme, p.netloc, p.path, "", "", ""))


def _get_online_db(request: Request) -> sqlite3.Connection:
    from hotnews.web.db_online import get_online_db_conn
    return get_online_db_conn(request.app.state.project_root)


def _resolve_user(request: Request) -> Optional[Dict[str, Any]]:
    """从 session cookie 解析当前登录用户"""
    try:
        from hotnews.kernel.auth.auth_api import _get_session_token
        from hotnews.kernel.auth.auth_service import validate_session
        from hotnews.web.user_db import get_user_db_conn
        token = _get_session_token(request)
        if not token:
            return None
        user_conn = get_user_db_conn(request.app.state.project_root)
        is_valid, user_info = validate_session(user_conn, token)
        if is_valid and user_info:
            return user_info
    except Exception:
        pass
    return None


def _require_user(request: Request) -> Dict[str, Any]:
    user = _resolve_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="请先登录")
    return user


def _json(data: Any, status_code: int = 200) -> JSONResponse:
    import json as _json
    return JSONResponse(
        content=data,
        status_code=status_code,
        media_type="application/json",
    )


# ---------------------------------------------------------------------------
# POST /api/comments  —  创建评论（选中内容或全文评论）
# ---------------------------------------------------------------------------

@router.post("")
async def create_comment(request: Request):
    user = _require_user(request)
    data = await request.json()

    article_url = str(data.get("article_url") or "").strip()
    if not article_url:
        raise HTTPException(status_code=400, detail="article_url is required")

    content = str(data.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="content is required")

    norm_url = _normalize_url(article_url)
    url_hash = _sha256(norm_url)
    now = _now_ts()

    conn = _get_online_db(request)
    cur = conn.execute(
        """
        INSERT INTO article_comments
            (article_url, article_url_hash, article_title,
             selected_text, text_xpath, text_start_offset, text_end_offset,
             text_context_before, text_context_after,
             content, parent_id, root_id,
             user_id, user_name, user_avatar,
             status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, 'active', ?, ?)
        """,
        (
            norm_url,
            url_hash,
            str(data.get("article_title") or "")[:200],
            str(data.get("selected_text") or ""),
            str(data.get("text_xpath") or ""),
            int(data.get("text_start_offset") or 0),
            int(data.get("text_end_offset") or 0),
            str(data.get("text_context_before") or ""),
            str(data.get("text_context_after") or ""),
            content[:2000],
            int(user.get("id", 0)),
            str(user.get("nickname") or user.get("email") or ""),
            str(user.get("avatar_url") or ""),
            now,
            now,
        ),
    )
    conn.commit()
    comment_id = cur.lastrowid

    return _json({"success": True, "data": {"id": comment_id}})


# ---------------------------------------------------------------------------
# GET /api/comments?url={url}  —  获取文章所有评论
# GET /api/comments?url_hash={hash}&summary=1  —  评论摘要
# ---------------------------------------------------------------------------

@router.get("")
async def get_comments(request: Request):
    url = (request.query_params.get("url") or "").strip()
    url_hash = (request.query_params.get("url_hash") or "").strip()
    summary = request.query_params.get("summary") == "1"

    if url:
        url_hash = _sha256(_normalize_url(url))
    if not url_hash:
        raise HTTPException(status_code=400, detail="url or url_hash is required")

    conn = _get_online_db(request)
    conn.row_factory = sqlite3.Row

    # 当前用户（可选，用于判断 liked_by_me）
    user = _resolve_user(request)
    user_id = int(user.get("id", 0)) if user else 0

    if summary:
        return _get_comments_summary(conn, url_hash, user_id)

    return _get_comments_full(conn, url_hash, user_id)


def _get_comments_summary(conn: sqlite3.Connection, url_hash: str, user_id: int) -> JSONResponse:
    """轻量摘要：评论数 + 最新 3 条顶级评论"""
    count_row = conn.execute(
        "SELECT COUNT(*) FROM article_comments WHERE article_url_hash = ? AND status = 'active'",
        (url_hash,),
    ).fetchone()
    total = count_row[0] if count_row else 0

    rows = conn.execute(
        """
        SELECT id, content, selected_text, user_name, user_avatar, created_at
        FROM article_comments
        WHERE article_url_hash = ? AND status = 'active' AND parent_id = 0
        ORDER BY created_at DESC LIMIT 3
        """,
        (url_hash,),
    ).fetchall()

    latest = []
    for r in rows:
        # 获取 emoji 反应汇总
        reactions = _get_reactions_summary(conn, r["id"])
        latest.append({
            "id": r["id"],
            "content": r["content"],
            "selected_text": r["selected_text"],
            "user_name": r["user_name"],
            "user_avatar": r["user_avatar"],
            "created_at": r["created_at"],
            "reactions": reactions,
        })

    # 阅读统计
    view_row = conn.execute(
        "SELECT COUNT(DISTINCT user_id) FROM article_view_stats WHERE article_url_hash = ? AND view_type = 'view'",
        (url_hash,),
    ).fetchone()
    view_count = view_row[0] if view_row else 0

    summary_row = conn.execute(
        "SELECT COUNT(DISTINCT user_id) FROM article_view_stats WHERE article_url_hash = ? AND view_type = 'summary'",
        (url_hash,),
    ).fetchone()
    summary_count = summary_row[0] if summary_row else 0

    return _json({
        "success": True,
        "data": {
            "count": total,
            "view_count": view_count,
            "summary_count": summary_count,
            "latest": latest,
        },
    })


def _get_comments_full(conn: sqlite3.Connection, url_hash: str, user_id: int) -> JSONResponse:
    """完整评论列表（含回复树）"""
    rows = conn.execute(
        """
        SELECT id, content, selected_text, text_xpath,
               text_start_offset, text_end_offset,
               text_context_before, text_context_after,
               parent_id, root_id,
               reply_to_user_id, reply_to_user_name,
               user_id, user_name, user_avatar,
               like_count, reply_count,
               created_at, updated_at
        FROM article_comments
        WHERE article_url_hash = ? AND status = 'active'
        ORDER BY created_at ASC
        """,
        (url_hash,),
    ).fetchall()

    # 构建评论树
    comments_map: Dict[int, Dict] = {}
    top_level: List[Dict] = []

    for r in rows:
        reactions = _get_reactions_summary(conn, r["id"])
        my_reactions = _get_user_reactions(conn, r["id"], user_id) if user_id else []

        comment = {
            "id": r["id"],
            "content": r["content"],
            "selected_text": r["selected_text"],
            "text_position": {
                "xpath": r["text_xpath"],
                "start_offset": r["text_start_offset"],
                "end_offset": r["text_end_offset"],
                "context_before": r["text_context_before"],
                "context_after": r["text_context_after"],
            } if r["selected_text"] else None,
            "parent_id": r["parent_id"],
            "reply_to_user_name": r["reply_to_user_name"],
            "user_id": r["user_id"],
            "user_name": r["user_name"],
            "user_avatar": r["user_avatar"],
            "like_count": r["like_count"],
            "reply_count": r["reply_count"],
            "reactions": reactions,
            "my_reactions": my_reactions,
            "created_at": r["created_at"],
            "replies": [],
        }
        comments_map[r["id"]] = comment

        if r["parent_id"] == 0:
            top_level.append(comment)
        else:
            parent = comments_map.get(r["parent_id"])
            if parent:
                parent["replies"].append(comment)

    return _json({"success": True, "data": top_level})


# ---------------------------------------------------------------------------
# DELETE /api/comments/{comment_id}  —  删除评论（软删除，仅作者）
# ---------------------------------------------------------------------------

@router.delete("/{comment_id}")
async def delete_comment(request: Request, comment_id: int):
    user = _require_user(request)
    user_id = int(user.get("id", 0))

    conn = _get_online_db(request)
    row = conn.execute(
        "SELECT user_id FROM article_comments WHERE id = ? AND status = 'active'",
        (comment_id,),
    ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="评论不存在")
    if row[0] != user_id:
        raise HTTPException(status_code=403, detail="只能删除自己的评论")

    conn.execute(
        "UPDATE article_comments SET status = 'deleted', updated_at = ? WHERE id = ?",
        (_now_ts(), comment_id),
    )
    conn.commit()

    return _json({"success": True})


# ---------------------------------------------------------------------------
# Emoji reactions helpers
# ---------------------------------------------------------------------------

def _get_reactions_summary(conn: sqlite3.Connection, comment_id: int) -> Dict[str, int]:
    """获取某条评论的 emoji 反应汇总 {emoji: count}"""
    rows = conn.execute(
        "SELECT emoji, COUNT(*) as cnt FROM article_comment_reactions WHERE comment_id = ? GROUP BY emoji",
        (comment_id,),
    ).fetchall()
    return {r["emoji"]: r["cnt"] for r in rows} if rows else {}


def _get_user_reactions(conn: sqlite3.Connection, comment_id: int, user_id: int) -> List[str]:
    """获取当前用户对某条评论的 emoji 列表"""
    rows = conn.execute(
        "SELECT emoji FROM article_comment_reactions WHERE comment_id = ? AND user_id = ?",
        (comment_id, user_id),
    ).fetchall()
    return [r["emoji"] for r in rows] if rows else []


# ---------------------------------------------------------------------------
# POST /api/comments/{comment_id}/react  —  添加/移除 emoji 反应
# ---------------------------------------------------------------------------

ALLOWED_EMOJIS = {"👍", "🔥", "😂", "🤔", "❤️", "👀", "🎉", "💯"}


@router.post("/{comment_id}/react")
async def toggle_reaction(request: Request, comment_id: int):
    user = _require_user(request)
    user_id = int(user.get("id", 0))
    data = await request.json()

    emoji = str(data.get("emoji") or "").strip()
    if emoji not in ALLOWED_EMOJIS:
        raise HTTPException(status_code=400, detail=f"不支持的 emoji，可选: {', '.join(ALLOWED_EMOJIS)}")

    conn = _get_online_db(request)

    # 检查评论是否存在
    row = conn.execute(
        "SELECT id FROM article_comments WHERE id = ? AND status = 'active'",
        (comment_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="评论不存在")

    # 切换：已有则删除，没有则添加
    existing = conn.execute(
        "SELECT 1 FROM article_comment_reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?",
        (comment_id, user_id, emoji),
    ).fetchone()

    if existing:
        conn.execute(
            "DELETE FROM article_comment_reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?",
            (comment_id, user_id, emoji),
        )
        added = False
    else:
        conn.execute(
            "INSERT INTO article_comment_reactions (comment_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)",
            (comment_id, user_id, emoji, _now_ts()),
        )
        added = True

    conn.commit()

    # 返回最新的反应汇总
    conn.row_factory = sqlite3.Row
    reactions = _get_reactions_summary(conn, comment_id)

    return _json({"success": True, "added": added, "reactions": reactions})


# ---------------------------------------------------------------------------
# Article stats routes (挂在独立前缀)
# ---------------------------------------------------------------------------

stats_router = APIRouter(prefix="/api/articles", tags=["article-stats"])


@stats_router.get("/stats")
async def get_article_stats(request: Request):
    """获取文章的阅读人数、总结人数、评论数"""
    url_hash = (request.query_params.get("url_hash") or "").strip()
    url = (request.query_params.get("url") or "").strip()

    if url:
        url_hash = _sha256(_normalize_url(url))
    if not url_hash:
        raise HTTPException(status_code=400, detail="url or url_hash is required")

    conn = _get_online_db(request)

    view_row = conn.execute(
        "SELECT COUNT(DISTINCT user_id) FROM article_view_stats WHERE article_url_hash = ? AND view_type = 'view'",
        (url_hash,),
    ).fetchone()

    summary_row = conn.execute(
        "SELECT COUNT(DISTINCT user_id) FROM article_view_stats WHERE article_url_hash = ? AND view_type = 'summary'",
        (url_hash,),
    ).fetchone()

    comment_row = conn.execute(
        "SELECT COUNT(*) FROM article_comments WHERE article_url_hash = ? AND status = 'active'",
        (url_hash,),
    ).fetchone()

    return _json({
        "success": True,
        "data": {
            "view_count": view_row[0] if view_row else 0,
            "summary_count": summary_row[0] if summary_row else 0,
            "comment_count": comment_row[0] if comment_row else 0,
        },
    })


@stats_router.post("/view")
async def record_article_view(request: Request):
    """记录阅读/总结行为"""
    user = _resolve_user(request)
    if not user:
        # 未登录也记录，用 user_id=0
        user_id = 0
    else:
        user_id = int(user.get("id", 0))

    data = await request.json()
    url = str(data.get("url") or "").strip()
    url_hash = str(data.get("url_hash") or "").strip()
    view_type = str(data.get("view_type") or "view").strip()

    if url:
        url_hash = _sha256(_normalize_url(url))
    if not url_hash:
        raise HTTPException(status_code=400, detail="url or url_hash is required")
    if view_type not in ("view", "summary"):
        raise HTTPException(status_code=400, detail="view_type must be 'view' or 'summary'")

    now = _now_ts()
    conn = _get_online_db(request)

    # UPSERT: 存在则更新 last_seen_at，不存在则插入
    conn.execute(
        """
        INSERT INTO article_view_stats (article_url_hash, user_id, view_type, first_seen_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(article_url_hash, user_id, view_type)
        DO UPDATE SET last_seen_at = ?
        """,
        (url_hash, user_id, view_type, now, now, now),
    )
    conn.commit()

    return _json({"success": True})
