#!/usr/bin/env python3
"""
批量打标脚本（方案 C2）：用 AI 为 rss_sources 表中的每个源生成 description 和 tags。

用法：
    # 在服务器上运行（需要 DASHSCOPE_API_KEY 环境变量）
    python3 scripts/batch_tag_rss_sources.py

    # 只处理前 N 条（测试用）
    python3 scripts/batch_tag_rss_sources.py --limit 10

    # 强制重新打标（覆盖已有 tags）
    python3 scripts/batch_tag_rss_sources.py --force

功能：
    1. 读取 rss_sources 中最近有文章的源
    2. 从 rss_entries 中取每个源最新的 5 篇文章标题
    3. 调用 qwen-plus 生成 description（20 字简介）和 tags（逗号分隔的主题标签）
    4. 写回 rss_sources 表
    5. 支持断点续跑（已有 tags 的默认跳过）
"""
import argparse
import json
import os
import sqlite3
import sys
import time
from pathlib import Path

# 保证能 import hotnews
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def get_db_conn(project_root: Path) -> sqlite3.Connection:
    db_path = project_root / "output" / "online.db"
    if not db_path.exists():
        print(f"❌ Database not found: {db_path}")
        sys.exit(1)
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    # 确保 description 和 tags 列存在
    for col, col_def in [("description", "TEXT DEFAULT ''"), ("tags", "TEXT DEFAULT ''")]:
        try:
            cur = conn.execute("PRAGMA table_info(rss_sources)")
            cols = {r[1] for r in cur.fetchall()}
            if col not in cols:
                conn.execute(f"ALTER TABLE rss_sources ADD COLUMN {col} {col_def}")
                conn.commit()
                print(f"  ✅ Added column: rss_sources.{col}")
        except Exception as e:
            print(f"  ⚠️ Column check failed for {col}: {e}")
    return conn


def fetch_sources(conn, force=False, limit=None):
    """获取需要打标签的 RSS 源列表"""
    where = "WHERE enabled = 1" if not force else "WHERE enabled = 1"
    if not force:
        where += " AND (tags IS NULL OR tags = '')"

    query = f"""
        SELECT s.id, s.name, s.url, s.category, COALESCE(s.description,'') as description
        FROM rss_sources s
        {where}
        ORDER BY s.updated_at DESC
    """
    if limit:
        query += f" LIMIT {int(limit)}"

    cur = conn.execute(query)
    return cur.fetchall()


def fetch_recent_titles(conn, source_id, n=5):
    """获取某个源最近 N 篇文章标题"""
    cur = conn.execute(
        "SELECT title FROM rss_entries WHERE source_id = ? ORDER BY published_at DESC LIMIT ?",
        (source_id, n)
    )
    return [r[0] for r in cur.fetchall() if r[0]]


def call_ai_for_tags(source_name, source_url, category, titles, api_key):
    """调用 qwen-plus 生成 description 和 tags"""
    import urllib.request

    titles_str = "\n".join(f"- {t}" for t in titles[:5]) if titles else "(无近期文章)"
    prompt = f"""为下面的 RSS 数据源生成简介和主题标签。

源名称：{source_name}
URL：{source_url}
分类：{category or '未分类'}
近期文章标题：
{titles_str}

请生成：
1. description: 一句话简介（15-25字，说明这个源主要报道什么内容）
2. tags: 逗号分隔的主题标签（5-10个），要求：
   - 包含该源覆盖的所有主题领域
   - 使用具体名词（如：人工智能,大模型,芯片,自动驾驶）
   - 不要用泛化词（如：科技,新闻,行业）
   - 中英文都可以

严格按以下 JSON 格式输出：
{{"description": "一句话简介", "tags": "标签1,标签2,标签3"}}"""

    req_body = json.dumps({
        "model": "qwen-plus",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
        "response_format": {"type": "json_object"}
    }).encode("utf-8")

    try:
        req = urllib.request.Request(
            "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
            data=req_body,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            content = json.loads(resp.read().decode("utf-8"))
            text = content["choices"][0]["message"]["content"]
            result = json.loads(text)
            return result.get("description", ""), result.get("tags", "")
    except Exception as e:
        print(f"    ⚠️ AI call failed: {e}")
        return None, None


def main():
    parser = argparse.ArgumentParser(description="批量为 RSS 源生成 description 和 tags")
    parser.add_argument("--limit", type=int, default=None, help="最多处理 N 条")
    parser.add_argument("--force", action="store_true", help="覆盖已有 tags")
    parser.add_argument("--dry-run", action="store_true", help="只打印不写入")
    args = parser.parse_args()

    api_key = os.environ.get("DASHSCOPE_API_KEY", "")
    if not api_key:
        print("❌ DASHSCOPE_API_KEY not set")
        sys.exit(1)

    project_root = Path(__file__).resolve().parent.parent
    conn = get_db_conn(project_root)

    sources = fetch_sources(conn, force=args.force, limit=args.limit)
    total = len(sources)
    print(f"📋 Found {total} sources to process\n")

    success = 0
    failed = 0
    skipped = 0

    for i, (sid, name, url, category, existing_desc) in enumerate(sources, 1):
        print(f"[{i}/{total}] {name} ({url[:60]})")

        titles = fetch_recent_titles(conn, sid)
        if not titles:
            print(f"    ⏭️ No recent articles, skipping")
            skipped += 1
            continue

        desc, tags = call_ai_for_tags(name, url, category, titles, api_key)
        if desc is None:
            failed += 1
            continue

        print(f"    📝 desc: {desc}")
        print(f"    🏷️ tags: {tags}")

        if not args.dry_run:
            conn.execute(
                "UPDATE rss_sources SET description = ?, tags = ?, updated_at = ? WHERE id = ?",
                (desc, tags, int(time.time()), sid)
            )
            conn.commit()
            print(f"    ✅ Saved")
        else:
            print(f"    🔍 Dry run, not saved")

        success += 1

        # 控制 API 调用速率（每秒最多 2 次）
        if i < total:
            time.sleep(0.5)

    print(f"\n{'='*40}")
    print(f"✅ Done: {success} tagged, {failed} failed, {skipped} skipped (total: {total})")


if __name__ == "__main__":
    main()
