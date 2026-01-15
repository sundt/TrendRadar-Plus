#!/bin/bash
set -e

# Configuration
SERVER_USER="${HOTNEWS_SSH_USER:-root}"
SERVER_HOST="${HOTNEWS_SSH_HOST:-120.77.222.205}"
SERVER_PORT="${HOTNEWS_SSH_PORT:-52222}"
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

git push origin main
echo "✅ Pushed to origin/main"

# Step 2: Remote Sync & Restart
echo ">>> Step 2: Remote Sync & Restart..."
ssh -p "${SERVER_PORT}" "${SERVER_USER}@${SERVER_HOST}" "bash -s" <<EOF
    set -e
    echo "   [Remote] cd ${SERVER_PROJECT_ROOT}..."
    cd ${SERVER_PROJECT_ROOT}
    
    echo "   [Remote] Syncing code..."
    git fetch origin
    git reset --hard origin/main
    
    echo "   [Remote] Updating submodules..."
    git submodule update --init --recursive
    
    echo "   [Remote] Restarting containers (no rebuild)..."
    cd docker
    docker compose restart hotnews hotnews-viewer hotnews-mcp
    
    echo "   ✅ Containers restarted."
EOF

# Step 3: Health Check
echo ">>> Step 3: Health Check..."
sleep 3
if ssh -p "${SERVER_PORT}" "${SERVER_USER}@${SERVER_HOST}" "curl -fsS http://127.0.0.1:8090/health > /dev/null"; then
    echo "   ✅ Health check passed."
else
    echo "   ❌ Health check FAILED!"
    exit 1
fi

echo "========================================"
echo "✅ Fast Deploy Success!"
echo "========================================"
