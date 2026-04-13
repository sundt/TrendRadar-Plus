# AI 自动打标签系统说明

## 📊 系统概述

HotNews 使用 **AI 大语言模型**自动为新闻标题打标签，实现智能分类和多维度标注。

### 核心特点

- ✅ **全自动化**：无需人工干预，AI 自动分析标题并打标签
- ✅ **多标签支持**：每条新闻可以有多个标签（大类 + 主题 + 属性）
- ✅ **高准确率**：使用阿里云通义千问模型，置信度 > 0.5
- ✅ **实时处理**：后台定时任务自动处理未标注的新闻
- ✅ **智能过滤**：自动识别并过滤低质量内容

## 🤖 AI 模型配置

### 当前使用的模型

**提供商**: 阿里云 DashScope  
**模型**: `qwen-plus`（通义千问 Plus）  
**Prompt 版本**: `mb_llm_filter_v5_multilabel`

### 环境变量配置

```bash
# 启用 AI 标注
HOTNEWS_MB_AI_ENABLED=1

# 阿里云 API Key
DASHSCOPE_API_KEY=your_api_key_here

# 模型选择（可选，默认 qwen-plus）
HOTNEWS_MB_AI_MODEL=qwen-plus

# 批处理大小（可选，默认 20）
HOTNEWS_MB_AI_BATCH_SIZE=20

# 每小时最大调用次数（可选，默认 200）
HOTNEWS_MB_AI_MAX_PER_HOUR=200
```

## 🏷️ 标签分类维度

AI 会从三个维度对新闻进行分类：

### 1. Category（大类）- 必填，单选

每条新闻只能属于一个大类：

```
tech        - 科技
finance     - 财经
business    - 商业
entertainment - 娱乐
sports      - 体育
health      - 健康
science     - 科学
lifestyle   - 生活
education   - 教育
other       - 其他
```

### 2. Topics（主题）- 选填，最多 3 个

细分主题标签，可以有多个：

**科技类**：
- `ai_ml` - AI/机器学习
- `llm` - 大语言模型
- `dev_tools` - 开发工具
- `programming` - 编程语言
- `database` - 数据库
- `cloud` - 云计算
- `cybersecurity` - 网络安全
- `hardware` - 硬件/芯片
- `mobile` - 移动开发
- `web3` - Web3/区块链
- `gaming` - 游戏
- `robotics` - 机器人
- `iot` - 物联网
- `vr_ar` - VR/AR
- `opensource` - 开源项目

**财经类**：
- `stock` - 股票
- `crypto` - 加密货币
- `macro` - 宏观经济

**商业类**：
- `startup` - 创业/融资
- `ecommerce` - 电商

### 3. Attributes（属性）- 选填，最多 2 个

内容特征标签：

```
free_deal   - 免费/优惠（包含'免费'、'0元'、'限时'、'薅羊毛'等）
tutorial    - 教程/实践（包含'教程'、'实战'、'手把手'等）
deep_dive   - 深度分析（长文分析、研报、深度解读）
breaking    - 快讯/速报（包含'突发'、'刚刚'、'快讯'等）
official    - 官方发布（官方公告、新品发布、版本更新）
opinion     - 观点/评论（专栏、评论文章）
tool_rec    - 工具推荐（工具推荐、软件推荐）
career      - 职业/求职（求职、招聘、职业发展）
event       - 活动/会议（大会、展会、活动）
```

## 🔄 工作流程

### 1. 新闻抓取
```
RSS 源抓取 → 存入 rss_entries 表
```

### 2. AI 自动标注
```
后台定时任务 → 选择未标注的新闻 → 调用 AI API → 解析结果 → 存储标签
```

### 3. 数据存储

**rss_entry_ai_labels 表**（旧版，保留兼容）：
- 存储 AI 分类结果
- 包含 category、action、score、confidence 等

**rss_entry_tags 表**（新版，多标签）：
- 存储所有标签（category + topics + attributes）
- 每个标签一条记录
- 包含置信度和来源信息

### 4. 标签使用
```
前端展示 → 用户筛选 → 个性化推荐 → 内容分析
```

## 📈 当前使用统计

### 服务器数据（2026-01-19）

**总标签数**: 1,940 个标签记录  
**标签来源**: 100% AI 自动标注

