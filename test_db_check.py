import sqlite3

def check_db():
    conn = sqlite3.connect("/app/data/state.db")
    cur = conn.cursor()
    cur.execute("SELECT id, submitted_url, status, reject_reason FROM pending_sources ORDER BY submitted_at DESC LIMIT 5")
    rows = cur.fetchall()
    print(f"Total rows retrieved: {len(rows)}")
    for r in rows:
        print(r)

if __name__ == "__main__":
    check_db()
