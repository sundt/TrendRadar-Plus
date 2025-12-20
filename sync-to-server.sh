#!/bin/bash
# 快速同步修复代码到服务器的脚本

# ============================================
# 配置区域 - 从 openspec/specs/deployment.md 读取
# ============================================
SERVER_USER="root"                    # 服务器用户名
SERVER_HOST="120.77.222.205"          # 服务器地址（IP或域名）
SSH_PORT="52222"                      # SSH端口
PROJECT_PATH="~/hotnews"              # 项目在服务器上的路径
# ============================================

CONTROL_PATH="/tmp/hotnews-ssh-${SERVER_USER}@${SERVER_HOST}-${SSH_PORT}"
SSH_OPTS="-p ${SSH_PORT} -o ControlMaster=auto -o ControlPersist=600 -o ControlPath=${CONTROL_PATH}"

set -e  # 遇到错误立即退出

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

TAG="${1:-}"
shift || true

ROLLBACK=false
OFFLINE=false
FORCE=false

for arg in "$@"; do
    case "$arg" in
        "--rollback")
            ROLLBACK=true
            ;;
        "--offline")
            OFFLINE=true
            ;;
        "--force")
            FORCE=true
            ;;
        "")
            ;;
        *)
            echo "❌ 未知参数: $arg"
            echo "用法: $0 <image-tag> [--offline] [--rollback] [--force]"
            exit 1
            ;;
    esac
done

if [ -z "$TAG" ]; then
    echo "用法: $0 <image-tag> [--offline] [--rollback] [--force]"
    exit 1
fi

SERVER_ARCH=""

if [ "$ROLLBACK" != "true" ]; then
    if [ "$TAG" = "latest" ] || echo "$TAG" | grep -qi '^latest$'; then
        echo "❌ 禁止使用 latest，请使用明确版本号 tag（如 v1.2.3）"
        exit 1
    fi
    if ! echo "$TAG" | grep -q '^v'; then
        echo "❌ 镜像 tag 必须以 v 开头（如 v1.2.3），当前: $TAG"
        exit 1
    fi
fi

if [ "$ROLLBACK" != "true" ] && [ "$FORCE" != "true" ]; then
    if [ ! -f ".local_validation_ok" ]; then
        echo "❌ 拒绝部署：未检测到本地 Docker 验证标记文件 .local_validation_ok"
        echo "请先在本地运行："
        echo "  bash docker/local-validate.sh"
        echo "验证通过后再执行部署。"
        echo "如果你明确要跳过（不推荐）："
        echo "  $0 <image-tag> --force"
        exit 1
    fi

    validated_tag=$(grep -E '^viewer_tag=' .local_validation_ok 2>/dev/null | tail -n 1 | cut -d= -f2-)
    if [ -z "$validated_tag" ]; then
        echo "❌ 拒绝部署：.local_validation_ok 缺少 viewer_tag=...（请重新运行本地验证）"
        echo "请先在本地运行："
        echo "  export TREND_RADAR_VIEWER_TAG=$TAG"
        echo "  bash docker/local-validate.sh"
        exit 1
    fi
    if [ "$validated_tag" != "$TAG" ]; then
        echo "❌ 拒绝部署：本地验证的 viewer_tag 与本次部署 tag 不一致"
        echo "  validated viewer_tag: $validated_tag"
        echo "  deploy tag:          $TAG"
        echo "请重新按本次 tag 进行本地验证后再部署："
        echo "  export TREND_RADAR_VIEWER_TAG=$TAG"
        echo "  bash docker/local-validate.sh"
        exit 1
    fi
fi

copy_files() {
    local dest="$1"
    shift

    local remote_host="${dest%%:*}"
    local remote_path="${dest#*:}"

    remote_path_expanded=$(ssh ${SSH_OPTS} -o ConnectTimeout=5 "$remote_host" "eval echo $remote_path")
    if [ -z "$remote_path_expanded" ]; then
        echo "❌ 远端路径解析失败: $remote_path"
        exit 1
    fi

    ssh ${SSH_OPTS} -o ConnectTimeout=5 "$remote_host" "mkdir -p '$remote_path_expanded'" >/dev/null

    if command -v rsync >/dev/null 2>&1; then
        if ssh ${SSH_OPTS} -o ConnectTimeout=5 "$remote_host" "command -v rsync" >/dev/null 2>&1; then
            rsync -avz --progress -e "ssh ${SSH_OPTS}" "$@" "$dest"
            return
        fi
    fi

    echo "⚠️  远端未安装 rsync（或本机无 rsync），改用 tar+ssh 同步"
    tar_args=()
    for f in "$@"; do
        dir=$(cd "$(dirname "$f")" && pwd)
        base=$(basename "$f")
        tar_args+=("-C" "$dir" "$base")
    done
    COPYFILE_DISABLE=1 tar -czf - "${tar_args[@]}" | ssh ${SSH_OPTS} "$remote_host" "tar -xzf - -C '$remote_path_expanded'"
}

