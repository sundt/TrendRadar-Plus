#!/bin/bash

# 配置备份保存路径
BACKUP_ROOT="/Users/sun/Downloads/backup"
PROJECT_DIR=$(pwd)
PROJECT_NAME=$(basename "$PROJECT_DIR")
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_ROOT}/${PROJECT_NAME}_backup_${TIMESTAMP}.tar.gz"

# 确保备份目录存在
mkdir -p "$BACKUP_ROOT"

echo "📦 开始备份项目: $PROJECT_NAME"
echo "📂 源目录: $PROJECT_DIR"
echo "💾 目标文件: $BACKUP_FILE"

# 执行打包
# --exclude: 排除不需要的大文件和垃圾文件
tar -czf "$BACKUP_FILE" \
    --exclude=".git" \
    --exclude="node_modules" \
    --exclude="__pycache__" \
    --exclude="*.pyc" \
    --exclude=".DS_Store" \
    --exclude=".venv" \
    --exclude="venv" \
    --exclude="env" \
    --exclude="output/*.html" \
    --exclude="output/*.txt" \
    -C "$(dirname "$PROJECT_DIR")" \
    "$PROJECT_NAME"

if [ $? -eq 0 ]; then
    echo "✅ 备份成功！"
    echo "大小: $(du -h "$BACKUP_FILE" | cut -f1)"
else
    echo "❌ 备份失败！"
    exit 1
fi
