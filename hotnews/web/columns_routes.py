"""
Columns Routes

/api/columns — 返回栏目树（来自 column_config 表）
支持一/二/三级递归结构，按 sort_order 排序。
"""

import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter

from hotnews.web.deps import UnicodeJSONResponse, get_online_db

router = APIRouter()


def _parse_source_filter(source_filter_str: str) -> Dict[str, Any]:
    try:
        return json.loads(source_filter_str or "{}")
    except Exception:
        return {}


def _build_tree(rows) -> List[Dict[str, Any]]:
    """将扁平行列表组装成递归树，支持任意深度。"""
    by_parent: Dict[Optional[str], List[Dict]] = {}
    for row in rows:
        node = _row_to_node(row)
        pid = node["_parent_id"]
        by_parent.setdefault(pid, []).append(node)

    def attach_children(nodes: List[Dict]) -> List[Dict]:
        result = []
        for node in nodes:
            nid = node["id"]
            children = by_parent.get(nid, [])
            if children:
                node["children"] = attach_children(children)
            else:
                node["children"] = []
            # Remove internal key
            del node["_parent_id"]
            result.append(node)
        return result

    roots = by_parent.get(None, [])
    return attach_children(roots)


def _row_to_node(row) -> Dict[str, Any]:
    sf = _parse_source_filter(row["source_filter"])
    tag_ids_raw = row["tag_ids"] or "[]"
    try:
        tag_ids = json.loads(tag_ids_raw)
    except Exception:
        tag_ids = []

    return {
        "id": row["id"],
        "name": row["name"],
        "icon": row["icon"] or "",
        "tag_ids": tag_ids,
        "default_view": row["default_view"] or "timeline",
        "sort_order": row["sort_order"] or 0,
        "require_login": bool(sf.get("require_login", False)),
        "fixed_view": sf.get("fixed_view") or None,
        # Internal — removed before returning
        "_parent_id": row["parent_id"],
    }


@router.get("/api/columns")
async def api_columns():
    """返回所有启用栏目的递归树结构。"""
    conn = get_online_db()
    rows = conn.execute(
        """
        SELECT id, name, icon, parent_id, tag_ids,
               source_type, source_filter, default_view,
               sort_order, enabled
        FROM column_config
        WHERE enabled = 1
        ORDER BY sort_order ASC, id ASC
        """
    ).fetchall()

    tree = _build_tree(rows)

    return UnicodeJSONResponse(
        content={"columns": tree},
        headers={"Cache-Control": "public, max-age=60"},
    )
