#!/bin/bash
# =============================================================================
# sync-to-opensource.sh
# 将私有 hotnews 项目同步到开源版 uihash-hotnews
# 使用方式：
#   bash scripts/sync-to-opensource.sh            # 同步
#   bash scripts/sync-to-opensource.sh --dry-run  # 预览（不修改文件）
#   bash scripts/sync-to-opensource.sh --check    # 仅检查开源目录有无私有文件
#
# 注意：以下文件在开源版中已被修改，不会被覆盖（需手动维护）：
#   - README.md
#   - .env.example
#   - docker/Dockerfile
#   - docker/docker-compose-build.yml
#   - config/config.yaml (version_check_url 已改)
#   - hotnews/web/rss_proxy.py (Docker代理IP已清空)
#   - hotnews/report/html.py (GitHub链接已更新)
# =============================================================================

set -e

PRIVATE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OPENSOURCE_DIR="${OPENSOURCE_DIR:-/Users/sun/Downloads/project/uihash-hotnews}"
DRY_RUN=""

# -------------------------------------------------------
# 私有文件特征列表（用于自动验证）
# -------------------------------------------------------
PRIVATE_PATTERNS=(
  "payment_api\.py"
  "payment_routes\.py"
  "subscription_api\.py"
  "subscription_routes\.py"
  "subscription_service\.py"
  "source_subscription_api\.py"
  "payment-modal\.css"
  "payment-.*\.js"
  "subscription-.*\.js"
)

# -------------------------------------------------------
# --check 模式：仅扫描开源目录，不做同步
# -------------------------------------------------------
if [ "$1" = "--check" ]; then
  echo "🔍 扫描开源目录是否存在私有内容..."
  echo "📦 开源项目: $OPENSOURCE_DIR"
  echo ""
  LEAKED=0
  for pat in "${PRIVATE_PATTERNS[@]}"; do
    found=$(find "$OPENSOURCE_DIR" -not -path "*/.git/*" | grep -E "$pat" 2>/dev/null || true)
    if [ -n "$found" ]; then
      echo "❌ 发现私有文件泄露："
      echo "$found"
      LEAKED=1
    fi
  done
  if [ "$LEAKED" = "0" ]; then
    echo "✅ 未发现私有文件，开源目录干净！"
    exit 0
  else
    echo ""
    echo "⚠️  请清理上述文件后再推送到 GitHub！"
    exit 1
  fi
fi

if [ "$1" = "--dry-run" ]; then
  DRY_RUN="--dry-run"
  echo "🔍 [DRY RUN] 预览模式，不会实际更改文件"
fi

echo "📁 私有项目: $PRIVATE_DIR"
echo "📦 开源项目: $OPENSOURCE_DIR"
echo ""

# -------------------------------------------------------
# 需要同步的目录（主代码）
# -------------------------------------------------------
SYNC_DIRS=(
  "hotnews"
  "src"
)

