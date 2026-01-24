# coding=utf-8
"""
Debug script for "我的关注" (My Tags) feature.
Uses sqlite3 directly to avoid dependency issues.

Usage:
    python scripts/debug_my_tags.py [user_id]
"""

import sys
import sqlite3
from pathlib import Path

def main():
    project_root = Path(__file__).parent.parent
    user_id = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    
    online_db = project_root / "output" / "online.db"
    user_db = project_root / "output" / "user.db"
    
    print(f"\n{'='*60}")
    print(f"🔍 Debugging '我的关注' for user_id={user_id}")
    print(f"{'='*60}\n")
    
    if not online_db.exists():
        print(f"❌ online.db not found at {online_db}")
        return
    if not user_db.exists():
        print(f"❌ user.db not found at {user_db}")
        return
    
    online_conn = sqlite3.connect(str(online_db))
    user_conn = sqlite3.connect(str(user_db))
    
    # 1. Check if tags table has data
    print("1️⃣ Checking tags table...")
    cur = online_conn.execute("SELECT COUNT(*) FROM tags WHERE enabled = 1")
    tag_count = cur.fetchone()[0]
    print(f"   Total enabled tags: {tag_count}")
    
    if tag_count == 0:
        print("   ❌ No tags found! Need to initialize tags.")
        return
    else:
        print("   ✅ Tags table has data")
    
    # Show some sample tags
    cur = online_conn.execute("SELECT id, name, type FROM tags WHERE enabled = 1 LIMIT 10")
    print("   Sample tags:")
    for row in cur.fetchall():
        print(f"      - {row[0]}: {row[1]} ({row[2]})")
    
    # 2. Check user's followed tags
    print("\n2️⃣ Checking user's followed tags...")
    try:
        cur = user_conn.execute(
            "SELECT tag_id FROM user_tag_settings WHERE user_id = ? AND preference = 'follow'",
            (user_id,)
        )
        followed_tags = [r[0] for r in cur.fetchall() or []]
        print(f"   Followed tags: {followed_tags}")
        
        if not followed_tags:
            print("   ❌ User has not followed any tags!")
            print("   → Go to settings page and follow some tags")
        else:
            print(f"   ✅ User follows {len(followed_tags)} tags")
    except sqlite3.OperationalError as e:
        print(f"   ⚠️ user_tag_settings table may not exist: {e}")
        followed_tags = []
    
    # 3. Check rss_entry_tags table
    print("\n3️⃣ Checking rss_entry_tags table...")
    try:
        cur = online_conn.execute("SELECT COUNT(*) FROM rss_entry_tags")
        entry_tag_count = cur.fetchone()[0]
        print(f"   Total entry-tag associations: {entry_tag_count}")
        
        if entry_tag_count == 0:
            print("   ❌ No entry tags found!")
            print("   → Tags are written when AI summaries are generated for RSS articles")
        else:
            print("   ✅ rss_entry_tags has data")
    except sqlite3.OperationalError as e:
        print(f"   ⚠️ rss_entry_tags table may not exist: {e}")
        entry_tag_count = 0
    
    # 4. Check if any entries match followed tags
    if followed_tags and entry_tag_count > 0:
        print("\n4️⃣ Checking entries matching followed tags...")
        placeholders = ",".join(["?"] * len(followed_tags))
        cur = online_conn.execute(
            f"""
            SELECT t.tag_id, COUNT(DISTINCT e.id) as count
            FROM rss_entry_tags t
            JOIN rss_entries e ON e.source_id = t.source_id AND e.dedup_key = t.dedup_key
            WHERE t.tag_id IN ({placeholders})
            GROUP BY t.tag_id
            """,
            tuple(followed_tags)
        )
        matches = cur.fetchall() or []
        
        if not matches:
            print("   ❌ No entries found matching followed tags!")
            print("   → The tags from AI summaries don't match the followed tags")
        else:
            print("   ✅ Found entries matching followed tags:")
            for tag_id, count in matches:
                print(f"      - {tag_id}: {count} entries")
    
    # 5. Show sample of recent entry tags
    print("\n5️⃣ Recent entry tags (last 10)...")
    try:
        cur = online_conn.execute(
            """
            SELECT t.tag_id, e.title, t.created_at, t.source
            FROM rss_entry_tags t
            JOIN rss_entries e ON e.source_id = t.source_id AND e.dedup_key = t.dedup_key
            ORDER BY t.created_at DESC
            LIMIT 10
            """
        )
        recent = cur.fetchall() or []
        
        if recent:
            for tag_id, title, created_at, source in recent:
                print(f"   [{tag_id}] ({source}) {title[:50]}...")
        else:
            print("   No recent entry tags found")
    except Exception as e:
        print(f"   Error: {e}")
    
    # 6. Check article_summaries for tags
    print("\n6️⃣ Checking article_summaries for tags...")
    try:
        cur = online_conn.execute(
            """
            SELECT url, category_tags, quality_tag
            FROM article_summaries
            WHERE category_tags IS NOT NULL AND category_tags != '[]'
            ORDER BY created_at DESC
            LIMIT 5
            """
        )
        summaries = cur.fetchall() or []
        
        if summaries:
            print("   Recent summaries with tags:")
            for url, category_tags, quality_tag in summaries:
                print(f"   - {url[:60]}...")
                print(f"     Category: {category_tags}, Quality: {quality_tag}")
        else:
            print("   No summaries with tags found")
    except sqlite3.OperationalError as e:
        print(f"   ⚠️ article_summaries table issue: {e}")
    
    # 7. Check distinct tag_ids in rss_entry_tags
    print("\n7️⃣ Distinct tags in rss_entry_tags...")
    try:
        cur = online_conn.execute(
            """
            SELECT tag_id, COUNT(*) as count
            FROM rss_entry_tags
            GROUP BY tag_id
            ORDER BY count DESC
            LIMIT 15
            """
        )
        tag_stats = cur.fetchall() or []
        if tag_stats:
            print("   Top tags by usage:")
            for tag_id, count in tag_stats:
                print(f"      - {tag_id}: {count} entries")
        else:
            print("   No tags found")
    except Exception as e:
        print(f"   Error: {e}")
    
    print(f"\n{'='*60}")
    print("📋 Summary:")
    print(f"{'='*60}")
    print(f"- Tags in database: {tag_count}")
    print(f"- User followed tags: {len(followed_tags) if followed_tags else 0}")
    print(f"- Entry-tag associations: {entry_tag_count}")
    
    if followed_tags:
        print(f"\n💡 User's followed tags: {followed_tags}")
        print("   Check if these match the tags in rss_entry_tags (section 7)")
    
    online_conn.close()
    user_conn.close()


if __name__ == "__main__":
    main()