transfer_images_offline() {
    local remote="${SERVER_USER}@${SERVER_HOST}"

    if ! command -v docker >/dev/null 2>&1; then
        echo "❌ 本机未检测到 docker，无法离线传镜像"
        exit 1
    fi

    echo "📦 离线传输镜像到服务器（docker save | ssh | docker load），跳过 Docker Hub pull"
    ssh ${SSH_OPTS} -o ConnectTimeout=5 "$remote" "command -v docker >/dev/null 2>&1" || {
        echo "❌ 服务器未检测到 docker，无法离线导入镜像"
        exit 1
    }

    local images=(
        "wantcat/trendradar:${TAG}"
        "wantcat/trendradar-mcp:${TAG}"
        "wantcat/trendradar-viewer:${TAG}"
    )

    local local_arch
    local_arch=$(docker info --format '{{.Architecture}}' 2>/dev/null | tr '[:upper:]' '[:lower:]')
    case "$local_arch" in
        x86_64|amd64)
            local_arch="amd64"
            ;;
        aarch64|arm64)
            local_arch="arm64"
            ;;
    esac
    if [ -n "$SERVER_ARCH" ] && [ -n "$local_arch" ] && [ "$SERVER_ARCH" != "$local_arch" ]; then
        echo "⚠️  本机 docker 架构($local_arch) 与服务器($SERVER_ARCH) 不一致，离线部署必须确保镜像为服务器架构"
    fi

    for img in "${images[@]}"; do
        if ! docker image inspect "$img" >/dev/null 2>&1; then
            echo "❌ 本机未找到镜像：$img"
            echo "请先在本地 build 并确保 tag 正确，然后再运行离线部署。"
            exit 1
        fi

        img_arch=$(docker image inspect "$img" --format '{{.Architecture}}' 2>/dev/null | tr '[:upper:]' '[:lower:]' | tr -d '\r\n')
        case "$img_arch" in
            x86_64|amd64)
                img_arch="amd64"
                ;;
            aarch64|arm64)
                img_arch="arm64"
                ;;
        esac
        if [ -n "$SERVER_ARCH" ] && [ -n "$img_arch" ] && [ "$SERVER_ARCH" != "$img_arch" ]; then
            echo "❌ 镜像架构不匹配：$img ($img_arch) != server($SERVER_ARCH)"
            echo "请使用 DOCKER_DEFAULT_PLATFORM=linux/$SERVER_ARCH 重新 build 后再离线部署。"
            exit 1
        fi

        echo "➡️  传输 $img"
        docker save "$img" | ssh ${SSH_OPTS} "$remote" "docker load" >/dev/null
    done
}

echo "🚀 开始同步修复代码到服务器..."
echo "服务器: ${SERVER_USER}@${SERVER_HOST}"
echo "路径: ${PROJECT_PATH}"
echo ""

# 1. 测试 SSH 连接
echo "📡 测试服务器连接..."
if ! ssh ${SSH_OPTS} -o ConnectTimeout=5 ${SERVER_USER}@${SERVER_HOST} "echo '连接成功'"; then
    echo "❌ 无法连接到服务器，请检查服务器地址和 SSH 配置"
    exit 1
fi

SERVER_ARCH=$(ssh ${SSH_OPTS} -o ConnectTimeout=10 ${SERVER_USER}@${SERVER_HOST} "docker info --format '{{.Architecture}}' 2>/dev/null || uname -m" | tail -n 1 | tr -d '\r\n' | tr '[:upper:]' '[:lower:]')
if [ -z "$SERVER_ARCH" ]; then
    echo "❌ 无法获取服务器架构信息"
    exit 1
fi
case "$SERVER_ARCH" in
    x86_64|amd64)
        SERVER_ARCH="amd64"
        ;;
    aarch64|arm64)
        SERVER_ARCH="arm64"
        ;;
esac

# 2. 同步修复的文件
echo ""
echo "📦 同步修复文件..."
copy_files "${SERVER_USER}@${SERVER_HOST}:${PROJECT_PATH}/trendradar/web/" \
    trendradar/web/server.py

copy_files "${SERVER_USER}@${SERVER_HOST}:${PROJECT_PATH}/trendradar/web/" \
    trendradar/web/news_viewer.py

copy_files "${SERVER_USER}@${SERVER_HOST}:${PROJECT_PATH}/trendradar/web/templates/" \
    trendradar/web/templates/viewer.html

copy_files "${SERVER_USER}@${SERVER_HOST}:${PROJECT_PATH}/docker/" \
    docker/docker-compose.yml \
    docker/docker-compose-build.yml \
    docker/entrypoint.sh \
    docker/Dockerfile.viewer \
    docker/requirements.viewer.txt

