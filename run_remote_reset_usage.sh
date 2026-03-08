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

db_path = '${SERVER_PROJECT_ROOT}/output/user.db'
if not os.path.exists(db_path):
    print(f'DB not found at {db_path}')
    exit(1)

conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Reset usage_used to 0
cur.execute('UPDATE user_subscriptions SET usage_used = 0')
conn.commit()

print(f'Successfully reset usage_used to 0 for {cur.rowcount} subscriptions.')
conn.close()
\""
