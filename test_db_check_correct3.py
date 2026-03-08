import os
from hotnews.web.submit_api import _get_conn

def check_all_approved():
    try:
        os.environ["HOTNEWS_DATA_DIR"] = "/app/data"
        conn = _get_conn()
        cur = conn.cursor()
        
        cur.execute("SELECT id, name, url, host, category, enabled, added_at FROM rss_sources ORDER BY added_at DESC LIMIT 5")
        print("Last 5 items added to rss_sources:")
        for r in cur.fetchall():
            print(r)
            
        cur.execute("SELECT id, submitted_url, status, approved_source_id, reviewed_at FROM pending_sources WHERE status = 'approved' ORDER BY reviewed_at DESC LIMIT 5")
        print("\nLast 5 items approved in pending_sources:")
        for r in cur.fetchall():
            print(r)

    except Exception as e:
        print("ERROR:")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    check_all_approved()
