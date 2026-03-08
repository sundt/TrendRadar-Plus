#!/bin/bash
# ============================================
# HotNews 数据库灾难恢复 (DR) 脚本
# ============================================
# 用法: bash scripts/restore_from_oss.sh
# ============================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

DB_DIR="/root/hotnews/output"
OSS_CONFIG="/root/.ossutilconfig/config"
CONFIG_FILE="/root/hotnews/scripts/.oss_backup_config"

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  HotNews 数据库灾难恢复 (DR)${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# 1. 检查必备条件
if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}❌ 未找到配置文件: $CONFIG_FILE，无法执行恢复。${NC}"
    exit 1
fi
source "$CONFIG_FILE"

if ! command -v ossutil &>/dev/null; then
    echo -e "${RED}❌ ossutil 未安装，无法执行恢复。${NC}"
    exit 1
fi

OSS_BASE="oss://${OSS_BUCKET}/hotnews-db-backup"

# 2. 获取 OSS 上最近的备份日期
echo -e "${YELLOW}🔍 正在检索 OSS 上的备份列表...${NC}"
LATEST_DATES=$(ossutil ls "$OSS_BASE/" -c "$OSS_CONFIG" 2>/dev/null | grep -oP '\d{4}-\d{2}-\d{2}' | sort -ur | head -3)

if [ -z "$LATEST_DATES" ]; then
    echo -e "${RED}❌ 在 OSS 上未找到任何备份！${NC}"
    exit 1
fi

echo -e "${GREEN}发现以下日期的备份：${NC}"
i=1
declare -a DATE_ARRAY
for d in $LATEST_DATES; do
    echo "  [$i] $d"
    DATE_ARRAY[$i]=$d
    ((i++))
done

# 3. 让用户选择恢复哪一天的备份
echo ""
read -p "请输入要恢复的日期编号 [1-$((i-1))] (默认 1): " SELECT_IDX
SELECT_IDX=${SELECT_IDX:-1}

if [ -z "${DATE_ARRAY[$SELECT_IDX]}" ]; then
    echo -e "${RED}❌ 无效的选择。${NC}"
    exit 1
fi

TARGET_DATE="${DATE_ARRAY[$SELECT_IDX]}"
OSS_DATE_DIR="$OSS_BASE/$TARGET_DATE/"

echo -e "\n${YELLOW}📁 正在列出 $TARGET_DATE 的备份文件...${NC}"
ossutil ls "$OSS_DATE_DIR" -c "$OSS_CONFIG" | grep "\.db\.gz" | awk '{print $NF}' | rev | cut -d/ -f1 | rev > /tmp/oss_files.txt

if [ ! -s /tmp/oss_files.txt ]; then
    echo -e "${RED}❌ 在 $TARGET_DATE 目录下没有找到有效的备份文件 (.db.gz)。${NC}"
    exit 1
fi

echo -e "${GREEN}找到以下备份文件：${NC}"
cat /tmp/oss_files.txt

# 4. 确认是否继续
echo ""
echo -e "${RED}⚠️  警告：恢复操作将覆盖当前的在线数据库！${NC}"
echo -e "${RED}建议在操作前先停止 Docker 容器：docker stop hotnews-viewer${NC}"
read -p "确定要继续吗？输入 y 继续: " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "已取消。"
    exit 0
fi

# 5. 执行下载与解压恢复
mkdir -p "$DB_DIR"
for GZ_FILE in $(cat /tmp/oss_files.txt); do
    DB_NAME=$(echo "$GZ_FILE" | grep -oP '^[a-zA-Z_]+(?=_)').db
    if [ -z "$DB_NAME" ] || [ "$DB_NAME" == ".db" ]; then continue; fi

    echo -e "\n${YELLOW}📥 下载 $GZ_FILE ...${NC}"
    ossutil cp "$OSS_DATE_DIR$GZ_FILE" "/tmp/$GZ_FILE" -c "$OSS_CONFIG" --force

    echo -e "${YELLOW}🗜️ 解压 $GZ_FILE ...${NC}"
    gunzip -f "/tmp/$GZ_FILE"
    UNZIPPED_FILE="/tmp/${GZ_FILE%.gz}"

    # 备份现有的
    if [ -f "$DB_DIR/$DB_NAME" ]; then
        echo -e "${YELLOW}💾 备份现有 $DB_NAME 为 $DB_NAME.dr.bak ...${NC}"
        cp "$DB_DIR/$DB_NAME" "$DB_DIR/$DB_NAME.dr.bak"
    fi

    # 替换
    echo -e "${YELLOW}🔄 恢复 $DB_NAME ...${NC}"
    mv "$UNZIPPED_FILE" "$DB_DIR/$DB_NAME"
    chmod 644 "$DB_DIR/$DB_NAME"
    chown 501:1000 "$DB_DIR/$DB_NAME" 2>/dev/null || true # 尝试恢复 hotnews-viewer 容器的权限

    echo -e "${GREEN}✅ $DB_NAME 恢复成功！${NC}"
done

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  🎉 灾难恢复完成！${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "建议操作："
echo "1. 请重启 Docker 容器以加载新数据库："
echo "   docker restart hotnews-viewer"
echo "2. 如果发现数据异常，你可以回滚：cp output/user.db.dr.bak output/user.db"
echo ""
