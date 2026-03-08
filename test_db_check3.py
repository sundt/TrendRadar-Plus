import sqlite3

def check_db():
    conn = sqlite3.connect("/app/data/state.db")
    cur = conn.cursor()
    cur.execute("SELECT id, name, url, host, category, enabled, use_socks_proxy FROM rss_sources WHERE host LIKE '%cnblogs.com%'")
    rows = cur.fetchall()
    print(f"Total rows retrieved from rss_sources: {len(rows)}")
    for r in rows:
        print(r)
        
    cur.execute("SELECT id, status, approved_source_id FROM pending_sources WHERE host LIKE '%cnblogs.com%'")
    rows2 = cur.fetchall()
    print(f"Total rows retrieved from pending_sources: {len(rows2)}")
    for r in rows2:
        print(r)

if __name__ == "__main__":
    check_db()
