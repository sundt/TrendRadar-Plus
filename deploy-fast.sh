#!/bin/bash
set -e

# Load .env if it exists
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Configuration - 必须通过环境变量设置
SERVER_USER="${HOTNEWS_SSH_USER:?请设置 HOTNEWS_SSH_USER 环境变量}"
SERVER_HOST="${HOTNEWS_SSH_HOST:?请设置 HOTNEWS_SSH_HOST 环境变量}"
SERVER_PORT="${HOTNEWS_SSH_PORT:-22}"
SERVER_PROJECT_ROOT="${HOTNEWS_REMOTE_ROOT:-~/hotnews}"

echo "========================================"
echo "🚀 Fast Deploy (No Rebuild)"
echo "========================================"

# Step 1: Git Commit & Push
echo ">>> Step 1: Git Commit & Push..."
git add .
CHANGES=$(git diff --cached --stat)
if [ -z "$CHANGES" ]; then
    echo "No changes to commit."
else
    MSG="deploy: $(date +'%Y-%m-%d %H:%M:%S')"
    git commit -m "$MSG"
    echo "✅ Committed: $MSG"
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
git push origin "$CURRENT_BRANCH"
echo "✅ Pushed to origin/$CURRENT_BRANCH"

# Step 2: Remote Sync & Restart
echo ">>> Step 2: Remote Sync & Restart..."
ssh -p "${SERVER_PORT}" "${SERVER_USER}@${SERVER_HOST}" "bash -s" <<EOF
    set -e
    echo "   [Remote] cd ${SERVER_PROJECT_ROOT}..."
    cd ${SERVER_PROJECT_ROOT}
    
    BRANCH="$CURRENT_BRANCH"
    
    echo "   [Remote] Syncing code (branch: \$BRANCH)..."
    git fetch origin
    git checkout \$BRANCH 2>/dev/null || git checkout -b \$BRANCH origin/\$BRANCH
    git reset --hard origin/\$BRANCH
    
    echo "   [Remote] Recreating containers (force recreate to avoid bytecode cache)..."
    cd docker
    docker compose -f docker-compose-build.yml up -d --force-recreate hotnews hotnews-viewer
    
    echo "   ✅ Containers recreated."
EOF

# Step 3: Health Check
echo ">>> Step 3: Health Check..."
sleep 8
for i in 1 2 3; do
    if ssh -p "${SERVER_PORT}" "${SERVER_USER}@${SERVER_HOST}" "curl -fsS http://127.0.0.1:8090/health > /dev/null 2>&1"; then
        echo "   ✅ Health check passed."
        break
    else
        if [ $i -lt 3 ]; then
            echo "   ⏳ Waiting for service... (attempt $i/3)"
            sleep 5
        else
            echo "   ❌ Health check FAILED!"
            exit 1
        fi
    fi
done

echo "========================================"
echo "✅ Fast Deploy Success!"
echo "========================================"
