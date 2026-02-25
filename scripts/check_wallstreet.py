import sqlite3, time
conn = sqlite3.connect("/root/hotnews/output/online.db")
now = int(time.time())
min7 = now - 7*86400

r1 = conn.execute("SELECT name FROM custom_sources WHERE id=?", ("custom_2ogqbhp",)).fetchone()
r2 = conn.execute("SELECT name FROM custom_sources WHERE id=?", ("custom_imzrbzj",)).fetchone()
name_a = r1[0] if r1 else "custom_2ogqbhp"
name_b = r2[0] if r2 else "custom_imzrbzj"

for sid, name in [("custom_2ogqbhp", name_a), ("custom_imzrbzj", name_b)]:
    total = conn.execute("SELECT COUNT(*) FROM rss_entries WHERE source_id=? AND created_at>=?", (sid, min7)).fetchone()[0]
    print(f"{name} ({sid}): {total} 篇(7天)")

a_only = conn.execute(
    "SELECT COUNT(*) FROM rss_entries a WHERE a.source_id='custom_2ogqbhp' AND a.created_at>=? "
    "AND NOT EXISTS (SELECT 1 FROM rss_entries b WHERE b.source_id='custom_imzrbzj' AND b.title=a.title AND b.created_at>=?)",
    (min7, min7)
).fetchone()[0]

b_only = conn.execute(
    "SELECT COUNT(*) FROM rss_entries a WHERE a.source_id='custom_imzrbzj' AND a.created_at>=? "
    "AND NOT EXISTS (SELECT 1 FROM rss_entries b WHERE b.source_id='custom_2ogqbhp' AND b.title=a.title AND b.created_at>=?)",
    (min7, min7)
).fetchone()[0]

overlap = conn.execute(
    "SELECT COUNT(DISTINCT a.title) FROM rss_entries a JOIN rss_entries b ON a.title=b.title "
    "WHERE a.source_id='custom_2ogqbhp' AND b.source_id='custom_imzrbzj' AND a.created_at>=? AND b.created_at>=?",
    (min7, min7)
).fetchone()[0]

print(f"\n{name_a} 独有: {a_only}")
print(f"{name_b} 独有: {b_only}")
print(f"重叠: {overlap}")

# 热门独有的是什么内容？
if b_only > 0:
    rows = conn.execute(
        "SELECT a.title FROM rss_entries a WHERE a.source_id='custom_imzrbzj' AND a.created_at>=? "
        "AND NOT EXISTS (SELECT 1 FROM rss_entries b WHERE b.source_id='custom_2ogqbhp' AND b.title=a.title AND b.created_at>=?) "
        "ORDER BY a.created_at DESC LIMIT 5",
        (min7, min7)
    ).fetchall()
    print(f"\n{name_b} 独有的文章示例:")
    for r in rows:
        print(f"  {r[0][:60]}")

conn.close()
