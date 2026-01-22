# 新闻卡片日期显示逻辑说明

## 概述
本文档说明 Hotnews 系统中所有栏目下的卡片显示的日期字段来源和显示逻辑。

---

## 日期字段来源

### 1. RSS 订阅源新闻

**数据库表**: `rss_entries`

**字段优先级**:
```sql
ORDER BY (CASE WHEN published_at > 0 THEN published_at ELSE created_at END) DESC
```

**字段说明**:
- `published_at`: RSS 源提供的发布时间（Unix 时间戳，秒）
- `created_at`: 系统抓取并创建记录的时间（Unix 时间戳，秒）

**选择逻辑**:
```python
published_at = int(r[2] or 0)
created_at = int(r[4] or 0)
ts = published_at if published_at > 0 else created_at
```

**代码位置**: `hotnews/web/server.py` 第 325-327 行

---

### 2. 普通新闻源（非 RSS）

**数据来源**: 爬虫抓取的数据

**字段说明**:
- `crawl_time`: 抓取时间（格式: "HH:MM"）
- `crawl_date`: 抓取日期（格式: "YYYY-MM-DD"）

**生成逻辑**:
```python
now = datetime.now()
crawl_time = now.strftime("%H:%M")
crawl_date = now.strftime("%Y-%m-%d")
```

**特点**:
- 普通新闻源的日期是**抓取时间**，不是新闻发布时间
- 因为大部分热榜平台不提供准确的发布时间
- 使用抓取时间可以保证数据的一致性和可靠性

**代码位置**: `hotnews/web/server.py` 第 910-912 行

---

## 前端显示逻辑

### 1. 日期格式化函数

**函数**: `formatNewsDate(ts)`

**位置**: `hotnews/web/static/js/src/core.js` 第 61-87 行

**处理逻辑**:
```javascript
export function formatNewsDate(ts) {
    if (ts == null || ts === '') return '';
    
    try {
        // 1. 尝试解析 Unix 时间戳（秒或毫秒）
        const num = Number(ts);
        if (Number.isFinite(num) && num > 0) {
            // 如果 > 1e12，认为是毫秒，否则是秒
            const ms = num > 1e12 ? num : num * 1000;
            const d = new Date(ms);
            if (!isNaN(d.getTime())) {
                const YYYY = String(d.getFullYear());
                const MM = String(d.getMonth() + 1).padStart(2, '0');
                const DD = String(d.getDate()).padStart(2, '0');
                return `${YYYY}-${MM}-${DD}`;
            }
        }
        
        // 2. 尝试解析字符串格式 "YYYY-MM-DD HH:MM:SS"
        const s = String(ts || '').trim();
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) {
            return `${m[1]}-${m[2]}-${m[3]}`;
        }
    } catch (e) {
        // ignore
    }
    
    return '';
}
```

**输出格式**: `YYYY-MM-DD`（例如: `2026-01-19`）

---

### 2. 显示位置

**HTML 模板**: `hotnews/web/templates/viewer.html` 第 266-271 行

```html
{% if news.timestamp %}
<span class="tr-news-date" 
      style="margin-left:8px;color:#9ca3af;font-size:12px;white-space:nowrap;">
    {{ news.timestamp[:10] }}
</span>
{% endif %}
```

**JavaScript 动态渲染**: `hotnews/web/static/js/src/data.js` 第 103-115 行

```javascript
const dateStr = formatNewsDate(n?.timestamp);
if (dateStr) {
    const dateSpan = document.createElement('span');
    dateSpan.className = 'tr-news-date';
    dateSpan.style.marginLeft = '8px';
    dateSpan.style.color = '#9ca3af';
    dateSpan.style.fontSize = '12px';
    dateSpan.style.whiteSpace = 'nowrap';
    dateSpan.textContent = dateStr;
    content.appendChild(dateSpan);
}
```

---

## 不同栏目的日期含义

### 📰 综合新闻、💰 财经投资、🔥 社交娱乐、📱 科技资讯、💻 开发者、🏀 体育
- **日期含义**: 系统抓取时间
- **原因**: 这些平台主要是热榜，不提供准确的发布时间
- **更新频率**: 根据自动抓取设置（通常每小时）

### 🧐 深入探索（RSS 订阅）
- **日期含义**: RSS 源的发布时间（`published_at`）
- **备用**: 如果 RSS 源未提供发布时间，使用系统创建时间（`created_at`）
- **特点**: 更准确反映内容的实际发布时间

### 📚 每日AI早报
- **日期含义**: RSS 源的发布时间
- **排序**: 按发布时间倒序（最新的在前）
- **过滤**: 默认过滤掉 `published_at = 0` 的记录

### 🏷️ 我的标签
- **日期含义**: RSS 源的发布时间（`published_at`）
- **数据来源**: 用户订阅的 RSS 源
- **显示**: `hotnews/web/static/js/src/my-tags.js` 第 182 行

```javascript
${item.published_at ? 
  `<span class="tr-news-date" style="margin-left:8px;color:#9ca3af;font-size:12px;white-space:nowrap;">
    ${String(item.published_at).slice(0, 10)}
  </span>` 
  : ''}
```

