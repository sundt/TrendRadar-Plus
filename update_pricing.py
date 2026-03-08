import sqlite3
import os

db_path = "/Users/sun/Downloads/project/hotnews/output/online.db"

def update_plans():
    if not os.path.exists(db_path):
        print(f"Error: Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    # Check current plans
    print("Current plans:")
    cur.execute("SELECT id, name, plan_type, price_cents, duration_days, usage_quota FROM subscription_plans")
    for row in cur.fetchall():
        print(row)
        
    print("\nUpdating plans...")
    # Standard Plan: 9.9 RMB/month, 3 topics
    cur.execute("""
        UPDATE subscription_plans 
        SET name = '基础版会员',
            plan_type = 'monthly',
            price_cents = 990,
            duration_days = 30,
            usage_quota = 3,
            badge = NULL
        WHERE id = 1
    """)
    
    # Pro Plan: 29.9 RMB/month, 10 topics
    cur.execute("""
        UPDATE subscription_plans 
        SET name = '专业版会员',
            plan_type = 'monthly',
            price_cents = 2990,
            duration_days = 30,
            usage_quota = 10,
            badge = '推荐'
        WHERE id = 2
    """)
    
    conn.commit()
    
    print("\nUpdated plans:")
    cur.execute("SELECT id, name, plan_type, price_cents, duration_days, usage_quota, badge FROM subscription_plans")
    for row in cur.fetchall():
        print(row)
        
    conn.close()

if __name__ == "__main__":
    update_plans()
