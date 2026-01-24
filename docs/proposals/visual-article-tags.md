# 文章标签可视化方案 v2

## 概述

在新闻列表中展示 AI 总结生成的标签，帮助用户快速识别文章质量和类型。

## 标签体系

### 1. 质量评估标签（0-1 个，互斥）

#### 负面标签（警示类）

| 标签 | 中文 | 颜色 | AI 判断依据 |
|------|------|------|------------|
| `ad` | 广告 | 🔴 #ef4444 | 纯广告、促销、购买链接、优惠码 |
| `sponsored` | 软文 | 🔴 #dc2626 | 品牌植入、恰饭、利益相关但不明说 |
| `clickbait` | 标题党 | 🟠 #f97316 | 标题夸张、内容空洞、货不对板 |
| `pr` | 公关稿 | 🟠 #ea580c | 企业通稿、官方口吻、无独立观点 |
| `outdated` | 过时 | ⚪ #9ca3af | 旧闻翻炒、信息过期、炒冷饭 |
| `low_quality` | 水文 | ⚪ #6b7280 | 内容浅薄、拼凑搬运、AI 生成痕迹重 |

#### 正面标签（推荐类）

| 标签 | 中文 | 颜色 | AI 判断依据 |
|------|------|------|------------|
| `gem` | 精华 | 🟢 #22c55e | 深度分析、原创见解、数据详实、值得收藏 |
| `breaking` | 突发 | 🔵 #3b82f6 | 重大新闻、突发事件、第一手报道 |
| `exclusive` | 独家 | 🟣 #a855f7 | 独家报道、内幕消息、稀缺信息源 |
| `practical` | 实用 | 🔵 #06b6d4 | 可操作、有干货、教程类、工具推荐 |

#### 规则
- 每篇文章最多 1 个质量标签（互斥）
- 大部分文章（70%+）不打质量标签
- 负面优先：同时符合负面和正面时，优先标负面
- AI 不确定时不打标签

### 2. 内容分类标签（1-2 个）

现有的 50+ 个分类标签，用于"我的关注"筛选：

```
tech, ai_ml, free_deal, finance, llm, tutorial, business, dev_tools, 
deep_dive, politics, programming, breaking, world, database, official, 
entertainment, cloud, opinion, sports, cybersecurity, interview, health, 
hardware, tool_rec, science, mobile, career, lifestyle, web3, event, 
education, gaming, robotics, iot, vr_ar, opensource, stock, crypto, 
macro, banking, insurance, real_estate, personal_fin, startup, ecommerce, 
marketing, hr, management, food, travel, books
```

## 展示样式

采用**标题后缀悬停显示**方案（Style C）：

- 默认状态：标题干净，无标签
- 鼠标悬停：标题后面显示标签
- 质量标签在前（醒目颜色），分类标签在后（淡灰色）
- 移动端：点击标题展开显示标签

## 数据存储

**所有标签都存在 `article_summaries` 表**（只有总结过的文章才有标签）：

```sql
ALTER TABLE article_summaries ADD COLUMN quality_tag TEXT DEFAULT '';
-- 存储单个质量标签：'ad', 'gem', 'clickbait' 等（可为空）

-- category_tags 已有字段，存储 JSON 数组
-- 例如：'["ai_ml", "tutorial"]'
```

**设计原则：**
- 未总结的文章不显示任何标签（标题不够准确）
- 标签只来自全文总结，质量有保证
- 前端只需查询 `article_summaries` 一张表

## AI 输出格式

```markdown
---

## 🏷️ 文章标签

**质量评估**（从以下选择 0-1 个，大部分文章无需标记）：
- 负面：ad(广告), sponsored(软文), clickbait(标题党), pr(公关稿), outdated(过时), low_quality(水文)
- 正面：gem(精华), breaking(突发), exclusive(独家), practical(实用)

**内容分类**（从预定义列表选择 1-2 个）：
tech, ai_ml, tutorial, finance, ...

**质量评估**: 
**内容分类**: 
```

## 技术实现

### Phase 1: 后端

1. **更新 `prompts.py`**
   - 新增完整的 `QUALITY_TAGS` 定义（10 个标签）
   - 修改 `TAGS_OUTPUT_INSTRUCTION` 输出格式
   - 确保 `LEARNING_FOOTER_WITH_TAGS` 包含标签指令

2. **更新 `article_summary.py`**
   - 修改 `extract_tags_from_summary()` 解析两类标签
   - 返回 `{'quality': str|None, 'category': list}`

3. **更新 `db_online.py`**
   - 添加 `article_summaries.quality_tag` 字段

4. **更新 `summary_api.py`**
   - 保存质量标签到 `article_summaries`
   - 分类标签继续写入 `rss_entry_tags`

### Phase 2: 前端

1. **新增 API** `/api/article-tags`
   - 批量查询文章标签（质量+分类）
   - 返回格式：`{url: {quality: 'gem', category: ['ai_ml', 'tutorial']}}`

2. **更新 `viewer.css`**
   - 添加标签悬停显示样式
   - 质量标签颜色定义

3. **更新 `viewer.html` / JS**
   - 在新闻条目中添加标签 DOM
   - 悬停/点击交互逻辑

## 预览

预览页面：`/static/tag-preview.html`

## 状态

- [x] 方案设计 v2
- [x] 预览页面
- [x] 后端 prompt 更新（10 个质量标签）
- [x] 数据库字段添加（quality_tag, category_tags）
- [x] 标签解析函数更新
- [x] 标签保存到 article_summaries
- [x] 标签查询 API（/api/summary/tags）
- [x] 前端 CSS 样式
- [x] 前端 JS 模块（article-tags.js）
- [x] viewer.html 添加 data-url 属性
- [ ] 构建 JS（npm run build:js）
- [ ] 部署测试
