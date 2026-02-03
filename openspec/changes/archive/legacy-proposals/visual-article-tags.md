# 文章标签可视化方案 v3

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

基于 AI_TAGGING_SYSTEM.md 的完整标签体系（62 个标签）：

#### 大类标签（12 个，必选 1 个）
```
tech(科技), finance(财经), business(商业), politics(政治), 
world(国际), entertainment(娱乐), sports(体育), health(健康), 
science(科学), lifestyle(生活), education(教育), other(其他)
```

#### 细分主题标签（50+ 个，选 0-1 个）

**科技类**：
- ai_ml(AI), llm(大模型), dev_tools(开发工具), programming(编程)
- database(数据库), cloud(云计算), cybersecurity(安全), hardware(硬件)
- mobile(移动), web3(区块链), gaming(游戏), robotics(机器人)
- iot(物联网), vr_ar(VR/AR), opensource(开源)

**财经类**：
- stock(股票), crypto(加密货币), macro(宏观经济), banking(银行)
- insurance(保险), real_estate(房产), personal_fin(理财)
- **earnings(财报/业绩)**, **ipo(IPO/上市)**, fund(基金)

**商业类**：
- startup(创业), ecommerce(电商), marketing(营销), hr(人力)
- management(管理), **merger(并购)**, **layoff(裁员)**

**生活类**：
- food(美食), travel(旅行), fashion(时尚), home(家居)
- parenting(育儿), pets(宠物), automotive(汽车)

**娱乐类**：
- movies(电影), music(音乐), tv_shows(电视剧), celebrity(明星)
- anime(动漫), books(书籍)

#### 属性标签（10 个，选 0-1 个）
```
free_deal(免费/优惠), tutorial(教程), deep_dive(深度分析), 
breaking(快讯), official(官方发布), opinion(观点), 
interview(访谈), tool_rec(工具推荐), career(职业), event(活动)
```

#### 标签选择原则
1. 财报、业绩公告类文章必须标记 `earnings`
2. IPO、上市相关必须标记 `ipo`
3. 裁员、组织调整必须标记 `layoff`
4. 并购、收购必须标记 `merger`
5. 优先选择细分主题标签，而非只选大类

## 展示样式

采用**标题后缀悬停显示**方案（Style C）：

- 默认状态：标题干净，无标签
- 鼠标悬停：标题后面显示标签
- 质量标签在前（醒目颜色），分类标签在后（淡灰色）
- 移动端：点击标题展开显示标签

## 数据存储

**所有标签都存在 `article_summaries` 表**（只有总结过的文章才有标签）：

```sql
-- quality_tag: 单个质量标签，如 'gem', 'ad' 等（可为空）
-- category_tags: JSON 数组，如 '["finance", "earnings"]'
```

**设计原则：**
- 未总结的文章不显示任何标签（标题不够准确）
- 标签只来自全文总结，质量有保证
- 前端只需查询 `article_summaries` 一张表

## AI 输出格式

```markdown
[TAGS_START]
**质量评估**: gem
**内容分类**: finance, earnings
[TAGS_END]
```

## 技术实现

### Phase 1: 后端 ✅

1. **更新 `prompts.py`** ✅
   - 完整的标签体系定义（62 个标签）
   - 详细的 AI 标签选择指令
   - 强调细分主题标签的使用

2. **更新 `article_summary.py`** ✅
   - `extract_tags_from_summary()` 解析两类标签
   - `strip_tags_from_summary()` 移除标签块

3. **更新 `db_online.py`** ✅
   - `article_summaries.quality_tag` 字段
   - `article_summaries.category_tags` 字段

4. **更新 `summary_api.py`** ✅
   - 保存标签到 `article_summaries`
   - `/api/summary/tags` 批量查询 API

### Phase 2: 前端 ✅

1. **`article-tags.js`** ✅
   - 完整的标签中文映射
   - 批量加载和显示逻辑

2. **`viewer.css`** ✅
   - 标签悬停显示样式
   - 质量标签颜色定义
   - 护眼模式适配

3. **`viewer.html`** ✅
   - `data-url` 属性已添加

## 状态

- [x] 方案设计 v3（完整标签体系）
- [x] 后端 prompt 更新（62 个标签）
- [x] 数据库字段添加
- [x] 标签解析函数更新
- [x] 标签保存到 article_summaries
- [x] 标签查询 API
- [x] 前端 CSS 样式
- [x] 前端 JS 模块
- [x] viewer.html data-url 属性
- [ ] 构建 JS（npm run build:js）
- [ ] 部署测试
- [ ] 验证标签显示
