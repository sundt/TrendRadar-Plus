import asyncio
import os
import time
from hotnews.web.submit_api import _get_conn

def check_db():
    try:
        os.environ["HOTNEWS_DATA_DIR"] = "/app/data"
        conn = _get_conn()
        cur = conn.cursor()
        
        # Check current state of cnblogs pending source
        cur.execute("SELECT id, status, approved_source_id FROM pending_sources WHERE host LIKE '%cnblogs%'")
        for r in cur.fetchall():
            print("Pending source:", r)
            
        # Try to manually run the insert
        now = int(time.time())
        try:
            conn.execute(
                """
                INSERT OR IGNORE INTO rss_sources
                    (id, name, url, host, category, cadence, enabled,
                     use_socks_proxy, language, country, created_at, updated_at, added_at)
                VALUES (?, ?, ?, ?, ?, 'P4', 1, ?, ?, ?, ?, ?, ?)
                """,
                ("test_rss_123", "Test CNBlogs", "https://feed.cnblogs.com/blog/sitehome/rss", "www.cnblogs.com",
                 "tech", 0, "zh", "CN", now, now, now),
            )
            print("Manual INSERT successful")
        except Exception as insert_e:
            print("Manual INSERT failed:", insert_e)
            
        # Check schema
        cur.execute("PRAGMA table_info(rss_sources)")
        print("rss_sources schema:")
        for r in cur.fetchall():
            print(r)
            
    except Exception as e:
        print("ERROR:")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    check_db()
