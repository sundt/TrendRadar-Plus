#!/bin/bash

# Source deployment environment variables
if [ -f "./.env" ]; then
    set -a
    source "./.env"
    set +a
fi

SERVER_USER="${HOTNEWS_SSH_USER}"
SERVER_HOST="${HOTNEWS_SSH_HOST}"
SERVER_PORT="${HOTNEWS_SSH_PORT:-22}"
SERVER_PROJECT_ROOT="${HOTNEWS_REMOTE_ROOT:-~/hotnews}"

echo "Connecting to ${SERVER_USER}@${SERVER_HOST}:${SERVER_PORT}..."

ssh -p "${SERVER_PORT}" "${SERVER_USER}@${SERVER_HOST}" "python3 -c \"
import sqlite3
import os

db_path = '${SERVER_PROJECT_ROOT}/output/online.db'

print(f'Using remote db: {db_path}')
if not os.path.exists(db_path):
    print('Remote DB not found.')
    exit(1)

conn = sqlite3.connect(db_path)
cur = conn.cursor()

# 9.9 for 3, lifetime
cur.execute('''
    UPDATE subscription_plans 
    SET name = '基础会员',
        plan_type = 'lifetime',
        price_cents = 990,
        duration_days = 36500,
        usage_quota = 3,
        badge = NULL
    WHERE id = 1
''')

# 29.9 for 10, lifetime
cur.execute('''
    UPDATE subscription_plans 
    SET name = '专业会员',
        plan_type = 'lifetime',
        price_cents = 2990,
        duration_days = 36500,
        usage_quota = 10,
        badge = '推荐'
    WHERE id = 2
''')

conn.commit()

cur.execute('SELECT id, name, plan_type, price_cents, duration_days, usage_quota, badge FROM subscription_plans')
for row in cur.fetchall():
    print(row)

conn.close()
\""