echo "⚠️  文档同步可选，跳过"

if [ "$OFFLINE" = "true" ]; then
    transfer_images_offline
fi

# 3. 在服务器上重启服务
echo ""
echo "🔄 重启服务..."
ssh ${SSH_OPTS} ${SERVER_USER}@${SERVER_HOST} TAG="$TAG" OFFLINE="$OFFLINE" ROLLBACK="$ROLLBACK" bash -s << 'ENDSSH'
set -e
PROJECT_PATH=~/hotnews
cd "$PROJECT_PATH"

server_arch=$(docker info --format '{{.Architecture}}' 2>/dev/null || uname -m | tr -d '\r\n')
server_arch=$(echo "$server_arch" | tr '[:upper:]' '[:lower:]')
case "$server_arch" in
    x86_64|amd64)
        server_arch="amd64"
        ;;
    aarch64|arm64)
        server_arch="arm64"
        ;;
esac

compose_cmd=""
if command -v docker-compose >/dev/null 2>&1; then
    compose_cmd="docker-compose"
elif docker compose version >/dev/null 2>&1; then
    compose_cmd="docker compose"
fi

health_url=""

# 检测服务类型并重启
if [ -f "docker/docker-compose.yml" ]; then
    echo "检测到 Docker 部署，重启容器..."
    cd docker
    if [ -z "$compose_cmd" ]; then
        echo "❌ 未找到 docker-compose 或 docker compose"
        exit 1
    fi

    if [ "$ROLLBACK" = "true" ]; then
        if [ ! -f ".env.prev" ]; then
            echo "❌ 未找到 .env.prev，无法回滚"
            exit 1
        fi
        cp .env.prev .env
        if ! grep -q '^TREND_RADAR_VIEWER_TAG=' .env 2>/dev/null; then
            prev_tag=$(grep -E '^TREND_RADAR_TAG=' .env 2>/dev/null | tail -n 1 | cut -d= -f2-)
            if [ -n "$prev_tag" ]; then
                echo "⚠️ .env 缺少 TREND_RADAR_VIEWER_TAG，使用 TREND_RADAR_TAG=$prev_tag 补齐"
                printf "\nTREND_RADAR_VIEWER_TAG=%s\n" "$prev_tag" >> .env
            else
                echo "❌ 回滚配置缺少 TREND_RADAR_VIEWER_TAG 且无法推断"
                exit 1
            fi
        fi
        echo "↩️ 已回滚到上一次配置 (.env.prev)"
    else
        if [ -f ".env" ]; then
            cp .env .env.prev || true
        fi
        printf "TREND_RADAR_TAG=%s\nTREND_RADAR_MCP_TAG=%s\nTREND_RADAR_VIEWER_TAG=%s\nVIEWER_PORT=8090\n" "$TAG" "$TAG" "$TAG" > .env.new
    fi

    existing_8090=$(docker ps --format '{{.ID}} {{.Names}} {{.Ports}}' | grep ':8090->' || true)
    if [ "$ROLLBACK" != "true" ]; then
        if command -v ss >/dev/null 2>&1; then
            if ss -lntp 2>/dev/null | grep -q ":8090" && [ -z "$existing_8090" ]; then
                echo "❌ 127.0.0.1:8090 被非 Docker 服务占用（需要先停掉旧服务或改端口）"
                ss -lntp 2>/dev/null | grep ":8090" || true
                exit 1
            fi
        elif command -v netstat >/dev/null 2>&1; then
            if netstat -lntp 2>/dev/null | grep -q ":8090" && [ -z "$existing_8090" ]; then
                echo "❌ 127.0.0.1:8090 被非 Docker 服务占用（需要先停掉旧服务或改端口）"
                netstat -lntp 2>/dev/null | grep ":8090" || true
                exit 1
            fi
        fi
    fi

    if [ "$OFFLINE" != "true" ]; then
        if ! curl -fsS --max-time 8 https://registry-1.docker.io/v2/ >/dev/null 2>&1; then
            echo "❌ 服务器无法访问 Docker Hub registry（建议使用 --offline 离线部署）"
            if [ -f ".env.prev" ]; then
                cp .env.prev .env || true
            fi
            rm -f .env.new || true
            exit 1
        fi

        if [ -f ".env.new" ]; then
            mv .env.new .env
        fi

        $compose_cmd pull trend-radar trend-radar-viewer trend-radar-mcp
    else
        echo "⚠️ 离线模式：跳过 docker compose pull"
        if [ -f ".env.new" ]; then
            mv .env.new .env
        fi
    fi

    for img in "wantcat/trendradar:${TAG}" "wantcat/trendradar-mcp:${TAG}" "wantcat/trendradar-viewer:${TAG}"; do
        img_arch=$(docker image inspect "$img" --format '{{.Architecture}}' 2>/dev/null | tr '[:upper:]' '[:lower:]' | tr -d '\r\n' || true)
        case "$img_arch" in
            x86_64|amd64)
                img_arch="amd64"
                ;;
            aarch64|arm64)
                img_arch="arm64"
                ;;
        esac
        if [ -z "$img_arch" ]; then
            echo "❌ 服务器未找到镜像：$img"
            if [ -f ".env.prev" ]; then
                cp .env.prev .env || true
            fi
            exit 1
        fi
        if [ -n "$server_arch" ] && [ "$img_arch" != "$server_arch" ]; then
            echo "❌ 镜像架构不匹配：$img ($img_arch) != server($server_arch)"
            if [ -f ".env.prev" ]; then
                cp .env.prev .env || true
            fi
            exit 1
        fi
    done

    backup_suffix=$(date +%Y%m%d%H%M%S)
    backups=""
    if [ "$ROLLBACK" != "true" ]; then
        for svc in trend-radar-viewer trend-radar trend-radar-mcp; do
            if docker ps -a --format '{{.Names}}' | grep -qx "$svc"; then
                docker stop "$svc" >/dev/null 2>&1 || true
                docker rename "$svc" "${svc}.prev.${backup_suffix}" >/dev/null 2>&1 || true
                backups="$backups $svc:${svc}.prev.${backup_suffix}"
            fi
        done
    fi

    if ! $compose_cmd up -d trend-radar-viewer trend-radar trend-radar-mcp; then
        if [ -n "$backups" ]; then
            for pair in $backups; do
                svc="${pair%%:*}"
                prev="${pair#*:}"
                docker rm -f "$svc" >/dev/null 2>&1 || true
                if docker ps -a --format '{{.Names}}' | grep -qx "$prev"; then
                    docker rename "$prev" "$svc" >/dev/null 2>&1 || true
                    docker start "$svc" >/dev/null 2>&1 || true
                fi
            done
        fi
        if [ -f ".env.prev" ]; then
            cp .env.prev .env || true
        fi
        exit 1
    fi

    viewer_cid=$($compose_cmd ps -q trend-radar-viewer || true)
    if [ -z "$viewer_cid" ]; then
        echo "❌ trend-radar-viewer 容器未启动（compose 未创建该服务或启动失败）"
        $compose_cmd ps || true
        exit 1
    fi

    health_url="http://127.0.0.1:8090/health"

    echo "✅ 等待 viewer 健康检查..."
    for i in $(seq 1 30); do
        if curl -fsS "http://127.0.0.1:8090/health" >/dev/null 2>&1; then
            echo "✅ viewer 健康检查通过"
            if [ -n "$backups" ]; then
                for pair in $backups; do
                    prev="${pair#*:}"
                    docker rm -f "$prev" >/dev/null 2>&1 || true
                done
            fi
            break
        fi
        if [ "$i" -eq 30 ]; then
            echo "❌ viewer 健康检查失败"
            docker rm -f trend-radar-viewer trend-radar trend-radar-mcp >/dev/null 2>&1 || true
            if [ -n "$backups" ]; then
                for pair in $backups; do
                    svc="${pair%%:*}"
                    prev="${pair#*:}"
                    if docker ps -a --format '{{.Names}}' | grep -qx "$prev"; then
                        docker rename "$prev" "$svc" >/dev/null 2>&1 || true
                        docker start "$svc" >/dev/null 2>&1 || true
                    fi
                done
            fi
            if [ -f ".env.prev" ]; then
                cp .env.prev .env || true
            fi
            exit 1
        fi
        sleep 2
    done
elif pgrep -f "trendradar.web.server" > /dev/null; then
    echo "检测到 Python 直接运行，重启服务..."
    pkill -f "trendradar.web.server"
    nohup python3 -m trendradar.web.server --host 0.0.0.0 --port 8080 > /tmp/trendradar.log 2>&1 &
    echo "服务已重启，日志: /tmp/trendradar.log"

    health_url="http://127.0.0.1:8080/health"
else
    echo "⚠️  未检测到运行中的服务，请手动启动"
fi

# 验证服务状态
echo ""
echo "✅ 等待服务启动..."
sleep 3

if [ -n "$health_url" ] && curl -fsS "$health_url" > /dev/null 2>&1; then
    echo "✅ 服务运行正常"
else
    echo "⚠️  服务可能未正常启动，请检查日志"
fi
ENDSSH

echo ""
echo "🎉 同步完成！"
echo ""
echo "验证修复："
echo "  curl -fsS http://${SERVER_HOST}:8090/health"
echo "  curl -fsS http://${SERVER_HOST}:8090/api/news | python3 -m json.tool | head"
echo ""
echo "回滚："
echo "  $0 <any-tag> --rollback"
echo ""
