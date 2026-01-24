#!/bin/bash
# ============================================
# 从服务器同步数据库到本地
# ============================================
# 用法: ./scripts/sync_from_server.sh
# 配置: 从 .env 文件读取服务器信息
# ============================================

set -e

LOCAL_PROJECT_PATH="$(cd "$(dirname "$0")/.." && pwd)"

# 从 .env 文件加载配置
if [ -f "${LOCAL_PROJECT_PATH}/.env" ]; then
    export $(grep -v '^#' "${LOCAL_PROJECT_PATH}/.env" | xargs)
fi

# 配置 - 从环境变量读取
SERVER_USER="${HOTNEWS_SSH_USER:?请设置 HOTNEWS_SSH_USER 环境变量}"
SERVER_HOST="${HOTNEWS_SSH_HOST:?请设置 HOTNEWS_SSH_HOST 环境变量}"
SERVER_PORT="${HOTNEWS_SSH_PORT:-22}"
SERVER_PROJECT_PATH="${HOTNEWS_REMOTE_ROOT:-~/hotnews}"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔄 从服务器同步数据到本地${NC}"
echo "服务器: ${SERVER_USER}@${SERVER_HOST}:${SERVER_PORT}"
echo "服务器路径: ${SERVER_PROJECT_PATH}"
echo "本地路径: ${LOCAL_PROJECT_PATH}"
echo ""

# 确保本地 output 目录存在
mkdir -p "${LOCAL_PROJECT_PATH}/output"

# SSH 选项
SSH_OPTS="-p ${SERVER_PORT}"
SCP_OPTS="-P ${SERVER_PORT}"

# 1. 同步 online.db (主要的在线数据库)
echo -e "${YELLOW}📥 同步 online.db...${NC}"
scp ${SCP_OPTS} "${SERVER_USER}@${SERVER_HOST}:${SERVER_PROJECT_PATH}/output/online.db" \
    "${LOCAL_PROJECT_PATH}/output/online.db.server" 2>/dev/null || {
    echo -e "${RED}❌ 同步 online.db 失败，尝试从 Docker 容器复制...${NC}"
    ssh ${SSH_OPTS} "${SERVER_USER}@${SERVER_HOST}" "docker cp hotnews-viewer:/app/output/online.db /tmp/online.db && cat /tmp/online.db" > "${LOCAL_PROJECT_PATH}/output/online.db.server"
}

if [ -f "${LOCAL_PROJECT_PATH}/output/online.db.server" ]; then
    # 备份本地数据库
    if [ -f "${LOCAL_PROJECT_PATH}/output/online.db" ]; then
        cp "${LOCAL_PROJECT_PATH}/output/online.db" "${LOCAL_PROJECT_PATH}/output/online.db.local.bak"
        echo "  已备份本地 online.db 到 online.db.local.bak"
    fi
    mv "${LOCAL_PROJECT_PATH}/output/online.db.server" "${LOCAL_PROJECT_PATH}/output/online.db"
    echo -e "${GREEN}✅ online.db 同步成功${NC}"
else
    echo -e "${RED}❌ online.db 同步失败${NC}"
fi

# 2. 同步 user.db (用户数据库)
echo -e "${YELLOW}📥 同步 user.db...${NC}"
scp ${SCP_OPTS} "${SERVER_USER}@${SERVER_HOST}:${SERVER_PROJECT_PATH}/output/user.db" \
    "${LOCAL_PROJECT_PATH}/output/user.db.server" 2>/dev/null || {
    echo -e "${RED}❌ 同步 user.db 失败，尝试从 Docker 容器复制...${NC}"
    ssh ${SSH_OPTS} "${SERVER_USER}@${SERVER_HOST}" "docker cp hotnews-viewer:/app/output/user.db /tmp/user.db && cat /tmp/user.db" > "${LOCAL_PROJECT_PATH}/output/user.db.server"
}

if [ -f "${LOCAL_PROJECT_PATH}/output/user.db.server" ]; then
    if [ -f "${LOCAL_PROJECT_PATH}/output/user.db" ]; then
        cp "${LOCAL_PROJECT_PATH}/output/user.db" "${LOCAL_PROJECT_PATH}/output/user.db.local.bak"
        echo "  已备份本地 user.db 到 user.db.local.bak"
    fi
    mv "${LOCAL_PROJECT_PATH}/output/user.db.server" "${LOCAL_PROJECT_PATH}/output/user.db"
    echo -e "${GREEN}✅ user.db 同步成功${NC}"
else
    echo -e "${RED}❌ user.db 同步失败${NC}"
fi

# 3. 同步 hotnews.db (热点新闻数据库，可选)
echo -e "${YELLOW}📥 同步 hotnews.db...${NC}"
scp ${SCP_OPTS} "${SERVER_USER}@${SERVER_HOST}:${SERVER_PROJECT_PATH}/output/hotnews.db" \
    "${LOCAL_PROJECT_PATH}/output/hotnews.db.server" 2>/dev/null || {
    ssh ${SSH_OPTS} "${SERVER_USER}@${SERVER_HOST}" "docker cp hotnews-viewer:/app/output/hotnews.db /tmp/hotnews.db 2>/dev/null && cat /tmp/hotnews.db" > "${LOCAL_PROJECT_PATH}/output/hotnews.db.server" 2>/dev/null
}

if [ -f "${LOCAL_PROJECT_PATH}/output/hotnews.db.server" ] && [ -s "${LOCAL_PROJECT_PATH}/output/hotnews.db.server" ]; then
    if [ -f "${LOCAL_PROJECT_PATH}/output/hotnews.db" ]; then
        cp "${LOCAL_PROJECT_PATH}/output/hotnews.db" "${LOCAL_PROJECT_PATH}/output/hotnews.db.local.bak"
    fi
    mv "${LOCAL_PROJECT_PATH}/output/hotnews.db.server" "${LOCAL_PROJECT_PATH}/output/hotnews.db"
    echo -e "${GREEN}✅ hotnews.db 同步成功${NC}"
else
    rm -f "${LOCAL_PROJECT_PATH}/output/hotnews.db.server"
    echo -e "${YELLOW}⚠️ hotnews.db 不存在或为空，跳过${NC}"
fi

echo ""
echo -e "${GREEN}🎉 数据同步完成！${NC}"
echo ""
echo "同步的文件:"
ls -lh "${LOCAL_PROJECT_PATH}/output/"*.db 2>/dev/null || echo "  (无数据库文件)"
echo ""
echo "现在可以运行本地服务器进行测试:"
echo "  cd ${LOCAL_PROJECT_PATH}"
echo "  python -m hotnews.web.server"
