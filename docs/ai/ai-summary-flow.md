# AI 总结流程文档

## 概述

用户点击文章的 AI 按钮后，系统会抓取文章内容，通过 AI 进行分类和总结，并以流式方式返回结果。

## 前端流程

```
用户点击 AI 按钮
    │
    ▼
openSummaryModal(newsId, title, url, sourceId, sourceName)
    │
    ├─ 检查登录状态 → 未登录则弹出登录框
    │
    ├─ 显示弹窗 + 加载动画
    │
    ├─ 启动定时器：
    │   ├─ slowLoadingTimer (5s): 显示"加载较慢"提示
    │   ├─ autoOpenTimer (10s): 显示"点击阅读原文"链接
    │   └─ hardTimeoutTimer (15s): 放弃并记录失败
    │
    ├─ GET /api/summary/failures/check?url=xxx
    │   │
    │   ├─ summarizable=false → 关闭弹窗，打开原文
    │   └─ summarizable=true → 继续
    │
    ▼
POST /api/summary/stream (SSE 流式)
    │
    ├─ 收到 type='status' → 更新状态文字
    ├─ 收到 type='type' → 记录文章类型
    ├─ 收到 type='chunk' → 流式渲染 Markdown
    ├─ 收到 type='done' → 显示完整内容 + footer
    └─ 收到 type='error' → 显示错误页面
```

### 相关文件

- `hotnews/web/static/js/src/summary-modal.js` - 前端弹窗逻辑

## 后端流程

```
POST /api/summary/stream
    │
    ├─ 1. 检查缓存 (summary_cache 表)
    │   └─ 有缓存 → 直接返回，跳过 AI
    │
    ├─ 2. 检查用户权限 (VIP/配额)
    │
    ├─ 3. 抓取文章内容 fetch_article_content()
    │   │
    │   ├─ 直接 HTTP 请求 (非微信)
    │   ├─ Jina Reader (免费，适合中文站)
    │   └─ ScraperAPI (付费，JS 渲染)
    │
    ├─ 4. AI 分类 classify_article()
    │   │
    │   ├─ 优先: Qianfan (如果 QIANFAN_API_KEY 有值)
    │   └─ 回退: DashScope (阿里千问)
    │   │
    │   └─ 返回: {type: "news", confidence: 0.85}
    │
    ├─ 5. AI 总结 generate_smart_summary_stream()
    │   │
    │   ├─ 根据类型选择模板 (prompts.py)
    │   ├─ 流式输出 SSE chunks
    │   └─ 返回 token 用量
    │
    ├─ 6. 保存缓存 + 更新标签
    │
    └─ 7. 记录用量 (VIP 扣费)
```

### 相关文件

| 文件 | 作用 |
|------|------|
| `kernel/user/summary_api.py` | API 路由，流式响应 |
| `kernel/services/article_summary.py` | 核心逻辑：抓取、分类、总结 |
| `kernel/services/prompts.py` | AI 提示词模板 (V5) |
| `kernel/services/summary_failure_tracker.py` | 失败追踪 |

## AI Provider 配置

| 配置项 | 说明 | 当前值 |
|--------|------|--------|
| `QIANFAN_API_KEY` | 百度千帆 (优先) | 空 (禁用) |
| `QIANFAN_MODEL` | 千帆模型 | `ernie-5.0-thinking-preview` |
| `DASHSCOPE_API_KEY` | 阿里千问 (回退) | 已配置 |
| `DASHSCOPE_MODEL` | 千问模型 | `qwen-turbo-latest` |

### Provider 选择逻辑

```python
qianfan_key = os.environ.get("QIANFAN_API_KEY", "")
use_qianfan = bool(qianfan_key)

if use_qianfan:
    # 使用百度千帆
    url = "https://qianfan.baidubce.com/v2/chat/completions"
    model = os.environ.get("QIANFAN_MODEL", "ernie-5.0-thinking-preview")
else:
    # 使用阿里千问
    url = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
    model = "qwen-turbo-latest"
```

## 文章类型分类 (V5)

支持 11 种类型，每种有专门的总结模板：

| 类型 | 图标 | 说明 |
|------|------|------|
| `news` | 📰 | 新闻报道 |
| `policy` | ⚠️ | 政策法规 |
| `business` | 📊 | 商业分析 |
| `tutorial` | ✅ | 教程指南 |
| `research` | 📚 | 研究论文 |
| `product` | 🚀 | 产品发布 |
| `opinion` | 💭 | 观点评论 |
| `interview` | 💬 | 访谈对话 |
| `listicle` | 📑 | 清单文章 |
| `tech` | 🤖 | 技术解读 (V5 新增) |
| `general` | 📝 | 通用 (默认) |

## 失败处理机制

### 数据表

| 表 | 作用 |
|----|------|
| `summary_failures` | URL 级别失败记录 |
| `summary_blocked_domains` | 域名级别 block |

### 失败阈值

- URL 失败 ≥3 次 → 标记为不可总结
- 域名失败率 100% → 整个域名 block

### 失败原因

| reason | 说明 |
|--------|------|
| `fetch_error` | 网页抓取失败 |
| `fetch_blocked` | 反爬/验证码 |
| `ai_error` | AI 服务错误 |
| `client_timeout` | 客户端 15s 超时 |
| `content_too_short` | 内容太短 |

### 管理命令

```sql
-- 查看被 block 的域名
SELECT domain, blocked_reason FROM summary_blocked_domains WHERE blocked_at IS NOT NULL;

-- 解除域名 block
UPDATE summary_blocked_domains SET blocked_at = NULL, blocked_reason = NULL WHERE domain = 'xxx';

-- 查看失败次数最多的 URL
SELECT url, attempt_count, reason FROM summary_failures ORDER BY attempt_count DESC LIMIT 10;
```

## 超时机制

| 阶段 | 时间 | 行为 |
|------|------|------|
| 慢加载提示 | 5s | 显示"加载较慢"文字 |
| 原文链接 | 10s | 显示"点击阅读原文"链接 |
| 硬超时 | 15s | 关闭弹窗，打开原文，记录失败 |

## 缓存机制

- 表：`summary_cache`
- Key：URL 的 MD5 hash
- 有效期：无限（手动清理）
- 命中缓存时不消耗 token

## 更新日志

- 2026-01-26: 添加百度千帆支持，修复 model 参数覆盖问题
- 2026-01-25: V5 模板，新增 tech 类型
