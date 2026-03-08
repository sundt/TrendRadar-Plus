import asyncio
import os
from hotnews.web.submit_api import _get_conn

def check_db():
    try:
        os.environ["HOTNEWS_DATA_DIR"] = "/app/data"
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("SELECT id, submitted_url, status, reject_reason FROM pending_sources ORDER BY submitted_at DESC LIMIT 5")
        rows = cur.fetchall()
        print(f"Total rows retrieved: {len(rows)}")
        for r in rows:
            print(r)
    except Exception as e:
        print("ERROR IN HANDLE:")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    check_db()
