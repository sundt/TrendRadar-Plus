#!/bin/bash
# ============================================
# 一键安装 ossutil 并配置 OSS 备份环境
# 使用 ECS 实例角色（RAM Role），无需 AccessKey
# 运行一次即可，之后使用 backup_to_oss.sh 备份
# ============================================
# 用法: bash scripts/setup_oss_backup.sh
# ============================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  HotNews OSS 备份环境初始化（ECS 实例角色）${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# ============================================
# 请在下方填写 OSS 基础配置（无需 AccessKey）
# ============================================
ECS_ROLE_NAME="hotnews-oss-backup-role"  # ECS 绑定的 RAM 角色名称
OSS_ENDPOINT=""                          # OSS Endpoint，如: oss-cn-shenzhen.aliyuncs.com
OSS_BUCKET=""                            # Bucket 名称，如: my-hotnews-backup
# ============================================

# 检查配置是否填写
if [ -z "$OSS_ENDPOINT" ] || [ -z "$OSS_BUCKET" ]; then
    echo -e "${RED}❌ 请先在脚本顶部填写 OSS 配置信息！${NC}"
    echo ""
    echo "需要填写的配置："
    echo "  OSS_ENDPOINT  - 如: oss-cn-shenzhen.aliyuncs.com"
    echo "  OSS_BUCKET    - 你的 Bucket 名称"
    exit 1
fi

# 0. 检查 ECS 实例角色是否已绑定
echo -e "${YELLOW}🔍 检查 ECS 实例角色...${NC}"
ACTUAL_ROLE=$(curl -s --max-time 3 http://100.100.100.200/latest/meta-data/ram/security-credentials/ 2>/dev/null)
if [ -z "$ACTUAL_ROLE" ]; then
    echo -e "${RED}❌ 未检测到 ECS 实例角色，请先在 ECS 控制台绑定 RAM 角色${NC}"
    exit 1
fi
echo -e "${GREEN}✅ 检测到实例角色: $ACTUAL_ROLE${NC}"
ECS_ROLE_NAME="$ACTUAL_ROLE"

# 1. 安装 ossutil
echo -e "${YELLOW}📦 安装 ossutil...${NC}"
if ! command -v ossutil &>/dev/null; then
    curl -sSL https://gosspublic.alicdn.com/ossutil/install.sh | bash
    echo -e "${GREEN}✅ ossutil 安装成功${NC}"
else
    echo -e "${GREEN}✅ ossutil 已存在，跳过安装${NC}"
fi

# 2. 写入 ossutil 配置（使用 ECS RAM Role 模式，无需 AccessKey）
echo -e "${YELLOW}🔧 配置 ossutil ECS 实例角色认证...${NC}"
mkdir -p /root/.ossutilconfig 2>/dev/null || true
cat > /root/.ossutilconfig/config <<EOF
[Credentials]
language=CH
endpoint=$OSS_ENDPOINT
mode=EcsRamRole
EcsRoleName=$ECS_ROLE_NAME
EOF
chmod 600 /root/.ossutilconfig/config
echo -e "${GREEN}✅ ossutil ECS 实例角色认证配置完成（无 AccessKey）${NC}"

# 3. 保存配置到备份脚本读取的配置文件
CONFIG_FILE="/root/hotnews/scripts/.oss_backup_config"
cat > "$CONFIG_FILE" <<EOF
OSS_BUCKET=$OSS_BUCKET
OSS_ENDPOINT=$OSS_ENDPOINT
ECS_ROLE_NAME=$ECS_ROLE_NAME
EOF
chmod 600 "$CONFIG_FILE"

# 4. 测试连通性
echo -e "${YELLOW}🔌 测试 OSS 连接...${NC}"
if ossutil ls "oss://$OSS_BUCKET" -c /root/.ossutilconfig/config &>/dev/null; then
    echo -e "${GREEN}✅ OSS 连接成功！${NC}"
else
    echo -e "${RED}❌ OSS 连接失败，请检查配置是否正确${NC}"
    exit 1
fi

# 5. 在 OSS 上创建备份目录结构（上传一个测试文件）
echo -e "${YELLOW}📁 初始化 OSS 备份目录...${NC}"
echo "hotnews-backup-initialized-$(date +%Y%m%d)" | ossutil cp - "oss://$OSS_BUCKET/hotnews-db-backup/.initialized" \
    -c /root/.ossutilconfig/config --force &>/dev/null
echo -e "${GREEN}✅ 备份目录初始化完成${NC}"

# 6. 设置 crontab 定时任务（每天凌晨 2:30 执行备份）
echo -e "${YELLOW}⏰ 配置定时备份任务（每天 02:30）...${NC}"
CRON_JOB="30 2 * * * /root/hotnews/scripts/backup_to_oss.sh >> /root/hotnews/logs/oss_backup.log 2>&1"
mkdir -p /root/hotnews/logs

# 避免重复添加
(crontab -l 2>/dev/null | grep -v "backup_to_oss.sh"; echo "$CRON_JOB") | crontab -
echo -e "${GREEN}✅ 定时任务配置完成${NC}"

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  ✅ 初始化完成！${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "配置摘要："
echo "  OSS Bucket  : oss://$OSS_BUCKET/hotnews-db-backup/"
echo "  备份时间    : 每天凌晨 02:30"
echo "  保留天数    : 7 天"
echo "  备份日志    : /root/hotnews/logs/oss_backup.log"
echo ""
echo "立即测试备份："
echo "  bash /root/hotnews/scripts/backup_to_oss.sh"
echo ""
