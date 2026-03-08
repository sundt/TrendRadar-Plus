import asyncio
import os
import time
from hotnews.web.submit_api import _get_conn

def check_db():
    try:
        os.environ["HOTNEWS_DATA_DIR"] = "/app/data"
        conn = _get_conn()
        cur = conn.cursor()
        
        # We manually insert exactly what the backend API function does
        now = int(time.time())
        try:
            conn.execute(
                """
                INSERT OR IGNORE INTO rss_sources
                    (id, name, url, host, category, cadence, enabled,
                     use_socks_proxy, language, country, created_at, updated_at, added_at)
                VALUES (?, ?, ?, ?, ?, 'P4', 1, ?, ?, ?, ?, ?, ?)
                """,
                ("rss_test_1", "Test CNBlogs2", "https://feed.cnblogs.com/blog/sitehome/rss", "www.cnblogs.com",
                 "tech", 0, "zh", "CN", now, now, now),
            )
            print("Manual INSERT successful")
        except Exception as insert_e:
            print("Manual INSERT failed:", insert_e)
            
        conn.commit()
        
    except Exception as e:
        print("ERROR:")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    check_db()