---

## 数据流程图

```
┌─────────────────────────────────────────────────────────────┐
│                        数据源                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐              ┌──────────────────┐    │
│  │   RSS 订阅源      │              │   普通新闻源      │    │
│  │                  │              │   (热榜爬虫)      │    │
│  │  - published_at  │              │  - crawl_time    │    │
│  │  - created_at    │              │  - crawl_date    │    │
│  └──────────────────┘              └──────────────────┘    │
│           │                                 │               │
│           ▼                                 ▼               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              数据库 (SQLite)                          │  │
│  │  - rss_entries.published_at (Unix 时间戳)            │  │
│  │  - rss_entries.created_at (Unix 时间戳)              │  │
│  │  - 普通新闻: timestamp = crawl_date + crawl_time     │  │
│  └──────────────────────────────────────────────────────┘  │
│           │                                                 │
│           ▼                                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              后端 API (FastAPI)                       │  │
│  │  - /api/news                                          │  │
│  │  - /api/morning-brief                                 │  │
│  │  - /api/explore-timeline                              │  │
│  └──────────────────────────────────────────────────────┘  │
│           │                                                 │
│           ▼                                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              前端渲染                                  │  │
│  │  - formatNewsDate(timestamp)                          │  │
│  │  - 输出: YYYY-MM-DD                                   │  │
│  │  - 显示: 灰色小字，右对齐                             │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 时间戳格式说明

### Unix 时间戳（秒）
- **范围**: 1970-01-01 00:00:00 UTC 至今
- **示例**: `1737331200` = 2026-01-20 00:00:00 UTC
- **使用场景**: RSS 订阅源的 `published_at` 和 `created_at`

### 字符串格式
- **格式**: `YYYY-MM-DD HH:MM:SS`
- **示例**: `2026-01-19 15:30:00`
- **使用场景**: 某些 RSS 源可能提供字符串格式

### 显示格式
- **格式**: `YYYY-MM-DD`
- **示例**: `2026-01-19`
- **特点**: 只显示日期，不显示时间

---

## 特殊处理

### 1. Morning Brief（每日AI早报）
- **过滤规则**: 默认过滤 `published_at = 0` 的记录
- **配置**: `drop_published_at_zero = True`
- **原因**: 确保只显示有明确发布时间的内容

### 2. Explore Timeline（深入探索）
- **时间范围验证**: 2000-01-01 至当前时间 + 1 年
- **目的**: 防止异常数据
- **代码位置**: `hotnews/web/server.py` 第 1786-1787 行

```python
min_timestamp = 946684800  # 2000-01-01
max_timestamp = int(time_module.time()) + (365 * 24 * 3600)  # Current + 1 year
```

### 3. NBA 赛程
- **特殊格式**: `[MM-DD HH:MM]` 前缀
- **解析**: 提取比赛时间
- **代码位置**: `hotnews/web/news_viewer.py` 第 48-56 行

---

## 总结

### RSS 订阅源
- ✅ **显示**: RSS 源的发布时间（`published_at`）
- ✅ **备用**: 系统创建时间（`created_at`）
- ✅ **准确性**: 高（由内容提供方提供）
- ✅ **验证**: 时间戳范围验证（2000-01-01 ~ 当前+7天）

### 普通新闻源（热榜）
- ✅ **显示**: 系统抓取时间（`crawl_date`）
- ⚠️ **注意**: 不是新闻发布时间
- ✅ **一致性**: 高（统一使用抓取时间）

### 用户体验
- 📅 **格式统一**: 所有日期都显示为 `YYYY-MM-DD`
- 🎨 **样式统一**: 灰色小字，右对齐
- 📱 **响应式**: 移动端自动适配
- 🛡️ **数据验证**: 前后端双重验证，过滤无效时间戳

---

## 已知问题及修复

### ✅ 已修复：日期显示问题（2026-01-19）

#### 问题 1: "我的标签"日期显示为时间戳
- **现象**: 显示为 `1737331200` 而不是 `2026-01-19`
- **原因**: 前端直接截取时间戳字符串，未格式化
- **修复**: 使用统一的 `formatNewsDate` 函数
- **文件**: `hotnews/web/static/js/src/my-tags.js`

#### 问题 2: 日期显示超过当前时间
- **现象**: 某些新闻显示未来日期
- **原因**: 缺乏时间戳有效性验证
- **修复**: 
  - 前端: 增强 `formatNewsDate` 函数，添加范围验证
  - 后端: 在数据库查询和处理时添加时间戳过滤
- **文件**: 
  - `hotnews/web/static/js/src/core.js`
  - `hotnews/kernel/user/preferences_api.py`
  - `hotnews/web/server.py`

#### 验证范围
- **最小值**: `946684800` (2000-01-01 00:00:00 UTC)
- **最大值**: 当前时间 + 7天
- **原因**: 允许时区差异和预发布内容，同时过滤明显错误的数据

详细修复说明请参考: `docs/fixes/date-display-fixes.md`

---

**文档版本**: 1.0  
**更新时间**: 2026-01-19  
**维护者**: Hotnews Team
