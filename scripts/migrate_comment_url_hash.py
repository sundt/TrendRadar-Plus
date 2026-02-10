#!/usr/bin/env python3
"""
迁移评论 URL hash：用新的 _normalize_url 逻辑重新计算 article_url_hash。

旧逻辑：去掉所有 query 参数 → 不同文章（如微信公众号）被当成同一页面
新逻辑：只去掉追踪参数，保留文章标识参数

用法：
  python scripts/migrate_comment_url_hash.py [--db PATH] [--dry-run]
"""
import argparse
import hashlib
import sqlite3
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode

TRACKING_PARAMS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "spm", "from", "src", "source", "ref", "referer",
    "share", "share_token", "share_source",
    "nsukey", "scene", "subscene", "clicktime",
    "enterid", "sessionid", "pass_ticket",
}


def normalize_url(url: str) -> str:
    try:
        p = urlparse(url)
    except Exception:
        return url
    try:
        filtered = []
        for k, v in parse_qsl(p.query or "", keep_blank_values=True):
            if k.lower() in TRACKING_PARAMS:
                continue
            if k.lower().startswith("utm_"):
                continue
            filtered.append((k, v))
        query = urlencode(filtered, doseq=True)
    except Exception:
        query = p.query or ""
    return urlunparse((p.scheme.lower(), p.netloc.lower(), p.path, "", query, ""))


def sha256(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description="迁移评论 URL hash")
    parser.add_argument("--db", default="data/online.db", help="online.db 路径")
    parser.add_argument("--dry-run", action="store_true", help="只打印不执行")
    args = parser.parse_args()

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row

    rows = conn.execute(
        "SELECT id, article_url, article_url_hash FROM article_comments WHERE article_url != ''"
    ).fetchall()

    updated = 0
    skipped = 0
    for row in rows:
        old_hash = row["article_url_hash"]
        new_url = normalize_url(row["article_url"])
        new_hash = sha256(new_url)

        if old_hash == new_hash:
            skipped += 1
            continue

        print(f"  id={row['id']}  url={row['article_url'][:80]}")
        print(f"    old_hash={old_hash[:16]}...  new_hash={new_hash[:16]}...")

        if not args.dry_run:
            conn.execute(
                "UPDATE article_comments SET article_url_hash = ? WHERE id = ?",
                (new_hash, row["id"]),
            )
        updated += 1

    if not args.dry_run and updated:
        conn.commit()

    print(f"\n完成: {updated} 条更新, {skipped} 条无变化" + (" (dry-run)" if args.dry_run else ""))
    conn.close()


if __name__ == "__main__":
    main()