# -------------------------------------------------------
# 排除的文件/目录（私有内容，不同步到开源）
# -------------------------------------------------------
EXCLUDES=(
  # 私有文档和规划
  "--exclude=openspec/"
  "--exclude=.agent/"
  "--exclude=docs/"

  # 测试文件
  "--exclude=tests/"

  # 微信支付相关（已从开源版删除）
  "--exclude=kernel/user/payment_api.py"
  "--exclude=kernel/user/payment_routes.py"
  "--exclude=kernel/user/subscription_routes.py"
  "--exclude=kernel/user/subscription_api.py"
  "--exclude=kernel/user/subscription_service.py"
  "--exclude=kernel/user/source_subscription_api.py"
  "--exclude=web/static/js/src/payment.js"
  "--exclude=web/static/js/src/subscription.js"
  "--exclude=web/static/js/src/source-subscription.js"
  "--exclude=web/static/js/payment-*.js"
  "--exclude=web/static/js/subscription-*.js"
  "--exclude=web/static/js/source-subscription-*.js"
  "--exclude=web/static/js/mobile/payment-*.js"
  "--exclude=web/static/js/mobile/subscription-*.js"
  "--exclude=web/static/js/mobile/source-subscription-*.js"
  "--exclude=web/static/css/features/payment-modal.css"

  # 私有部署脚本（已从开源版删除）
  "--exclude=scripts/sync_from_server.sh"
  "--exclude=scripts/sync-kernel.sh"
  "--exclude=scripts/backup_to_oss.sh"
  "--exclude=scripts/restore_from_oss.sh"
  "--exclude=scripts/setup_oss_backup.sh"
  "--exclude=scripts/acme_renew.sh"
  "--exclude=scripts/check_traffic.sh"
  "--exclude=scripts/gen-commit-msg.sh"
  "--exclude=scripts/sync-to-opensource.sh"
  "--exclude=scripts/test_ai_models.py"
  "--exclude=scripts/test_cache_headers.py"
  "--exclude=scripts/migrate_custom_sources.sh"
  "--exclude=scripts/update-changelog.sh"
  "--exclude=scripts/backup_local.sh"
  "--exclude=scripts/deploy_cdn_cert.py"
  "--exclude=scripts/diagnose_wechat_scheduler.py"
  "--exclude=scripts/verify_resource_split.py"
  "--exclude=scripts/predeploy-cache-bust.py"
  "--exclude=scripts/perf_test.py"
  "--exclude=scripts/migrate_free_quota_to_recharge_logs.py"
  "--exclude=scripts/migrate_wechat_mp_sources.py"
  "--exclude=scripts/migrate_comment_url_hash.py"
  "--exclude=scripts/migrate_add_use_scraperapi.py"
  "--exclude=scripts/optimize_columns.sql"

  # 私有二进制/证书文件
  "--exclude=docker/supercronic-linux-amd64"
  "--exclude=pub_key.pem"
  "--exclude=key/"

  # 工程/IDE/依赖文件
  "--exclude=.git/"
  "--exclude=.github/"
  "--exclude=__pycache__/"
  "--exclude=*.pyc"
  "--exclude=node_modules/"
  "--exclude=output/"
  "--exclude=.env"
  "--exclude=.DS_Store"
  "--exclude=package-lock.json"

  # 开源版中已被手动修改，保留开源版本（不覆盖）
  "--exclude=README.md"
  "--exclude=.env.example"
  "--exclude=docker/Dockerfile"
  "--exclude=docker/docker-compose-build.yml"
  "--exclude=config/config.yaml"
  "--exclude=web/rss_proxy.py"
  "--exclude=report/html.py"
)

echo "🔄 开始同步代码目录..."
for dir in "${SYNC_DIRS[@]}"; do
  echo "  → 同步 $dir/"
  rsync -av $DRY_RUN \
    "${EXCLUDES[@]}" \
    "$PRIVATE_DIR/$dir/" \
    "$OPENSOURCE_DIR/$dir/"
done

# 同步根目录部分文件（非排除的）
echo "  → 同步根目录文件..."
rsync -av $DRY_RUN \
  "${EXCLUDES[@]}" \
  --exclude="hotnews" \
  --exclude="src" \
  --exclude="scripts" \
  --exclude="docker" \
  --exclude="config" \
  --exclude="tests" \
  --exclude="docs" \
  --exclude="openspec" \
  --include="CHANGELOG.md" \
  --include="requirements.txt" \
  --include="requirements.toml" \
  --include="package.json" \
  --include="uv.lock" \
  --include="vite.config.write.js" \
  --exclude="*" \
  "$PRIVATE_DIR/" \
  "$OPENSOURCE_DIR/"

echo ""
echo "✅ 同步完成！"
echo ""

# -------------------------------------------------------
# 自动执行安全验证（同步后检测）
# -------------------------------------------------------
echo "🔍 正在验证开源目录安全性（自动检测私有文件）..."
LEAKED=0
for pat in "${PRIVATE_PATTERNS[@]}"; do
  found=$(find "$OPENSOURCE_DIR" -not -path "*/.git/*" | grep -E "$pat" 2>/dev/null || true)
  if [ -n "$found" ]; then
    echo "❌ 发现私有文件泄露："
    echo "$found"
    LEAKED=1
  fi
done
if [ "$LEAKED" = "0" ]; then
  echo "✅ 安全验证通过，未发现私有文件！"
else
  echo ""
  echo "🚨 警告：发现私有文件！请清理后再推送到 GitHub！"
  echo "   可运行 'git reset --hard && git clean -fd' 撤销开源目录的变更。"
  exit 1
fi

echo ""
echo "⚠️  以下文件在开源版中有独立修改，请根据私有版更新情况手动 review："
echo "   - hotnews/web/rss_proxy.py   (Docker代理IP默认值已清空)"
echo "   - hotnews/report/html.py     (GitHub链接已更新为开源地址)"
echo "   - docker/docker-compose-build.yml  (镜像名、私有key挂载已修改)"
echo "   - config/config.yaml         (version_check_url已改)"
echo "   - docker/Dockerfile          (supercronic改为动态下载)"
echo ""
echo "👉 接下来请在 uihash-hotnews 中执行："
echo "   cd $OPENSOURCE_DIR"
echo "   git add -A && git commit -m 'sync: update from hotnews $(date +%Y-%m-%d)'"
echo "   git push"
