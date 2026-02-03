#!/usr/bin/env python3
# coding=utf-8
"""
Cleanup expired temporary images.

This script should be run periodically (e.g., daily via cron) to clean up
expired temporary images from the publisher system.

Usage:
    python scripts/cleanup_temp_images.py

Cron example (run daily at 3am):
    0 3 * * * cd /path/to/hotnews && python scripts/cleanup_temp_images.py >> /var/log/hotnews/cleanup.log 2>&1
"""

import os
import sys
from pathlib import Path
from datetime import datetime

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from hotnews.web.user_db import get_user_db_conn
from hotnews.web.api.publisher.db import cleanup_expired_images


def main():
    """Run the cleanup task."""
    print(f"[{datetime.now().isoformat()}] Starting temp image cleanup...")
    
    try:
        conn = get_user_db_conn(project_root)
        count, paths = cleanup_expired_images(conn)
        
        if count == 0:
            print(f"[{datetime.now().isoformat()}] No expired images to clean up.")
            return
        
        print(f"[{datetime.now().isoformat()}] Found {count} expired image records.")
        
        # Delete actual files
        deleted_files = 0
        failed_files = 0
        
        for file_path in paths:
            if not file_path:
                continue
            
            # Handle both absolute and relative paths
            if os.path.isabs(file_path):
                full_path = Path(file_path)
            else:
                full_path = project_root / file_path
            
            try:
                if full_path.exists():
                    full_path.unlink()
                    deleted_files += 1
                    print(f"  Deleted: {full_path}")
                else:
                    print(f"  Not found (already deleted?): {full_path}")
            except Exception as e:
                failed_files += 1
                print(f"  Failed to delete {full_path}: {e}")
        
        print(f"[{datetime.now().isoformat()}] Cleanup complete:")
        print(f"  - Database records removed: {count}")
        print(f"  - Files deleted: {deleted_files}")
        if failed_files > 0:
            print(f"  - Files failed to delete: {failed_files}")
        
    except Exception as e:
        print(f"[{datetime.now().isoformat()}] Cleanup failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
