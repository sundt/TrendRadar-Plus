#!/bin/bash
set -e

# ============================================================
# 快速部署脚本（零停机）
#
# 原理：
#   代码通过 volume mount 映射到容器内，git pull 后代码即更新。
#   gunicorn 收到 SIGHUP 后会 graceful restart：
#     - 新 worker 用新代码启动
#     - 旧 worker 处理完当前请求后退出
#   全程不断连接，用户无感知。
#
# 注意：如果修改了 requirements 或 Dockerfile，需要用 deploy-rebuild.sh
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a
    source "$SCRIPT_DIR/.env"
    set +a
fi

SERVER_USER="${HOTNEWS_SSH_USER:?请设置 HOTNEWS_SSH_USER 环境变量}"
SERVER_HOST="${HOTNEWS_SSH_HOST:?请设置 HOTNEWS_SSH_HOST 环境变量}"
SERVER_PORT="${HOTNEWS_SSH_PORT:-22}"
SERVER_PROJECT_ROOT="${HOTNEWS_REMOTE_ROOT:-~/hotnews}"

echo "========================================"
echo "🚀 Fast Deploy (Zero Downtime)"
echo "========================================"

# Step 1: Git Commit & Push
echo ">>> Step 1: Git Commit & Push..."
git add .
CHANGES=$(git diff --cached --stat)
if [ -z "$CHANGES" ]; then
    echo "No changes to commit."
else
    # AI 自动生成 conventional commit message
    echo "   🤖 Generating commit message with AI..."
    MSG=$(bash "$SCRIPT_DIR/scripts/gen-commit-msg.sh" 2>/dev/null) || MSG=""
    if [ -z "$MSG" ]; then
        MSG="deploy: $(date +'%Y-%m-%d %H:%M:%S')"
        echo "   ⚠️  AI fallback, using timestamp"
    fi
    git commit -m "$MSG"
    echo "✅ Committed: $MSG"

    # 自动更新 CHANGELOG.md
    bash "$SCRIPT_DIR/scripts/update-changelog.sh" "$MSG" 2>&1 || true
    # 如果 CHANGELOG 有变更，追加到当前 commit
    if git diff --name-only | grep -q "CHANGELOG.md"; then
        git add CHANGELOG.md
        git commit --amend --no-edit
        echo "✅ CHANGELOG.md updated"
    fi
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
git push origin "$CURRENT_BRANCH"
echo "✅ Pushed to origin/$CURRENT_BRANCH"

# Step 2: Remote Sync & Graceful Reload
echo ">>> Step 2: Remote Sync & Reload..."
ssh -p "${SERVER_PORT}" "${SERVER_USER}@${SERVER_HOST}" "bash -s" <<EOF
    set -e
    echo "   [Remote] cd ${SERVER_PROJECT_ROOT}..."
    cd ${SERVER_PROJECT_ROOT}
    
    BRANCH="$CURRENT_BRANCH"
    
    echo "   [Remote] Syncing code (branch: \$BRANCH)..."
    git fetch origin
    git checkout -B \$BRANCH origin/\$BRANCH
    git reset --hard origin/\$BRANCH
    git clean -fd
    
    # Graceful reload: gunicorn 是 PID 1（Dockerfile 用了 exec），
    # docker kill --signal=HUP 直接发给 gunicorn master
    echo "   [Remote] Sending SIGHUP to gunicorn (graceful reload)..."
    docker kill --signal=HUP hotnews-viewer
    echo "   ✅ SIGHUP sent, new workers spawning with updated code"
    
    # 等待新 worker 启动完成
    sleep 3
    
    # hotnews 爬虫容器仍然用 force-recreate（不面向用户，无所谓停机）
    echo "   [Remote] Recreating crawler container..."
    cd docker
    docker compose -f docker-compose-build.yml up -d --force-recreate hotnews
    
    echo "   ✅ Deploy complete."
EOF

# Step 3: Health Check
echo ">>> Step 3: Health Check..."
sleep 5
for i in 1 2 3 4 5; do
    if ssh -p "${SERVER_PORT}" "${SERVER_USER}@${SERVER_HOST}" "curl -fsS http://127.0.0.1:8090/health > /dev/null 2>&1"; then
        echo "   ✅ Health check passed (attempt $i/5)."
        break
    else
        if [ $i -lt 5 ]; then
            echo "   ⏳ Waiting for service... (attempt $i/5)"
            sleep 5
        else
            echo "   ❌ Health check FAILED after 5 attempts!"
            echo "   💡 Check logs: ssh -p ${SERVER_PORT} ${SERVER_USER}@${SERVER_HOST} 'docker logs --tail 30 hotnews-viewer'"
            exit 1
        fi
    fi
done

echo "========================================"
echo "✅ Fast Deploy Success (Zero Downtime)!"
echo "========================================"