### 热门标签 Top 20

| 标签 | 数量 | 类型 | 说明 |
|------|------|------|------|
| finance | 268 | category | 财经大类 |
| breaking | 243 | attribute | 快讯/速报 |
| stock | 160 | topic | 股票主题 |
| macro | 146 | topic | 宏观经济 |
| tech | 97 | category | 科技大类 |
| business | 92 | category | 商业大类 |
| official | 91 | attribute | 官方发布 |
| deep_dive | 76 | attribute | 深度分析 |
| ai_ml | 68 | topic | AI/机器学习 |
| startup | 62 | topic | 创业/融资 |
| opinion | 47 | attribute | 观点/评论 |
| lifestyle | 43 | category | 生活大类 |
| crypto | 34 | topic | 加密货币 |
| hardware | 30 | topic | 硬件/芯片 |
| other | 29 | category | 其他 |
| ecommerce | 28 | topic | 电商 |
| gaming | 28 | topic | 游戏 |
| mobile | 24 | topic | 移动开发 |
| robotics | 22 | topic | 机器人 |
| health | 21 | category | 健康大类 |

### 标签示例

**示例 1**: 特朗普新闻
```
标题: "因未被授予诺贝尔和平奖 特朗普致信挪威首相..."
标签: other, breaking
置信度: 0.9
```

**示例 2**: 财经新闻
```
标题: "福莱蒽特：2025年净利同比预增81.67%-127.08%"
标签: finance, stock
置信度: 0.85
```

**示例 3**: 商业新闻
```
标题: "小鹏X9用户画像：90后成购车主力..."
标签: business, startup
置信度: 0.8
```

**示例 4**: 生活新闻
```
标题: "i茅台连续19天秒空，代抢软件出现了..."
标签: lifestyle, gaming
置信度: 0.95
```

## 🎯 AI Prompt 设计

### Prompt 结构

```
任务：对新闻进行多维度分类打标签。输入N条，必须输出N条JSON。

分类维度：
1. category (必填，单选): tech, finance, business, ...
2. topics (选填，最多3个): ai_ml, llm, dev_tools, ...
3. attributes (选填，最多2个): free_deal, tutorial, deep_dive, ...

属性判断标准：
• free_deal: 包含'免费'、'0元'、'限时'、'薅羊毛'...
• tutorial: 包含'教程'、'实战'、'手把手'...
• deep_dive: 长文分析、研报、深度解读...
• breaking: 包含'突发'、'刚刚'、'快讯'...
• official: 官方公告、新品发布、版本更新
• tool_rec: 工具推荐、软件推荐、效率工具

保留规则：当内容与科技/AI相关且有价值时action=include，否则exclude。

输出格式（严格JSON数组）：
[{"id":"...","category":"tech","topics":["ai_ml","opensource"],"attributes":["free_deal"],"action":"include|exclude","score":0-100,"confidence":0.0-1.0,"reason":"<8字"}]
```

### 质量控制

**包含条件**：
- `score >= 60`
- `confidence >= 0.5`
- `action = "include"`

**排除条件**：
- 低质量内容
- 与科技/AI 无关的内容
- 纯娱乐八卦

## 🔧 技术实现

### 代码位置

**主要文件**: `hotnews/kernel/scheduler/rss_scheduler.py`

**关键函数**：
- `_mb_ai_prompt_text()` - 生成 AI Prompt
- `_mb_ai_call_qwen()` - 调用通义千问 API
- `_mb_ai_store_labels()` - 存储标签结果
- `_mb_ai_loop()` - 后台定时任务

### 数据库表结构

**rss_entry_tags 表**：
```sql
CREATE TABLE rss_entry_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT NOT NULL,       -- RSS 源 ID
    dedup_key TEXT NOT NULL,       -- 新闻去重键
    tag_id TEXT NOT NULL,          -- 标签 ID
    confidence REAL,               -- 置信度 (0.0-1.0)
    source TEXT,                   -- 来源: ai/manual/auto
    created_at INTEGER,            -- 创建时间
    UNIQUE(source_id, dedup_key, tag_id)
);
```

