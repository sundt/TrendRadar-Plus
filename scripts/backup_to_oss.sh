#!/bin/bash
# ============================================
# HotNews 数据库自动备份到阿里云 OSS
# ============================================
# 用法: bash scripts/backup_to_oss.sh
# 定时: 每天 02:30 自动执行（由 setup_oss_backup.sh 配置）
# 保留: 7天，自动清理更早的备份
# ============================================

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DATE_TAG=$(date +"%Y-%m-%d")
DB_DIR="/root/hotnews/output"
LOG_DIR="/root/hotnews/logs"
TMP_DIR="/tmp/hotnews_backup_$$"
OSS_CONFIG="/root/.ossutilconfig/config"
CONFIG_FILE="/root/hotnews/scripts/.oss_backup_config"
RETENTION_DAYS=7

mkdir -p "$LOG_DIR" "$TMP_DIR"

log() { echo -e "$(date '+%Y-%m-%d %H:%M:%S') $1"; }

# 加载 OSS 配置
if [ ! -f "$CONFIG_FILE" ]; then
    log "${RED}❌ 未找到配置文件: $CONFIG_FILE，请先运行 setup_oss_backup.sh${NC}"
    exit 1
fi
source "$CONFIG_FILE"

OSS_BASE="oss://${OSS_BUCKET}/hotnews-db-backup"

log "${BLUE}============================================${NC}"
log "${BLUE}  HotNews 数据库备份开始 - $TIMESTAMP${NC}"
log "${BLUE}============================================${NC}"

# ============================================
# 函数：备份单个数据库文件
# ============================================
backup_db() {
    local DB_FILE="$1"
    local DB_NAME=$(basename "$DB_FILE")
    local BACKUP_NAME="${DB_NAME%.db}_${TIMESTAMP}.db"
    local BACKUP_PATH="$TMP_DIR/$BACKUP_NAME"
    local OSS_PATH="$OSS_BASE/$DATE_TAG/$BACKUP_NAME"

    if [ ! -f "$DB_FILE" ]; then
        log "${YELLOW}⚠️  $DB_NAME 不存在，跳过${NC}"
        return 0
    fi

    # 使用 SQLite 的 .dump + .backup 方式保证文件一致性（避免备份时文件被写入）
    if command -v sqlite3 &>/dev/null; then
        log "  正在使用 sqlite3 安全备份 $DB_NAME..."
        sqlite3 "$DB_FILE" ".backup '$BACKUP_PATH'"
        log "  正在压缩备份文件..."
        gzip -f "$BACKUP_PATH"
        BACKUP_PATH="${BACKUP_PATH}.gz"
        BACKUP_NAME="${BACKUP_NAME}.gz"
        OSS_PATH="${OSS_PATH}.gz"
    else
        log "  正在复制 $DB_NAME..."
        cp "$DB_FILE" "$BACKUP_PATH"
        log "  正在压缩备份文件..."
        gzip -f "$BACKUP_PATH"
        BACKUP_PATH="${BACKUP_PATH}.gz"
        BACKUP_NAME="${BACKUP_NAME}.gz"
        OSS_PATH="${OSS_PATH}.gz"
    fi

    local SIZE=$(du -sh "$BACKUP_PATH" | cut -f1)
    log "  本地备份大小: $SIZE"

    # 上传到 OSS
    log "  正在上传到 $OSS_PATH ..."
    if ossutil cp "$BACKUP_PATH" "$OSS_PATH" -c "$OSS_CONFIG" --force; then
        log "${GREEN}  ✅ $DB_NAME 备份成功 → OSS${NC}"
    else
        log "${RED}  ❌ $DB_NAME 上传失败！${NC}"
        return 1
    fi
}

# ============================================
# 1. 备份核心数据库
# ============================================
log ""
log "${YELLOW}📦 开始备份数据库...${NC}"

# 最核心：用户数据（绝对不能丢）
log "→ [1/2] user.db（用户账号/订阅/支付数据）"
backup_db "$DB_DIR/user.db"

# 新闻内容数据
log "→ [2/2] online.db（新闻内容数据）"
backup_db "$DB_DIR/online.db"

# ============================================
# 2. 清理超过 N 天的旧备份
# ============================================
log ""
log "${YELLOW}🧹 清理 $RETENTION_DAYS 天前的旧备份...${NC}"

CUTOFF_DATE=$(date -d "$RETENTION_DAYS days ago" +"%Y-%m-%d" 2>/dev/null || \
              date -v-${RETENTION_DAYS}d +"%Y-%m-%d" 2>/dev/null)

if [ -n "$CUTOFF_DATE" ]; then
    # 列出所有备份日期目录
    ossutil ls "$OSS_BASE/" -c "$OSS_CONFIG" 2>/dev/null | grep -oP '\d{4}-\d{2}-\d{2}' | sort -u | while read -r DIR_DATE; do
        if [[ "$DIR_DATE" < "$CUTOFF_DATE" ]]; then
            log "  删除旧备份目录: $DIR_DATE"
            ossutil rm "$OSS_BASE/$DIR_DATE/" -c "$OSS_CONFIG" -r --force 2>/dev/null || true
        fi
    done
    log "${GREEN}✅ 旧备份清理完成（保留 $RETENTION_DAYS 天内的备份）${NC}"
else
    log "${YELLOW}⚠️ 无法计算截止日期，跳过清理${NC}"
fi

# ============================================
# 3. 清理临时文件
# ============================================
rm -rf "$TMP_DIR"

# ============================================
# 4. 输出当前 OSS 备份列表
# ============================================
log ""
log "${BLUE}📋 当前 OSS 备份文件列表（最近 3 天）:${NC}"
ossutil ls "$OSS_BASE/" -c "$OSS_CONFIG" 2>/dev/null | tail -20 || true

log ""
log "${GREEN}============================================${NC}"
log "${GREEN}  🎉 备份完成: $TIMESTAMP${NC}"
log "${GREEN}  OSS路径: $OSS_BASE/${NC}"
log "${GREEN}============================================${NC}"
