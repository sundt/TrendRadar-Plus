"""统一 AI 过滤模块

基于 rss_entry_ai_labels 和 rss_entry_tags 表的标注结果，
对文章列表进行分类感知的内容过滤。
"""

import sqlite3
from typing import Any, Dict, List, Optional, Set, Tuple

# 分类 → AI 映射配置
CATEGORY_AI_MAPPING: Dict[str, Dict[str, Set[str]]] = {
    "finance": {
        "ai_categories": {"finance", "business"},
        "relevant_tags": {
            "finance", "stock", "macro", "crypto", "real_estate",
            "ecommerce", "startup", "business", "commodity",
            "ipo", "gold_price", "insurance", "banking",
        },
    },
    "ai": {
        "ai_categories": {"tech"},
        "relevant_tags": {"ai", "llm", "machine_learning", "deep_learning", "gpt", "model"},
    },
    "tech_news": {
        "ai_categories": {"tech"},
        "relevant_tags": {"tech", "software", "hardware", "programming", "cloud", "startup"},
    },
}


def _batch_fetch_ai_labels(
    conn: sqlite3.Connection,
    keys: List[Tuple[str, str]],
    batch_size: int = 500,
) -> Dict[Tuple[str, str], Dict]:
    """批量查询 AI 标注数据，分批避免 SQLite 变量数限制。"""
    if not keys:
        return {}
    result: Dict[Tuple[str, str], Dict] = {}
    for i in range(0, len(keys), batch_size):
        batch = keys[i:i + batch_size]
        # 构建 (source_id, dedup_key) IN (...) 查询
        placeholders = ",".join(["(?,?)"] * len(batch))
        params: list = []
        for sid, dk in batch:
            params.extend([sid, dk])
        sql = f"""
            SELECT source_id, dedup_key, action, category, score, confidence
            FROM rss_entry_ai_labels
            WHERE (source_id, dedup_key) IN ({placeholders})
        """
        try:
            cur = conn.execute(sql, params)
            for row in cur.fetchall():
                key = (str(row[0]), str(row[1]))
                result[key] = {
                    "action": str(row[2] or "").strip().lower(),
                    "category": str(row[3] or "").strip().lower(),
                    "score": int(row[4] or 0),
                    "confidence": float(row[5] or 0.0),
                }
        except Exception:
            pass
    return result


def _batch_fetch_tags(
    conn: sqlite3.Connection,
    keys: List[Tuple[str, str]],
    batch_size: int = 500,
) -> Dict[Tuple[str, str], Set[str]]:
    """批量查询文章标签，分批避免 SQLite 变量数限制。"""
    if not keys:
        return {}
    result: Dict[Tuple[str, str], Set[str]] = {}
    for i in range(0, len(keys), batch_size):
        batch = keys[i:i + batch_size]
        placeholders = ",".join(["(?,?)"] * len(batch))
        params: list = []
        for sid, dk in batch:
            params.extend([sid, dk])
        sql = f"""
            SELECT source_id, dedup_key, tag_id
            FROM rss_entry_tags
            WHERE (source_id, dedup_key) IN ({placeholders})
        """
        try:
            cur = conn.execute(sql, params)
            for row in cur.fetchall():
                key = (str(row[0]), str(row[1]))
                tag = str(row[2] or "").strip().lower()
                if tag:
                    result.setdefault(key, set()).add(tag)
        except Exception:
            pass
    return result


def _should_keep(
    label: Optional[Dict],
    tags: Set[str],
    mapping: Optional[Dict],
) -> Tuple[bool, str]:
    """判断单篇文章是否保留。

    决策规则：
    1. 无 mapping（分类未配置）→ 保留
    2. 无 label（无 AI 标注）→ 保留
    3. action="exclude" + 有相关标签 → 保留
    4. action="exclude" + 无相关标签 → 排除
    5. action="include" + (category 在白名单 OR 有相关标签) → 保留
    6. action="include" + 两者都不满足 → 排除
    """
    if mapping is None:
        return True, "no_mapping"
    if label is None:
        return True, "no_label"

    action = label.get("action", "")
    ai_cat = label.get("category", "")
    relevant_tags = mapping.get("relevant_tags", set())
    ai_categories = mapping.get("ai_categories", set())

    # 大小写不敏感比较
    tags_lower = {t.lower() for t in tags}
    relevant_lower = {t.lower() for t in relevant_tags}
    has_relevant_tag = bool(tags_lower & relevant_lower)

    if action == "exclude":
        if has_relevant_tag:
            return True, "exempt_by_tag"
        return False, "excluded"

    if action == "include":
        cat_match = ai_cat.lower() in {c.lower() for c in ai_categories}
        if cat_match or has_relevant_tag:
            return True, "included"
        return False, "irrelevant"

    # 未知 action → 保留
    return True, "unknown_action"


def apply_ai_filter(
    items: List[Dict],
    category_id: str,
    conn: sqlite3.Connection,
    *,
    source_id_key: str = "source_id",
    dedup_key_key: str = "dedup_key",
) -> Tuple[List[Dict], Dict[str, Any]]:
    """对文章列表应用分类感知的 AI 过滤。

    Args:
        items: 文章列表，每条需包含 source_id 和 dedup_key 字段
        category_id: 系统分类 ID（如 "finance"、"tech_news"）
        conn: SQLite 数据库连接

    Returns:
        (filtered_items, stats)
    """
    mapping = CATEGORY_AI_MAPPING.get(category_id)
    if mapping is None:
        # 未配置的分类，跳过 AI 过滤
        return list(items), {"ai_filtered_count": 0, "ai_no_label_count": len(items)}

    # 收集有 source_id 的文章的 key
    keyed_items: List[Tuple[int, Tuple[str, str]]] = []
    for idx, item in enumerate(items):
        sid = str(item.get(source_id_key) or "").strip()
        dk = str(item.get(dedup_key_key) or "").strip()
        if sid and dk:
            keyed_items.append((idx, (sid, dk)))

    if not keyed_items:
        return list(items), {"ai_filtered_count": 0, "ai_no_label_count": len(items)}

    # 批量查询 AI 标注和标签
    all_keys = [k for _, k in keyed_items]
    try:
        labels = _batch_fetch_ai_labels(conn, all_keys)
        tags = _batch_fetch_tags(conn, all_keys)
    except Exception:
        # 数据库异常，返回原始列表
        return list(items), {"ai_filtered_count": 0, "ai_no_label_count": 0, "ai_error": True}

    # 逐条过滤
    filtered = []
    ai_filtered_count = 0
    ai_no_label_count = 0
    keyed_set = {k for _, k in keyed_items}
    keyed_decisions: Dict[Tuple[str, str], bool] = {}

    for _, key in keyed_items:
        label = labels.get(key)
        item_tags = tags.get(key, set())
        keep, reason = _should_keep(label, item_tags, mapping)
        keyed_decisions[key] = keep
        if not keep:
            ai_filtered_count += 1
        if label is None:
            ai_no_label_count += 1

    for idx, item in enumerate(items):
        sid = str(item.get(source_id_key) or "").strip()
        dk = str(item.get(dedup_key_key) or "").strip()
        if sid and dk:
            key = (sid, dk)
            if keyed_decisions.get(key, True):
                filtered.append(item)
        else:
            # 无 source_id 的文章直接保留
            filtered.append(item)

    stats = {
        "ai_filtered_count": ai_filtered_count,
        "ai_no_label_count": ai_no_label_count,
    }
    return filtered, stats
