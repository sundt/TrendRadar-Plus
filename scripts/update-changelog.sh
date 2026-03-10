#!/bin/bash
# ============================================================
# 自动更新 CHANGELOG.md
#
# 用法: bash scripts/update-changelog.sh "feat: 新增导出进度条"
#   - 将 commit message 追加到 CHANGELOG.md 顶部
#   - 按日期分组，相同日期的条目归在同一天下面
#   - 自动分类展示（✨ 新功能 / 🐛 修复 / ⚡ 优化 等）
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CHANGELOG="$PROJECT_ROOT/CHANGELOG.md"

commit_msg="$1"
if [ -z "$commit_msg" ]; then
    echo "用法: $0 <commit-message>" >&2
    exit 1
fi

# 解析 commit type 和描述
commit_type=$(echo "$commit_msg" | sed -E 's/^([a-z]+)(\(.+\))?: .+/\1/')
commit_desc=$(echo "$commit_msg" | sed -E 's/^[a-z]+(\(.+\))?: //')
commit_scope=$(echo "$commit_msg" | sed -E 's/^[a-z]+\(([^)]+)\): .+/\1/')
if [ "$commit_scope" = "$commit_msg" ]; then
    commit_scope=""
fi

# 映射 type 到 emoji 分类
case "$commit_type" in
    feat)     emoji="✨"; category="新功能" ;;
    fix)      emoji="🐛"; category="修复" ;;
    refactor) emoji="♻️";  category="重构" ;;
    perf)     emoji="⚡"; category="性能优化" ;;
    style)    emoji="💎"; category="样式/UI" ;;
    docs)     emoji="📝"; category="文档" ;;
    test)     emoji="✅"; category="测试" ;;
    chore)    emoji="🔧"; category="杂项" ;;
    *)        emoji="📦"; category="其他" ;;
esac

today=$(date +'%Y-%m-%d')
short_hash=$(git rev-parse --short HEAD 2>/dev/null || echo "")
entry="- ${emoji} ${commit_desc}"
if [ -n "$short_hash" ]; then
    entry="- ${emoji} ${commit_desc} (\`${short_hash}\`)"
fi

# 创建或更新 CHANGELOG
if [ ! -f "$CHANGELOG" ]; then
    # 首次创建
    cat > "$CHANGELOG" <<EOF
# 📋 更新日志

所有重要的项目更新都会记录在这里。

---

## $today

### ${emoji} ${category}
${entry}
EOF
    echo "✅ CHANGELOG.md created" >&2
    exit 0
fi

# 检查今天的日期头是否已经存在
if grep -q "^## $today" "$CHANGELOG"; then
    # 今天的条目已存在，检查是否有对应的分类
    if grep -q "^### ${emoji} ${category}" "$CHANGELOG"; then
        # 分类存在，在该分类下追加条目
        # 使用 python3 精确插入（避免 sed 兼容性问题）
        python3 -c "
import sys
lines = open('$CHANGELOG', 'r').readlines()
out = []
inserted = False
for i, line in enumerate(lines):
    out.append(line)
    if not inserted and line.strip() == '### ${emoji} ${category}':
        out.append('${entry}\n')
        inserted = True
open('$CHANGELOG', 'w').writelines(out)
" 2>/dev/null
    else
        # 分类不存在，在今天的日期头后面新增分类
        python3 -c "
import sys
lines = open('$CHANGELOG', 'r').readlines()
out = []
inserted = False
for i, line in enumerate(lines):
    out.append(line)
    if not inserted and line.strip() == '## $today':
        # 找到下一个空行或下一个 ## 之前插入
        out.append('\n')
        out.append('### ${emoji} ${category}\n')
        out.append('${entry}\n')
        inserted = True
open('$CHANGELOG', 'w').writelines(out)
" 2>/dev/null
    fi
else
    # 今天的条目不存在，在 --- 后插入新的日期块
    python3 -c "
import sys
lines = open('$CHANGELOG', 'r').readlines()
out = []
inserted = False
for i, line in enumerate(lines):
    out.append(line)
    if not inserted and line.strip() == '---':
        out.append('\n')
        out.append('## $today\n')
        out.append('\n')
        out.append('### ${emoji} ${category}\n')
        out.append('${entry}\n')
        inserted = True
if not inserted:
    # 没找到 ---，在文件头部（跳过标题）后插入
    out.insert(2, '\n## $today\n\n### ${emoji} ${category}\n${entry}\n\n')
    open('$CHANGELOG', 'w').writelines(out)
else:
    open('$CHANGELOG', 'w').writelines(out)
" 2>/dev/null
fi

echo "✅ CHANGELOG.md updated: ${entry}" >&2
