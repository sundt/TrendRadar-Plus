import sqlite3
import os

db_path = "/Users/sun/Downloads/project/hotnews/data/online_db.sqlite"
if not os.path.exists(db_path):
    print("DB not found at", db_path)
else:
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT id, name, plan_type, price_cents, duration_days, usage_quota FROM subscription_plans")
    for row in cur.fetchall():
        print(row)
