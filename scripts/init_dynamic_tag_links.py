# coding=utf-8
"""
Initialize dynamic tag entry links.

This script links all existing dynamic tags to matching RSS entries.
Run this once after deploying the new feature, then rely on:
1. Auto-linking when tags are promoted
2. Periodic refresh via admin API or cron job

Usage:
    python scripts/init_dynamic_tag_links.py [days_back]
"""

import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))


def main():
    days_back = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    
    print(f"\n{'='*60}")
    print(f"🔗 Initializing dynamic tag entry links")
    print(f"   Days back: {days_back}")
    print(f"{'='*60}\n")
    
    from hotnews.web.db_online import get_online_db_conn
    from hotnews.kernel.services.tag_discovery import TagDiscoveryService
    
    conn = get_online_db_conn(project_root)
    service = TagDiscoveryService(conn)
    
    # Get all dynamic tags
    cur = conn.execute(
        """
        SELECT id, name, name_en, usage_count
        FROM tags
        WHERE is_dynamic = 1 AND lifecycle = 'active' AND enabled = 1
        ORDER BY usage_count DESC
        """
    )
    tags = cur.fetchall() or []
    
    print(f"Found {len(tags)} active dynamic tags\n")
    
    total_linked = 0
    for tag_id, name, name_en, usage_count in tags:
        keywords = [k for k in [name, name_en, tag_id] if k]
        count = service.link_tag_to_entries(
            tag_id=tag_id,
            keywords=keywords,
            days_back=days_back,
            max_entries=500
        )
        total_linked += count
        print(f"  [{tag_id}] {name}: {count} entries linked (keywords: {keywords})")
    
    # Invalidate cache
    try:
        from hotnews.web.timeline_cache import my_tags_cache
        my_tags_cache.invalidate()
        print("\n✅ Cache invalidated")
    except Exception as e:
        print(f"\n⚠️ Failed to invalidate cache: {e}")
    
    print(f"\n{'='*60}")
    print(f"✅ Done! Linked {total_linked} entries across {len(tags)} tags")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
