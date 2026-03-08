import sqlite3
import os

db_path = "/Users/sun/Downloads/project/hotnews/output/online.db"

def update_plans():
    if not os.path.exists(db_path):
        print(f"Error: Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    print("Updating plans to lifetime...")
    
    # Update all monthly plans created earlier to lifetime (36500 days)
    cur.execute("""
        UPDATE subscription_plans 
        SET plan_type = 'lifetime',
            duration_days = 36500
        WHERE is_active = 1
    """)
    
    conn.commit()
    
    print("\nUpdated plans:")
    cur.execute("SELECT id, name, plan_type, price_cents, duration_days, usage_quota, badge FROM subscription_plans")
    for row in cur.fetchall():
        print(row)
        
    conn.close()

if __name__ == "__main__":
    update_plans()
