import sqlite3
import json
import os
import sys

# Add path to import server modules if needed, or just use raw SQL
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

DB_PATH = "output/online.db"

def check_rules(conn):
    print(">>> Checking Morning Brief Rules...")
    cur = conn.execute("SELECT value FROM admin_kv WHERE key = 'morning_brief_rules_v1' LIMIT 1")
    row = cur.fetchone()
    if not row:
        print("WARN: morning_brief_rules_v1 not found in admin_kv, using DEFAULTS")
        return {
            "enabled": True, 
            "category_whitelist_enabled": True,
            "category_whitelist": ["explore", "tech_news", "ainews", "developer", "knowledge"],
            "drop_published_at_zero": True
        }
    
    rules = json.loads(row[0])
    print(f"Enabled: {rules.get('enabled')}")
    print(f"Category Filter Enabled: {rules.get('category_whitelist_enabled')}")
    print(f"Category Whitelist: {rules.get('category_whitelist')}")
    
    return rules

def check_finance_sources(conn):
    print("\n>>> Checking Finance Sources...")
    cur = conn.execute("SELECT count(*), category FROM rss_sources GROUP BY category")
    for row in cur.fetchall():
        print(f"Category '{row[1]}': {row[0]} sources")

def simulate_timeline_query(conn, rules):
    print("\n>>> Simulating Timeline Query...")
    
    # Logic from server.py api_rss_brief_timeline
    ai_mode = os.environ.get("HOTNEWS_MB_AI_ENABLED", "0").lower() in ("1", "true", "yes")
    print(f"Env HOTNEWS_MB_AI_ENABLED: {ai_mode}")
    
    drop_zero = rules.get("drop_published_at_zero", True)
    
    sql = """
        SELECT e.id, e.title, COALESCE(s.name, ''), COALESCE(s.category, '')
        FROM rss_entries e
    """
    
    if ai_mode:
        sql += """
        JOIN rss_entry_ai_labels l
          ON l.source_id = e.source_id AND l.dedup_key = e.dedup_key
        """
        
    sql += " LEFT JOIN rss_sources s ON s.id = e.source_id WHERE 1=1 "
    
    if drop_zero:
        sql += " AND e.published_at > 0 "
        
    if ai_mode:
        sql += " AND l.action = 'include' AND l.score >= 75 AND l.confidence >= 0.70 "
        
    sql += " ORDER BY e.published_at DESC, e.id DESC LIMIT 100"
    
    print(f"SQL: {sql}")
    
    cur = conn.execute(sql)
    rows = cur.fetchall()
    print(f"Fetched {len(rows)} items.")
    
    category_whitelist_enabled = bool(rules.get("category_whitelist_enabled", True))
    category_whitelist = set(rules.get("category_whitelist") or [])
    
    print(f"Filter Logic: Enabled={category_whitelist_enabled}, Whitelist={category_whitelist}")
    
    pass_count = 0
    fail_count = 0
    finance_passed = 0
    
    for r in rows:
        title = r[1]
        sname = r[2]
        scategory = str(r[3] or "").strip().lower()
        
        passed = True
        if category_whitelist_enabled and category_whitelist:
            if scategory not in category_whitelist:
                passed = False
        
        if passed:
            pass_count += 1
            if scategory == 'finance':
                print(f"[WARN] Finance item PASSED: [{sname}] {title} (cat='{scategory}')")
                finance_passed += 1
        else:
            fail_count += 1
            if scategory == 'finance':
                print(f"[OK] Finance item BLOCKED: [{sname}] {title} (cat='{scategory}')")

    print(f"\nSummary: passed={pass_count}, blocked={fail_count}")
    print(f"Finance items passed: {finance_passed}")

if __name__ == "__main__":
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        sys.exit(1)
        
    conn = sqlite3.connect(DB_PATH)
    rules = check_rules(conn)
    check_finance_sources(conn)
    simulate_timeline_query(conn, rules)
    conn.close()
