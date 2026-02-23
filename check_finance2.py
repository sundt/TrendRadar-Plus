#!/usr/bin/env python3
import sqlite3

conn = sqlite3.connect('/app/output/online.db')

# Check newsnow platforms for finance
finance_platforms = [
    "caixin", "sina_finance_roll",
    "wallstreetcn-hot", "wallstreetcn-quick", "cls-hot",
    "cls-telegraph", "gelonghui", "xueqiu", "jin10",
]

print("=== NewNow Finance Platforms ===")
for pid in finance_platforms:
    try:
        cur = conn.execute(
            "SELECT COUNT(*) FROM newsnow_items WHERE platform_id=?", (pid,)
        )
        cnt = cur.fetchone()[0]
        # Get platform name
        cur2 = conn.execute(
            "SELECT name FROM newsnow_platforms WHERE id=?", (pid,)
        )
        row = cur2.fetchone()
        name = row[0] if row else pid
        print(f"  {name} ({pid}): {cnt} items")
    except Exception as e:
        print(f"  {pid}: error - {e}")

# Also check if there are finance-category platforms via category_override
print("\n=== Platforms with finance category_override ===")
try:
    cur = conn.execute(
        "SELECT id, name FROM newsnow_platforms WHERE category_override='finance' AND enabled=1"
    )
    for r in cur.fetchall():
        cur2 = conn.execute("SELECT COUNT(*) FROM newsnow_items WHERE platform_id=?", (r[0],))
        cnt = cur2.fetchone()[0]
        print(f"  {r[1]} ({r[0]}): {cnt} items")
except Exception as e:
    print(f"  Error: {e}")

# Check RSS sources with finance category
print("\n=== RSS Sources with finance category ===")
try:
    cur = conn.execute(
        "SELECT id, name FROM rss_sources WHERE category='finance' AND enabled=1"
    )
    for r in cur.fetchall():
        cur2 = conn.execute(
            "SELECT COUNT(*) FROM rss_entries WHERE source_id=? AND published_at > 0 AND title IS NOT NULL AND title != ''",
            (r[0],)
        )
        cnt = cur2.fetchone()[0]
        print(f"  {r[1]} ({r[0]}): {cnt} entries")
except Exception as e:
    print(f"  Error: {e}")

# Check what the original card mode shows - the get_categorized_news function
# combines newsnow_items + rss_entries for each category
print("\n=== Combined: What original card mode would show ===")
print("NewNow platforms: caixin, sina_finance_roll, wallstreetcn-hot, wallstreetcn-quick, cls-hot, cls-telegraph, gelonghui, xueqiu, jin10")
print("RSS sources: category='finance'")
print("Both are shown as separate cards in the original card mode")
