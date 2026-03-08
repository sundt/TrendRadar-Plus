import sqlite3
import os
import sys

db_path = "/root/hotnews/output/online.db"
if not os.path.exists(db_path):
    print(f"DB not found at {db_path}")
    sys.exit(1)

conn = sqlite3.connect(db_path)
cur = conn.cursor()

try:
    # Reset usage_used to 0 for all subscriptions in user_subscriptions table 
    # Notice: It might be in user.db or online.db, checking online.db first
    cur.execute("UPDATE user_subscriptions SET usage_used = 0")
    conn.commit()
    print(f"Successfully reset usage_used to 0 for {cur.rowcount} subscriptions in online.db.")
except sqlite3.OperationalError:
    # the table might be in user.db
    db_path = "/root/hotnews/output/user.db"
    if not os.path.exists(db_path):
        print(f"Table user_subscriptions not in online.db and user.db not found.")
        sys.exit(1)
        
    conn.close()
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("UPDATE user_subscriptions SET usage_used = 0")
    conn.commit()
    print(f"Successfully reset usage_used to 0 for {cur.rowcount} subscriptions in user.db.")

conn.close()
