import sqlite3
conn = sqlite3.connect("/root/hotnews/output/online.db")

rows = conn.execute("SELECT id, name, url FROM rss_sources").fetchall()
name_map = {r[0]: (r[1] or r[0], r[2] or '') for r in rows}

pairs = [
    ("custom_bdlya6s", "user-16af0ac4706c", 402),
    ("mp-MjM5MzA0MTg2MA==", "rsssrc-1e8f204932fc", 222),
    ("custom_2ogqbhp", "custom_imzrbzj", 189),
    ("custom_54vwdau", "custom_tgn3r7y", 111),
    ("custom_1jkdiz5", "custom_q1odb3f", 103),
    ("custom_rpgccn0", "mp-Mzg3NTA5MjkyNQ==", 103),
    ("mp-MTQzMTE0MjcyMQ==", "mp-MjM5MDk1NzQzMQ==", 77),
    ("rsssrc-61564fca47e7", "user-611e64e2b1f1", 69),
    ("custom_j291xyv", "mp-MjM5MTM3NTMwNA==", 42),
    ("mp-MzA3MzI4MjgzMw==", "rsssrc-f1998c30dd76", 40),
    ("rsssrc-134b82794b0a", "user-e0592833fcf3", 40),
]

print("=== 重复数据源对照表 ===\n")
for a, b, cnt in pairs:
    na, ua = name_map.get(a, (a, ''))
    nb, ub = name_map.get(b, (b, ''))
    print(f"{cnt} 篇重叠:")
    print(f"  A: {na} ({a})")
    if ua: print(f"     {ua[:80]}")
    print(f"  B: {nb} ({b})")
    if ub: print(f"     {ub[:80]}")
    print()

conn.close()
