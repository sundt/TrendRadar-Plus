"""
Todo API - 用户待办事项管理
"""
import time
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel


router = APIRouter(prefix="/api/user/todos", tags=["todos"])


def _now_ts() -> int:
    return int(time.time())


def _get_user_db_conn(request: Request):
    """Get user database connection from request app state."""
    from hotnews.web.user_db import get_user_db_conn
    return get_user_db_conn(request.app.state.project_root)


from hotnews.kernel.auth.deps import get_current_user as _get_current_user


def _ensure_todos_table(conn):
    """Ensure the todos table exists."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS user_todos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            text TEXT NOT NULL,
            done INTEGER DEFAULT 0,
            group_id TEXT NOT NULL,
            group_title TEXT NOT NULL,
            group_url TEXT DEFAULT '',
            is_custom_group INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            UNIQUE(user_id, group_id, text)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_todos_user ON user_todos(user_id)")
    conn.commit()


# ============ Request/Response Models ============

class TodoCreate(BaseModel):
    text: str
    group_id: str
    group_title: str
    group_url: Optional[str] = ""
    is_custom_group: bool = False


class TodoUpdate(BaseModel):
    done: Optional[bool] = None
    text: Optional[str] = None


class TodoBatchCreate(BaseModel):
    todos: List[TodoCreate]


# ============ API Endpoints ============

@router.get("")
async def get_todos(
    request: Request,
    done: Optional[bool] = Query(None, description="Filter by done status"),
    group_id: Optional[str] = Query(None, description="Filter by group_id")
):
    """获取用户所有 Todo"""
    user = _get_current_user(request)
    conn = _get_user_db_conn(request)
    _ensure_todos_table(conn)
    
    sql = """
        SELECT id, text, done, group_id, group_title, group_url, is_custom_group, created_at, updated_at
        FROM user_todos
        WHERE user_id = ?
    """
    params = [user["id"]]
    
    if done is not None:
        sql += " AND done = ?"
        params.append(1 if done else 0)
    
    if group_id:
        sql += " AND group_id = ?"
        params.append(group_id)
    
    sql += " ORDER BY created_at DESC"
    
    cur = conn.execute(sql, params)
    rows = cur.fetchall() or []
    
    todos = []
    for row in rows:
        todos.append({
            "id": row[0],
            "text": row[1],
            "done": bool(row[2]),
            "source": {
                "groupId": row[3],
                "groupTitle": row[4],
                "groupUrl": row[5] or "",
                "isCustom": bool(row[6])
            },
            "createdAt": row[7],
            "updatedAt": row[8]
        })
    
    return {"ok": True, "todos": todos, "total": len(todos)}


@router.post("")
async def create_todo(request: Request, data: TodoCreate):
    """添加 Todo"""
    user = _get_current_user(request)
    conn = _get_user_db_conn(request)
    _ensure_todos_table(conn)
    
    text = (data.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Todo 内容不能为空")
    
    group_id = (data.group_id or "").strip()
    group_title = (data.group_title or "").strip()
    if not group_id or not group_title:
        raise HTTPException(status_code=400, detail="分组信息不完整")
    
    now = _now_ts()
    
    try:
        conn.execute(
            """
            INSERT INTO user_todos (user_id, text, done, group_id, group_title, group_url, is_custom_group, created_at, updated_at)
            VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?)
            """,
            (user["id"], text, group_id, group_title, data.group_url or "", 1 if data.is_custom_group else 0, now, now)
        )
        conn.commit()
        todo_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    except Exception as e:
        if "UNIQUE constraint failed" in str(e):
            raise HTTPException(status_code=409, detail="该 Todo 已存在")
        raise HTTPException(status_code=500, detail=str(e))
    
    return {
        "ok": True,
        "todo": {
            "id": todo_id,
            "text": text,
            "done": False,
            "source": {
                "groupId": group_id,
                "groupTitle": group_title,
                "groupUrl": data.group_url or "",
                "isCustom": data.is_custom_group
            },
            "createdAt": now,
            "updatedAt": now
        }
    }


@router.put("/{todo_id}")
async def update_todo(request: Request, todo_id: int, data: TodoUpdate):
    """更新 Todo（勾选/取消）"""
    user = _get_current_user(request)
    conn = _get_user_db_conn(request)
    _ensure_todos_table(conn)
    
    # Check ownership
    cur = conn.execute(
        "SELECT id FROM user_todos WHERE id = ? AND user_id = ?",
        (todo_id, user["id"])
    )
    if not cur.fetchone():
        raise HTTPException(status_code=404, detail="Todo 不存在")
    
    now = _now_ts()
    updates = []
    params = []
    
    if data.done is not None:
        updates.append("done = ?")
        params.append(1 if data.done else 0)
    
    if data.text is not None:
        text = data.text.strip()
        if not text:
            raise HTTPException(status_code=400, detail="Todo 内容不能为空")
        updates.append("text = ?")
        params.append(text)
    
    if not updates:
        raise HTTPException(status_code=400, detail="没有要更新的内容")
    
    updates.append("updated_at = ?")
    params.append(now)
    params.append(todo_id)
    params.append(user["id"])
    
    conn.execute(
        f"UPDATE user_todos SET {', '.join(updates)} WHERE id = ? AND user_id = ?",
        params
    )
    conn.commit()
    
    return {"ok": True, "updated_at": now}


@router.delete("/{todo_id}")
async def delete_todo(request: Request, todo_id: int):
    """删除 Todo"""
    user = _get_current_user(request)
    conn = _get_user_db_conn(request)
    _ensure_todos_table(conn)
    
    cur = conn.execute(
        "DELETE FROM user_todos WHERE id = ? AND user_id = ?",
        (todo_id, user["id"])
    )
    conn.commit()
    
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Todo 不存在")
    
    return {"ok": True}


@router.post("/batch")
async def batch_create_todos(request: Request, data: TodoBatchCreate):
    """批量添加 Todo（行动清单一键添加）"""
    user = _get_current_user(request)
    conn = _get_user_db_conn(request)
    _ensure_todos_table(conn)
    
    if not data.todos:
        raise HTTPException(status_code=400, detail="没有要添加的 Todo")
    
    now = _now_ts()
    added = []
    skipped = []
    
    for item in data.todos:
        text = (item.text or "").strip()
        if not text:
            continue
        
        group_id = (item.group_id or "").strip()
        group_title = (item.group_title or "").strip()
        if not group_id or not group_title:
            continue
        
        try:
            conn.execute(
                """
                INSERT INTO user_todos (user_id, text, done, group_id, group_title, group_url, is_custom_group, created_at, updated_at)
                VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?)
                """,
                (user["id"], text, group_id, group_title, item.group_url or "", 1 if item.is_custom_group else 0, now, now)
            )
            todo_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            added.append({
                "id": todo_id,
                "text": text,
                "done": False,
                "source": {
                    "groupId": group_id,
                    "groupTitle": group_title,
                    "groupUrl": item.group_url or "",
                    "isCustom": item.is_custom_group
                },
                "createdAt": now,
                "updatedAt": now
            })
        except Exception as e:
            if "UNIQUE constraint failed" in str(e):
                skipped.append(text)
            else:
                raise HTTPException(status_code=500, detail=str(e))
    
    conn.commit()
    
    return {
        "ok": True,
        "added": added,
        "added_count": len(added),
        "skipped_count": len(skipped)
    }
