import time
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from hotnews.web.db_online import get_online_db_conn


router = APIRouter()


def _conn_from_request(request: Request):
    return get_online_db_conn(project_root=request.app.state.project_root)


@router.post("/api/online/ping")
async def online_ping(request: Request):
    body = {}
    try:
        body = await request.json()
    except Exception:
        body = {}

    session_id = (body.get("session_id") or "").strip()
    if not session_id:
        return JSONResponse(content={"detail": "Missing session_id"}, status_code=400)

    now = int(time.time())
    conn = _conn_from_request(request)
    conn.execute(
        "INSERT OR REPLACE INTO online_sessions(session_id, last_seen) VALUES (?, ?)",
        (session_id, now),
    )
    # Batch delete expired sessions to avoid locking table on large deletes
    while True:
        cur = conn.execute(
            "DELETE FROM online_sessions WHERE rowid IN (SELECT rowid FROM online_sessions WHERE last_seen < ? LIMIT 500)",
            (now - 86400,),
        )
        conn.commit()
        if cur.rowcount < 500:
            break

    return JSONResponse(content={"ok": True})


@router.get("/api/online")
async def online_stats(request: Request):
    now = int(time.time())
    conn = _conn_from_request(request)

    # Single query for all time windows
    cur = conn.execute(
        """
        SELECT
            SUM(CASE WHEN last_seen >= ? THEN 1 ELSE 0 END),
            SUM(CASE WHEN last_seen >= ? THEN 1 ELSE 0 END),
            SUM(CASE WHEN last_seen >= ? THEN 1 ELSE 0 END)
        FROM online_sessions
        """,
        (now - 60, now - 300, now - 900),
    )
    row = cur.fetchone() or (0, 0, 0)
    stats: dict[str, Any] = {
        "online_1m": int(row[0] or 0),
        "online_5m": int(row[1] or 0),
        "online_15m": int(row[2] or 0),
        "server_time": now,
    }

    return JSONResponse(content=stats)