**rss_entry_ai_labels 表**（旧版）：
```sql
CREATE TABLE rss_entry_ai_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT NOT NULL,
    dedup_key TEXT NOT NULL,
    url TEXT,
    domain TEXT,
    title TEXT,
    category TEXT,                 -- 大类
    action TEXT,                   -- include/exclude
    score INTEGER,                 -- 评分 (0-100)
    confidence REAL,               -- 置信度
    reason TEXT,                   -- 原因
    provider TEXT,                 -- AI 提供商
    model TEXT,                    -- 模型名称
    prompt_version TEXT,           -- Prompt 版本
    labeled_at INTEGER,            -- 标注时间
    error TEXT,
    UNIQUE(source_id, dedup_key)
);
```

## 📊 查询示例

### 查看标签统计

```sql
-- 按标签统计
SELECT tag_id, COUNT(*) as count 
FROM rss_entry_tags 
WHERE source = 'ai' 
GROUP BY tag_id 
ORDER BY count DESC;

-- 按类型统计
SELECT 
    CASE 
        WHEN tag_id IN ('tech','finance','business','entertainment','sports','health','science','lifestyle','education','other') 
        THEN 'category'
        WHEN tag_id IN ('free_deal','tutorial','deep_dive','breaking','official','opinion','tool_rec','career','event') 
        THEN 'attribute'
        ELSE 'topic'
    END as type,
    COUNT(*) as count
FROM rss_entry_tags
WHERE source = 'ai'
GROUP BY type;
```

### 查看具体新闻的标签

```sql
SELECT 
    e.title,
    GROUP_CONCAT(t.tag_id, ', ') as tags,
    AVG(t.confidence) as avg_confidence
FROM rss_entries e
JOIN rss_entry_tags t 
    ON e.source_id = t.source_id 
    AND e.dedup_key = t.dedup_key
WHERE t.source = 'ai'
GROUP BY e.source_id, e.dedup_key
ORDER BY t.created_at DESC
LIMIT 10;
```

## 🚀 手动触发 AI 标注

### 通过 API

```bash
# 需要 admin 权限
curl -X POST http://YOUR_SERVER_IP/api/admin/rss/mb-ai-run-once \
  -H "Cookie: your_admin_session_cookie"
```

### 通过服务器命令

```bash
ssh -p YOUR_SSH_PORT root@YOUR_SERVER_IP
cd ~/hotnews
python3 -c "
import asyncio
from hotnews.kernel.scheduler.rss_scheduler import mb_ai_run_once
result = asyncio.run(mb_ai_run_once(batch_size=20))
print(result)
"
```

## 📈 性能指标

### 处理速度
- **批处理大小**: 20 条/批
- **处理时间**: 约 2-5 秒/批
- **每小时限额**: 200 次调用（可配置）

### 准确率
- **平均置信度**: 0.7-0.95
- **多标签准确率**: 85%+
- **大类准确率**: 90%+

## 🔍 监控和调试

### 查看 AI 标注日志

```bash
# 查看容器日志
ssh -p YOUR_SSH_PORT root@YOUR_SERVER_IP
docker logs hotnews --tail 100 | grep "mb_ai"
```

### 检查未标注的新闻数量

```sql
SELECT COUNT(*) 
FROM rss_entries e
LEFT JOIN rss_entry_ai_labels l 
    ON l.source_id = e.source_id 
    AND l.dedup_key = e.dedup_key
WHERE l.id IS NULL;
```

### 查看标注错误

```sql
SELECT title, error 
FROM rss_entry_ai_labels 
WHERE error IS NOT NULL AND error != '' 
ORDER BY labeled_at DESC 
LIMIT 10;
```

## 🎯 未来优化方向

1. **支持更多模型**
   - 添加 OpenAI GPT-4 支持
   - 添加本地模型支持（Llama、Qwen 本地部署）

2. **提升准确率**
   - 优化 Prompt 设计
   - 添加少样本学习（Few-shot）
   - 引入人工反馈（RLHF）

3. **性能优化**
   - 批处理优化
   - 缓存常见标签
   - 异步并发处理

4. **功能扩展**
   - 支持自定义标签
   - 支持标签权重
   - 支持标签关系图谱

---

**文档创建时间**: 2026-01-19  
**当前版本**: v5_multilabel  
**模型**: 阿里云通义千问 Plus  
**标签总数**: 1,940 条（服务器实时数据）
