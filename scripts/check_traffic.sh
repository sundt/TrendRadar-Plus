#!/bin/bash
# 检查服务器流量统计
# 用于估算 DCDN 费用

echo "🔍 Hotnews 流量统计"
echo "===================="
echo ""

# 检查是否在服务器上
if [ ! -f "/proc/1/cgroup" ] || ! grep -q docker /proc/1/cgroup 2>/dev/null; then
    echo "⚠️  请在服务器上运行此脚本"
    echo "使用方法："
    echo "  ssh root@120.77.222.205 -p 52222"
    echo "  cd ~/hotnews"
    echo "  bash scripts/check_traffic.sh"
    exit 1
fi

# 获取今天的日期
TODAY=$(date +%d/%b/%Y)
YESTERDAY=$(date -d "yesterday" +%d/%b/%Y)

echo "📅 统计日期："
echo "  今天：$TODAY"
echo "  昨天：$YESTERDAY"
echo ""

# 检查日志文件
LOG_FILE="/var/log/nginx/access.log"
if [ ! -f "$LOG_FILE" ]; then
    echo "❌ 日志文件不存在：$LOG_FILE"
    echo "尝试从 Docker 容器获取..."
    LOG_FILE="docker exec hotnews cat /var/log/nginx/access.log"
fi

echo "📊 今天的流量统计"
echo "===================="

# 统计今天的总请求数
TOTAL_REQUESTS=$(docker exec hotnews grep "$TODAY" /var/log/nginx/access.log 2>/dev/null | wc -l)
echo "总请求数：$TOTAL_REQUESTS"

# 统计今天的 PV（HTML 页面请求）
PV=$(docker exec hotnews grep "$TODAY" /var/log/nginx/access.log 2>/dev/null | \
     grep -E 'GET / |GET /index' | wc -l)
echo "页面浏览量（PV）：$PV"

# 统计今天的 API 请求
API_REQUESTS=$(docker exec hotnews grep "$TODAY" /var/log/nginx/access.log 2>/dev/null | \
               grep 'GET /api/' | wc -l)
echo "API 请求数：$API_REQUESTS"

# 统计静态资源请求
STATIC_REQUESTS=$(docker exec hotnews grep "$TODAY" /var/log/nginx/access.log 2>/dev/null | \
                  grep -E 'GET /static/|GET /static_kernel/' | wc -l)
echo "静态资源请求：$STATIC_REQUESTS"

# 统计独立 IP 数（粗略估算 UV）
UV=$(docker exec hotnews grep "$TODAY" /var/log/nginx/access.log 2>/dev/null | \
     awk '{print $1}' | sort -u | wc -l)
echo "独立 IP 数（UV）：$UV"

echo ""
echo "📈 流量分析"
echo "===================="

# 计算比例
if [ $TOTAL_REQUESTS -gt 0 ]; then
    API_PERCENT=$(echo "scale=1; $API_REQUESTS * 100 / $TOTAL_REQUESTS" | bc)
    STATIC_PERCENT=$(echo "scale=1; $STATIC_REQUESTS * 100 / $TOTAL_REQUESTS" | bc)
    echo "API 请求占比：$API_PERCENT%"
    echo "静态资源占比：$STATIC_PERCENT%"
fi

# 计算平均每个用户的页面数
if [ $UV -gt 0 ]; then
    AVG_PV=$(echo "scale=1; $PV / $UV" | bc)
    echo "平均每用户页面数：$AVG_PV"
fi

# 计算平均每个页面的请求数
if [ $PV -gt 0 ]; then
    AVG_REQUESTS=$(echo "scale=1; $TOTAL_REQUESTS / $PV" | bc)
    echo "平均每页面请求数：$AVG_REQUESTS"
fi

echo ""
echo "💰 费用估算（DCDN）"
echo "===================="

# 优化前的费用（所有 API 请求都回源）
if [ $API_REQUESTS -gt 0 ]; then
    COST_BEFORE=$(echo "scale=2; $API_REQUESTS / 1000 * 0.01" | bc)
    MONTHLY_BEFORE=$(echo "scale=2; $COST_BEFORE * 30" | bc)
    echo "优化前："
    echo "  今日动态请求：$API_REQUESTS 次"
    echo "  今日费用：$COST_BEFORE 元"
    echo "  月度费用（估算）：$MONTHLY_BEFORE 元"
    
    echo ""
    echo "优化后（假设缓存命中率 75%）："
    DYNAMIC_AFTER=$(echo "scale=0; $API_REQUESTS * 0.25" | bc)
    COST_AFTER=$(echo "scale=2; $DYNAMIC_AFTER / 1000 * 0.01" | bc)
    MONTHLY_AFTER=$(echo "scale=2; $COST_AFTER * 30" | bc)
    SAVED=$(echo "scale=2; $MONTHLY_BEFORE - $MONTHLY_AFTER" | bc)
    echo "  今日动态请求：$DYNAMIC_AFTER 次"
    echo "  今日费用：$COST_AFTER 元"
    echo "  月度费用（估算）：$MONTHLY_AFTER 元"
    echo "  月度节省：$SAVED 元（75%）"
fi

echo ""
echo "🔝 热门 API 接口"
echo "===================="
docker exec hotnews grep "$TODAY" /var/log/nginx/access.log 2>/dev/null | \
    grep 'GET /api/' | \
    awk '{print $7}' | \
    cut -d'?' -f1 | \
    sort | uniq -c | sort -rn | head -10 | \
    awk '{printf "  %6d 次  %s\n", $1, $2}'

echo ""
echo "📊 昨天的对比数据"
echo "===================="

YESTERDAY_TOTAL=$(docker exec hotnews grep "$YESTERDAY" /var/log/nginx/access.log 2>/dev/null | wc -l)
YESTERDAY_API=$(docker exec hotnews grep "$YESTERDAY" /var/log/nginx/access.log 2>/dev/null | \
                grep 'GET /api/' | wc -l)
YESTERDAY_UV=$(docker exec hotnews grep "$YESTERDAY" /var/log/nginx/access.log 2>/dev/null | \
               awk '{print $1}' | sort -u | wc -l)

echo "昨天总请求数：$YESTERDAY_TOTAL"
echo "昨天 API 请求：$YESTERDAY_API"
echo "昨天独立 IP：$YESTERDAY_UV"

if [ $YESTERDAY_TOTAL -gt 0 ] && [ $TOTAL_REQUESTS -gt 0 ]; then
    GROWTH=$(echo "scale=1; ($TOTAL_REQUESTS - $YESTERDAY_TOTAL) * 100 / $YESTERDAY_TOTAL" | bc)
    echo "增长率：$GROWTH%"
fi

echo ""
echo "✅ 统计完成！"
echo ""
echo "💡 建议："
echo "  1. 如果 API 请求数较多，建议立即部署缓存优化"
echo "  2. 运行 'make -f Makefile.optimization deploy-optimization' 部署"
echo "  3. 部署后运行 'curl http://localhost:8090/api/cache/stats' 查看效果"
