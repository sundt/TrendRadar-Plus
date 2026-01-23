#!/usr/bin/env python3
"""
Migration script: Move free quota from users table to token_recharge_logs table.

This unifies all token balances into a single table for simpler logic.
- Free quota records have order_id=0
- Free quota never expires (100 years validity)

Usage:
    python scripts/migrate_free_quota_to_recharge_logs.py

Run this ONCE after deploying the new code.
"""

import sqlite3
import time
import os

# Constants
FREE_QUOTA_TOKENS = 100000  # 100K tokens
FREE_QUOTA_VALIDITY_DAYS = 36500  # ~100 years

def migrate(user_db_path: str, online_db_path: str, dry_run: bool = False):
    """Migrate free quota from users table to token_recharge_logs."""
    
    user_conn = sqlite3.connect(user_db_path)
    online_conn = sqlite3.connect(online_db_path)
    
    now = int(time.time())
    expire_at = now + FREE_QUOTA_VALIDITY_DAYS * 24 * 3600
    
    # Get all users with remaining free quota
    cur = user_conn.execute("""
        SELECT id, token_balance, tokens_used 
        FROM users 
        WHERE token_balance > 0
    """)
    users = cur.fetchall()
    
    print(f"Found {len(users)} users with free quota to migrate")
    
    migrated = 0
    skipped = 0
    
    for user_id, token_balance, tokens_used in users:
        # Check if user already has free quota in token_recharge_logs
        cur = online_conn.execute(
            "SELECT id FROM token_recharge_logs WHERE user_id = ? AND order_id = 0",
            (user_id,)
        )
        if cur.fetchone():
            print(f"  User {user_id}: Already has free quota record, skipping")
            skipped += 1
            continue
        
        # Calculate remaining free quota
        # token_balance is the remaining, tokens_used is what was consumed
        remaining = token_balance
        
        if remaining <= 0:
            print(f"  User {user_id}: No remaining quota ({remaining}), skipping")
            skipped += 1
            continue
        
        print(f"  User {user_id}: Migrating {remaining} tokens (used: {tokens_used})")
        
        if not dry_run:
            # Insert free quota record
            online_conn.execute("""
                INSERT INTO token_recharge_logs (user_id, order_id, tokens, expire_at, remaining, created_at)
                VALUES (?, 0, ?, ?, ?, ?)
            """, (user_id, FREE_QUOTA_TOKENS, expire_at, remaining, now))
        
        migrated += 1
    
    if not dry_run:
        online_conn.commit()
    
    print(f"\nMigration complete: {migrated} migrated, {skipped} skipped")
    
    user_conn.close()
    online_conn.close()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Migrate free quota to token_recharge_logs")
    parser.add_argument("--dry-run", action="store_true", help="Don't actually write to database")
    parser.add_argument("--user-db", default="output/user.db", help="Path to user.db")
    parser.add_argument("--online-db", default="output/online.db", help="Path to online.db")
    args = parser.parse_args()
    
    if not os.path.exists(args.user_db):
        print(f"Error: {args.user_db} not found")
        exit(1)
    
    if not os.path.exists(args.online_db):
        print(f"Error: {args.online_db} not found")
        exit(1)
    
    migrate(args.user_db, args.online_db, args.dry_run)
