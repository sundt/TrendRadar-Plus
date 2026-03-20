#!/bin/bash
set -e

# 检查配置文件
if [ ! -f "/app/config/config.yaml" ] || [ ! -f "/app/config/frequency_words.txt" ]; then
    echo "❌ 配置文件缺失"
    exit 1
fi

# 保存环境变量
env >> /etc/environment

case "${RUN_MODE:-cron}" in
"viewer")
    echo "🌐 启动 Viewer (FastAPI + Gunicorn)..."
    HOST="${VIEWER_HOST:-0.0.0.0}"
    PORT="${VIEWER_PORT:-8090}"
    WORKERS="${VIEWER_WORKERS:-2}"
    MAX_REQUESTS="${VIEWER_MAX_REQUESTS:-1000}"
    MAX_REQUESTS_JITTER="${VIEWER_MAX_REQUESTS_JITTER:-200}"
    exec gunicorn hotnews.web.server:app \
        -k uvicorn.workers.UvicornWorker \
        --bind "${HOST}:${PORT}" \
        --workers "${WORKERS}" \
        --max-requests "${MAX_REQUESTS}" \
        --max-requests-jitter "${MAX_REQUESTS_JITTER}" \
        --graceful-timeout 30 \
        --timeout 120 \
        --pid /tmp/gunicorn.pid \
        --access-logfile - \
        --error-logfile -
    ;;
"once")
    echo "🔄 单次执行"
    exec /usr/local/bin/python -m hotnews
    ;;
"cron")
    # 生成 crontab
    echo "${CRON_SCHEDULE:-*/30 * * * *} cd /app && /usr/local/bin/python -m hotnews" > /tmp/crontab
    # 每日凌晨 3 点执行数据清理（防止数据库无限增长）
    echo "0 3 * * * cd /app && /usr/local/bin/python scripts/cleanup_old_data.py >> /tmp/cleanup.log 2>&1" >> /tmp/crontab
    
    echo "📅 生成的crontab内容:"
    cat /tmp/crontab

    if ! /usr/local/bin/supercronic -test /tmp/crontab; then
        echo "❌ crontab格式验证失败"
        exit 1
    fi

    # 立即执行一次（如果配置了）
    if [ "${IMMEDIATE_RUN:-false}" = "true" ]; then
        echo "▶️ 立即执行一次"
        /usr/local/bin/python -m hotnews
    fi

    # 启动 Web 服务器（如果配置了）
    if [ "${ENABLE_WEBSERVER:-false}" = "true" ]; then
        echo "🌐 启动 Web 服务器..."
        /usr/local/bin/python manage.py start_webserver
    fi

    echo "⏰ 启动supercronic: ${CRON_SCHEDULE:-*/30 * * * *}"
    echo "🎯 supercronic 将作为 PID 1 运行"

    exec /usr/local/bin/supercronic -passthrough-logs /tmp/crontab
    ;;
*)
    exec "$@"
    ;;
esac