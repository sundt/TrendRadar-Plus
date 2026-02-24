#!/bin/bash
set -e

# 脚本所在目录（无论从哪里调用都能找到 .env）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load .env if it exists
if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a
    source "$SCRIPT_DIR/.env"
    set +a
fi
# Configuration (Env vars with defaults) - 必须通过环境变量设置
SERVER_USER="${HOTNEWS_SSH_USER:?请设置 HOTNEWS_SSH_USER 环境变量}"
SERVER_HOST="${HOTNEWS_SSH_HOST:?请设置 HOTNEWS_SSH_HOST 环境变量}"
SERVER_PORT="${HOTNEWS_SSH_PORT:-22}"
SERVER_PROJECT_ROOT="${HOTNEWS_REMOTE_ROOT:-~/hotnews}"

# Service names (Mapped from user request "trend-radar" to actual "hotnews")
SERVICES="hotnews hotnews-viewer"
DC_FILE="docker-compose-build.yml"

echo "========================================"
echo "🚀 Starting Full Rebuild & Deploy"
echo "========================================"

# Step 1: Git Commit
echo ">>> Step 1: Git Commit..."
git add .
CHANGES=$(git diff --cached --stat)
if [ -z "$CHANGES" ]; then
    echo "No changes to commit."
else
    # Auto-commit with timestamp and stat if no message provided
    MSG="Rebuild $(date +'%Y-%m-%d %H:%M:%S')"
    # Append stats to commit body if needed, but for -m just keep it simple or use multiple -m
    git commit -m "$MSG"
    echo "✅ Committed: $MSG"
fi

# Step 2: Git Push
echo ">>> Step 2: Git Push..."
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
git push origin "$CURRENT_BRANCH"
echo "✅ Pushed to origin/$CURRENT_BRANCH"

# Step 3: Remote Rebuild
echo ">>> Step 3: Remote Rebuild on ${SERVER_HOST}..."

# We execute the remote commands in a single ssh session for atomicity
ssh -p "${SERVER_PORT}" "${SERVER_USER}@${SERVER_HOST}" "bash -s" <<EOF
    set -e
    echo "   [Remote] cd ${SERVER_PROJECT_ROOT}..."
    cd ${SERVER_PROJECT_ROOT}
    
    # Get current branch from local
    BRANCH="$CURRENT_BRANCH"
    
    # Clean up old kernel submodule files if they exist
    if [ -d "hotnews/kernel" ] && [ ! -f "hotnews/kernel/__init__.py" ]; then
        echo "   [Remote] Cleaning old kernel submodule..."
        rm -rf hotnews/kernel
    fi
    
    # Force sync with remote
    echo "   [Remote] Force syncing branch \$BRANCH..."
    git fetch origin
    git checkout \$BRANCH 2>/dev/null || git checkout -b \$BRANCH origin/\$BRANCH
    git reset --hard origin/\$BRANCH
    
    echo "   [Remote] Building services ($SERVICES)..."
    cd docker
    docker compose -f ${DC_FILE} build $SERVICES
    
    echo "   [Remote] Creating containers..."
    docker compose -f ${DC_FILE} up -d --force-recreate $SERVICES
    
    echo "   ✅ Remote steps completed."
EOF

# Step 4: Health Check & Rollback Warning
echo ">>> Step 4: Health Check..."

# Check health endpoint via SSH (safer than external curl usually)
echo "   Checking viewer health (http://127.0.0.1:8090/health)..."
if ssh -p "${SERVER_PORT}" "${SERVER_USER}@${SERVER_HOST}" "curl -fsS http://127.0.0.1:8090/health >/dev/null"; then
    echo "   ✅ Health check passed."
else
    echo "   ❌ Health check FAILED!"
    echo "   ⚠️  Immediate rollback NOT performed (images overwritten)."
    echo "   ⚠️  Please check server logs immediately."
    ssh -p "${SERVER_PORT}" "${SERVER_USER}@${SERVER_HOST}" "docker logs --tail 20 hotnews-viewer"
    exit 1
fi

# Check container status
echo "   Checking container status..."
ssh -p "${SERVER_PORT}" "${SERVER_USER}@${SERVER_HOST}" "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep hotnews"

echo "========================================"
echo "✅ Deploy Success!"
echo "========================================"
