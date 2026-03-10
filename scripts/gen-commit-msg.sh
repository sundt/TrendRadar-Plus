#!/bin/bash
# ============================================================
# AI 自动生成 Conventional Commit Message
#
# 用法: bash scripts/gen-commit-msg.sh
#   - 读取 git diff --cached（已暂存的改动）
#   - 调用 DashScope Qwen API 分析 diff
#   - 输出一行 conventional commit message
#
# 如果 AI 调用失败，自动 fallback 到时间戳格式
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# --------------- 加载 API Key ---------------
load_api_key() {
    if [ -n "$DASHSCOPE_API_KEY" ]; then
        return 0
    fi
    for env_file in "$PROJECT_ROOT/.env" "$PROJECT_ROOT/docker/.env"; do
        if [ -f "$env_file" ]; then
            local key
            key=$(grep '^DASHSCOPE_API_KEY=' "$env_file" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
            if [ -n "$key" ]; then
                export DASHSCOPE_API_KEY="$key"
                return 0
            fi
        fi
    done
    return 1
}

# --------------- 获取 diff ---------------
get_diff() {
    local diff
    diff=$(git diff --cached --stat 2>/dev/null)
    if [ -z "$diff" ]; then
        diff=$(git diff --stat 2>/dev/null)
    fi

    local diff_detail
    diff_detail=$(git diff --cached 2>/dev/null)
    if [ -z "$diff_detail" ]; then
        diff_detail=$(git diff 2>/dev/null)
    fi

    echo "$diff"
    echo "---"
    echo "$diff_detail"
}

# --------------- 用 Python 调用 AI（避免 shell JSON 转义问题）---------------
call_ai_python() {
    local diff_content="$1"

    echo "$diff_content" | python3 -c "
import sys, json, urllib.request, urllib.error, os

diff_text = sys.stdin.read()

# 截断到 4000 字符
if len(diff_text) > 4000:
    diff_text = diff_text[:4000] + '\n... (diff truncated)'

api_key = os.environ.get('DASHSCOPE_API_KEY', '')
if not api_key:
    sys.exit(1)

prompt = '''你是一个 Git Commit Message 生成器。请根据以下 git diff 生成一条规范的 Conventional Commit message。

规则：
1. 格式：<type>: <简短中文描述>（不超过50字）
2. type 只能是：feat（新功能）、fix（修复）、refactor（重构）、perf（性能优化）、style（样式/UI）、docs（文档）、chore（杂项/配置）、test（测试）
3. 如果涉及多个改动，选择最主要的那个 type
4. 描述要简洁有力，概括核心改动
5. 只输出一行 commit message，不要任何额外说明、引号或代码标记

以下是 diff 内容：
''' + diff_text

body = json.dumps({
    'model': 'qwen-plus',
    'messages': [{'role': 'user', 'content': prompt}],
    'temperature': 0.3,
    'max_tokens': 100
}).encode('utf-8')

req = urllib.request.Request(
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    data=body,
    headers={
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json'
    }
)

try:
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.load(resp)
    content = data['choices'][0]['message']['content'].strip()
    # 清理可能的 markdown 标记
    for ch in ['\`', '\"', \"'\"]:
        content = content.strip(ch)
    # 只取第一行
    msg = content.split('\n')[0].strip()
    # 验证格式
    import re
    if re.match(r'^(feat|fix|refactor|perf|style|docs|chore|test)(\(.+\))?: .+', msg):
        print(msg)
    else:
        print(f'chore: {msg}')
except Exception:
    sys.exit(1)
" 2>/dev/null
}

# --------------- 主逻辑 ---------------
main() {
    if ! load_api_key; then
        echo "deploy: $(date +'%Y-%m-%d %H:%M:%S')"
        exit 0
    fi

    local diff_content
    diff_content=$(get_diff)

    # 检查是否有实质性 diff
    if [ -z "$diff_content" ] || [ "$diff_content" = "---" ]; then
        echo "deploy: $(date +'%Y-%m-%d %H:%M:%S')"
        exit 0
    fi

    local ai_msg
    ai_msg=$(call_ai_python "$diff_content") || true

    if [ -n "$ai_msg" ]; then
        echo "$ai_msg"
    else
        echo "deploy: $(date +'%Y-%m-%d %H:%M:%S')"
    fi
}

main "$@"
