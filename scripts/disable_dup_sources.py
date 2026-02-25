"""
禁用重复数据源
- custom_2ogqbhp: 华尔街见闻（无名副本，192篇，独有仅3篇）→ 禁用
- custom_q1odb3f: 华尔街见闻-热门（子集）→ 禁用
"""
import sqlite3

DB = "/root/hotnews/output/online.db"
conn = sqlite3.connect(DB)

targets = [
    ("custom_2ogqbhp", "华尔街见闻(无名副本)"),
    ("custom_q1odb3f", "华尔街见闻-热门"),
]

for sid, label in targets:
    # 检查当前状态
    row = conn.execute(
        "SELECT name, enabled FROM custom_sources WHERE id=?", (sid,)
    ).fetchone()
    if not row:
        # 可能在 rss_sources
        row = conn.execute(
            "SELECT name, enabled FROM rss_sources WHERE id=?", (sid,)
        ).fetchone()
        if row:
            print(f"[rss_sources] {label} ({sid}): name={row[0]}, enabled={row[1]}")
            conn.execute("UPDATE rss_sources SET enabled=0 WHERE id=?", (sid,))
            print(f"  → 已禁用")
        else:
            print(f"[NOT FOUND] {label} ({sid})")
        continue

    print(f"[custom_sources] {label} ({sid}): name={row[0]}, enabled={row[1]}")
    if row[1] == 0:
        print(f"  → 已经是禁用状态")
    else:
        conn.execute("UPDATE custom_sources SET enabled=0 WHERE id=?", (sid,))
        print(f"  → 已禁用")

conn.commit()
conn.close()
print("\n完成！")
