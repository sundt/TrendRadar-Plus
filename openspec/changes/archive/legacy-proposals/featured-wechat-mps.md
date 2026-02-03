# 精选公众号功能方案

> 创建时间：2026-01-28
> 状态：待实现

## 一、功能概述

在 Admin 后台增加「公众号订阅」页签，管理员可以管理精选公众号列表。前端新增「精选公众号」栏目，展示管理员精选的公众号及其最新文章。

### 1.1 核心功能

| 功能 | 说明 |
|------|------|
| 批量导入 | 通过 CSV/Excel 批量导入公众号列表（推荐） |
| 搜索公众号 | 通过关键词搜索微信公众号（单个添加） |
| 添加精选 | 将搜索到的公众号添加到精选列表 |
| 管理列表 | 编辑分类、调整排序、启用/禁用、删除 |
| 前端展示 | 「精选公众号」栏目展示精选公众号的最新文章 |

### 1.2 用户场景

```
场景一：批量导入（推荐）
1. 准备 CSV 文件，包含公众号名称和分类
2. 进入 Admin 后台 → 公众号订阅页签
3. 点击「批量导入」上传 CSV 文件
4. 系统自动搜索并匹配公众号信息
5. 预览导入结果，确认后批量添加

场景二：单个添加
1. 进入 Admin 后台 → 公众号订阅页签
2. 搜索想要推荐的公众号（如"36氪"）
3. 点击添加到精选列表
4. 设置分类（科技/财经/生活等）

普通用户流程：
1. 访问首页 → 切换到「精选公众号」栏目
2. 看到多个公众号卡片，每个卡片显示该公众号最新文章
3. 点击文章标题跳转阅读
```

---

## 二、数据库设计

### 2.1 新增表：featured_wechat_mps

存储管理员精选的公众号列表。

```sql
-- 精选公众号表（Admin 管理）
CREATE TABLE IF NOT EXISTS featured_wechat_mps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fakeid TEXT NOT NULL UNIQUE,           -- 公众号唯一ID（微信内部ID）
    nickname TEXT NOT NULL,                 -- 公众号名称
    round_head_img TEXT DEFAULT '',         -- 头像URL
    signature TEXT DEFAULT '',              -- 公众号简介
    category TEXT DEFAULT 'general',        -- 分类标签
    sort_order INTEGER DEFAULT 0,           -- 排序权重（越小越靠前）
    enabled INTEGER DEFAULT 1,              -- 是否启用：1=启用, 0=禁用
    article_count INTEGER DEFAULT 50,       -- 每次抓取文章数量
    last_fetch_at INTEGER DEFAULT 0,        -- 最后抓取时间
    created_at INTEGER NOT NULL,            -- 添加时间
    updated_at INTEGER NOT NULL             -- 更新时间
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_featured_mps_enabled ON featured_wechat_mps(enabled, sort_order);
CREATE INDEX IF NOT EXISTS idx_featured_mps_category ON featured_wechat_mps(category, enabled);
```

### 2.2 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| fakeid | TEXT | 微信公众号唯一标识，从搜索结果获取 |
| nickname | TEXT | 公众号显示名称 |
| round_head_img | TEXT | 公众号头像 URL |
| signature | TEXT | 公众号简介/签名 |
| category | TEXT | 分类：tech/finance/lifestyle/news/general |
| sort_order | INTEGER | 排序权重，数值越小越靠前 |
| enabled | INTEGER | 启用状态，0=禁用，1=启用 |
| article_count | INTEGER | 每次抓取的文章数量，默认10 |
| last_fetch_at | INTEGER | 最后一次抓取文章的时间戳 |

### 2.3 分类定义

| category | 名称 | 说明 |
|----------|------|------|
| tech | 科技 | 科技、互联网、AI 相关 |
| finance | 财经 | 财经、投资、商业 |
| news | 新闻 | 时事新闻、社会热点 |
| lifestyle | 生活 | 生活方式、文化、娱乐 |
| general | 综合 | 其他/未分类 |

### 2.4 复用现有表

文章数据存储在现有的 `wechat_mp_articles` 表中：

```sql
-- 已存在，无需修改
CREATE TABLE IF NOT EXISTS wechat_mp_articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fakeid TEXT NOT NULL,
    dedup_key TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    digest TEXT DEFAULT '',
    cover_url TEXT DEFAULT '',
    publish_time INTEGER DEFAULT 0,
    publish_hour INTEGER DEFAULT -1,
    fetched_at INTEGER NOT NULL,
    mp_nickname TEXT DEFAULT ''
);
```

---

## 三、后端 API 设计

### 3.1 新建文件

`hotnews/hotnews/kernel/admin/featured_mp_admin.py`

### 3.2 Admin API（需要管理员权限）

#### GET /api/admin/featured-mps
获取精选公众号列表

**请求参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| category | string | 否 | 按分类筛选 |
| enabled | string | 否 | 按状态筛选：all/enabled/disabled |

**响应示例：**
```json
{
  "ok": true,
  "list": [
    {
      "id": 1,
      "fakeid": "MzI2NTY...",
      "nickname": "36氪",
      "round_head_img": "https://...",
      "signature": "让创业更简单",
      "category": "tech",
      "sort_order": 0,
      "enabled": 1,
      "article_count": 10,
      "last_fetch_at": 1706428800,
      "created_at": 1706400000,
      "updated_at": 1706428800
    }
  ],
  "total": 1
}
```

#### POST /api/admin/featured-mps
添加精选公众号

**请求体：**
```json
{
  "fakeid": "MzI2NTY...",
  "nickname": "36氪",
  "round_head_img": "https://...",
  "signature": "让创业更简单",
  "category": "tech",
  "sort_order": 0
}
```

**响应：**
```json
{
  "ok": true,
  "message": "添加成功",
  "id": 1
}
```

#### PUT /api/admin/featured-mps/{fakeid}
更新精选公众号

**请求体：**
```json
{
  "category": "finance",
  "sort_order": 5,
  "enabled": 1,
  "article_count": 15
}
```

#### DELETE /api/admin/featured-mps/{fakeid}
删除精选公众号

**响应：**
```json
{
  "ok": true,
  "message": "删除成功"
}
```

#### POST /api/admin/featured-mps/reorder
批量调整排序

**请求体：**
```json
{
  "orders": [
    {"fakeid": "MzI2NTY...", "sort_order": 0},
    {"fakeid": "MzA3MTI...", "sort_order": 1}
  ]
}
```

#### GET /api/admin/featured-mps/search
搜索公众号（复用现有微信搜索能力）

**请求参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| keyword | string | 是 | 搜索关键词 |
| limit | int | 否 | 返回数量，默认10 |

**响应：**
```json
{
  "ok": true,
  "list": [
    {
      "fakeid": "MzI2NTY...",
      "nickname": "36氪",
      "round_head_img": "https://...",
      "signature": "让创业更简单",
      "is_featured": false
    }
  ]
}
```

#### POST /api/admin/featured-mps/fetch
手动触发抓取文章

**请求体：**
```json
{
  "fakeid": "MzI2NTY...",  // 可选，不传则抓取所有启用的
  "count": 20              // 可选，抓取数量
}
```

#### GET /api/admin/featured-mps/export
导出精选公众号列表为 CSV

**请求参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| category | string | 否 | 按分类筛选 |
| enabled | string | 否 | 按状态筛选：all/enabled/disabled |

**响应：** CSV 文件下载

```csv
公众号名称,fakeid,分类,状态,排序,添加时间
36氪,MzI2NTY...,tech,启用,0,2026-01-28
虎嗅,MzA3MTI...,tech,启用,1,2026-01-28
```

---

### 3.4 批量导入 API

#### POST /api/admin/featured-mps/import/preview
预览批量导入（不实际写入）

**请求方式：** multipart/form-data 或 JSON

**方式一：上传 CSV 文件**
```
Content-Type: multipart/form-data
file: <CSV文件>
```

**方式二：直接传 CSV 文本**
```json
{
  "csv_text": "公众号名称,分类\n36氪,tech\n虎嗅,tech\n第一财经,finance"
}
```

**CSV 格式说明：**

| 格式 | 示例 | 说明 |
|------|------|------|
| 仅名称 | `36氪` | 每行一个公众号名称 |
| 名称+分类 | `36氪,tech` | 逗号分隔 |
| 带表头 | `公众号名称,分类` | 自动识别表头 |

**支持的 CSV 格式：**

```csv
# 格式1：仅公众号名称（每行一个）
36氪
虎嗅
第一财经
澎湃新闻

# 格式2：名称 + 分类
36氪,tech
虎嗅,tech
第一财经,finance
澎湃新闻,news

# 格式3：带表头
公众号名称,分类,备注
36氪,tech,科技媒体
虎嗅,tech,商业科技
第一财经,finance,财经新闻
```

**响应示例：**
```json
{
  "ok": true,
  "preview_id": "prev_abc123",
  "total": 10,
  "valid": 8,
  "invalid": 2,
  "items": [
    {
      "line": 1,
      "input_name": "36氪",
      "input_category": "tech",
      "status": "found",
      "matched": {
        "fakeid": "MzI2NTY...",
        "nickname": "36氪",
        "round_head_img": "https://...",
        "signature": "让创业更简单"
      }
    },
    {
      "line": 2,
      "input_name": "虎嗅",
      "input_category": "tech",
      "status": "found",
      "matched": {
        "fakeid": "MzA3MTI...",
        "nickname": "虎嗅",
        "round_head_img": "https://...",
        "signature": "有视角的商业资讯"
      }
    },
    {
      "line": 3,
      "input_name": "不存在的公众号",
      "input_category": "tech",
      "status": "not_found",
      "error": "未找到匹配的公众号"
    },
    {
      "line": 4,
      "input_name": "36氪",
      "input_category": "tech",
      "status": "duplicate",
      "error": "与第1行重复"
    }
  ]
}
```

**状态说明：**

| status | 说明 |
|--------|------|
| found | 成功匹配到公众号 |
| not_found | 未找到匹配的公众号 |
| duplicate | 与其他行重复 |
| exists | 已在精选列表中 |
| error | 其他错误 |

#### POST /api/admin/featured-mps/import/confirm
确认批量导入

**请求体：**
```json
{
  "preview_id": "prev_abc123",
  "selected_lines": [1, 2, 5, 6],  // 可选，指定导入哪些行，不传则导入所有 found 状态的
  "skip_exists": true              // 可选，跳过已存在的，默认 true
}
```

**响应：**
```json
{
  "ok": true,
  "imported": 6,
  "skipped": 2,
  "failed": 0,
  "details": [
    {"line": 1, "nickname": "36氪", "status": "imported"},
    {"line": 2, "nickname": "虎嗅", "status": "imported"},
    {"line": 3, "nickname": "第一财经", "status": "skipped", "reason": "已存在"}
  ]
}
```

#### GET /api/admin/featured-mps/import/template
下载导入模板

**响应：** CSV 文件下载

```csv
公众号名称,分类,备注
36氪,tech,示例：科技媒体
虎嗅,tech,示例：商业科技
第一财经,finance,示例：财经新闻
```

### 3.3 前端展示 API（无需登录）

#### GET /api/featured-mps
获取精选公众号及其最新文章

**请求参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| category | string | 否 | 按分类筛选 |
| article_limit | int | 否 | 每个公众号返回文章数，默认50 |

**响应示例：**
```json
{
  "ok": true,
  "mps": [
    {
      "fakeid": "MzI2NTY...",
      "nickname": "36氪",
      "round_head_img": "https://...",
      "signature": "让创业更简单",
      "category": "tech",
      "articles": [
        {
          "id": 123,
          "title": "OpenAI 发布 GPT-5",
          "url": "https://mp.weixin.qq.com/s/...",
          "digest": "文章摘要...",
          "cover_url": "https://...",
          "publish_time": 1706428800
        }
      ]
    }
  ]
}
```

---

## 四、Admin 前端页面

### 4.1 新建文件

- `hotnews/hotnews/kernel/templates/admin_featured_mps.html`
- `hotnews/hotnews/kernel/static/js/admin_featured_mps.js`

### 4.2 页面布局

```
┌─────────────────────────────────────────────────────────────┐
│  Admin 后台                                                  │
├─────────────────────────────────────────────────────────────┤
│  [RSS源管理] [自定义源] [公众号订阅] [标签管理] [系统设置]      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [� 批量导入]  [➕ 单个添加]  [📄 下载模板]           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 筛选: [全部分类 ▼] [全部状态 ▼]    共 12 个精选公众号  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ☰ │ 🖼️ │ 36氪              │ 科技 │ ✅启用 │ [编辑][删除] │
│  │ ☰ │ 🖼️ │ 虎嗅              │ 科技 │ ✅启用 │ [编辑][删除] │
│  │ ☰ │ 🖼️ │ 第一财经          │ 财经 │ ✅启用 │ [编辑][删除] │
│  │ ☰ │ 🖼️ │ 澎湃新闻          │ 新闻 │ ⏸禁用 │ [编辑][删除] │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 批量导入弹窗

```
┌─────────────────────────────────────────────────────────────┐
│  📥 批量导入公众号                                    [✕]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  步骤 1：上传文件或粘贴内容                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │     📄 拖拽 CSV 文件到此处，或 [选择文件]            │   │
│  │                                                     │   │
│  │     ─────────── 或 ───────────                     │   │
│  │                                                     │   │
│  │     直接粘贴公众号名称（每行一个）：                  │   │
│  │     ┌─────────────────────────────────────────┐   │   │
│  │     │ 36氪                                    │   │   │
│  │     │ 虎嗅                                    │   │   │
│  │     │ 第一财经                                │   │   │
│  │     │ ...                                     │   │   │
│  │     └─────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│                              [下一步：预览匹配结果]          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  步骤 2：预览匹配结果                                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ✅ 成功匹配 8 个 │ ❌ 未找到 2 个 │ ⚠️ 已存在 1 个    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [☑] │ 36氪        │ ✅ 匹配成功 │ 科技 │ 让创业更简单 │   │
│  │ [☑] │ 虎嗅        │ ✅ 匹配成功 │ 科技 │ 有视角的商业 │   │
│  │ [☑] │ 第一财经    │ ✅ 匹配成功 │ 财经 │ 专业财经资讯 │   │
│  │ [☐] │ 不存在的号  │ ❌ 未找到   │  -   │      -       │   │
│  │ [☐] │ 澎湃新闻    │ ⚠️ 已存在   │ 新闻 │ 已在列表中   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│                    [返回修改]    [确认导入 8 个]             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.4 交互功能

1. **批量导入（推荐）**
   - 点击「批量导入」打开导入弹窗
   - 支持拖拽上传 CSV 文件
   - 支持直接粘贴公众号名称列表
   - 系统自动搜索匹配公众号信息
   - 预览匹配结果，可勾选要导入的
   - 确认后批量添加到精选列表

2. **单个添加**
   - 点击「单个添加」打开搜索弹窗
   - 输入关键词搜索公众号
   - 搜索结果显示在列表中
   - 点击「添加」将公众号加入精选列表

3. **列表管理**
   - 拖拽排序（通过 ☰ 手柄）
   - 点击「编辑」修改分类、抓取数量
   - 点击状态切换启用/禁用
   - 点击「删除」移除（需确认）

4. **批量操作**
   - 全选/取消全选
   - 批量启用/禁用
   - 批量删除
   - 批量修改分类

---

## 五、前端栏目展示

### 5.1 新增栏目配置

在 `news_viewer.py` 的 `PLATFORM_CATEGORIES` 中添加：

```python
PLATFORM_CATEGORIES = {
    # ... 现有栏目
    "featured-mps": {
        "id": "featured-mps",
        "name": "精选公众号",
        "icon": "📱",
        "platforms": {}  # 动态填充
    }
}
```

### 5.2 数据加载逻辑

```python
def _load_featured_mps_category(conn):
    """加载精选公众号栏目数据"""
    # 1. 获取启用的精选公众号
    cur = conn.execute("""
        SELECT fakeid, nickname, round_head_img, signature, category
        FROM featured_wechat_mps
        WHERE enabled = 1
        ORDER BY sort_order ASC
    """)
    mps = cur.fetchall()
    
    platforms = {}
    for mp in mps:
        fakeid, nickname, avatar, signature, category = mp
        
        # 2. 获取该公众号最新文章
        art_cur = conn.execute("""
            SELECT title, url, publish_time, digest
            FROM wechat_mp_articles
            WHERE fakeid = ?
            ORDER BY publish_time DESC
            LIMIT 50
        """, (fakeid,))
        articles = art_cur.fetchall()
        
        # 3. 构建平台数据
        platform_id = f"wechat-{fakeid[:8]}"
        platforms[platform_id] = {
            "name": nickname,
            "icon": avatar,
            "news": [
                {
                    "title": art[0],
                    "url": art[1],
                    "timestamp": _format_time(art[2]),
                    "meta": art[3][:50] if art[3] else ""
                }
                for art in articles
            ]
        }
    
    return platforms
```

### 5.3 卡片展示样式

每个公众号作为一个卡片，样式与现有平台卡片一致：

```
┌─────────────────────────────────┐
│ 📱 36氪                          │
├─────────────────────────────────┤
│ 1. OpenAI 发布 GPT-5      01-28 │
│ 2. 苹果 Vision Pro 开售   01-28 │
│ 3. 特斯拉 Q4 财报解读     01-27 │
│ ...                             │
└─────────────────────────────────┘
```

---

## 六、定时任务

### 6.1 复用现有抓取机制

精选公众号的文章抓取复用系统现有的公众号抓取机制，无需单独创建定时任务。

**实现方式：**
1. 在现有的公众号文章抓取任务中，增加对 `featured_wechat_mps` 表的支持
2. 抓取时优先处理精选公众号
3. 文章存入现有的 `wechat_mp_articles` 表

**修改文件：** 查看现有抓取任务实现，在其中添加精选公众号的处理逻辑

---

## 七、实现计划

### 7.1 阶段划分

| 阶段 | 任务 | 预估工时 | 优先级 |
|------|------|----------|--------|
| P1 | 数据库表创建 | 0.5h | 高 |
| P2 | Admin API 后端（含批量导入） | 3h | 高 |
| P3 | Admin 前端页面（含批量导入弹窗） | 4h | 高 |
| P4 | 前端栏目展示 | 2h | 中 |
| P5 | 集成现有抓取机制 | 1h | 中 |
| P6 | 测试 + 部署 | 1h | 高 |

**总计：约 11.5 小时**

### 7.2 依赖关系

```
P1 数据库表
 ↓
P2 Admin API ──→ P3 Admin 前端
 ↓
P4 前端栏目 ←── P5 集成抓取机制
 ↓
P6 测试部署
```

### 7.3 里程碑

1. **M1 - Admin 管理功能**（P1 + P2 + P3）
   - 管理员可以搜索、添加、管理精选公众号
   
2. **M2 - 前端展示**（P4 + P5）
   - 用户可以在首页看到精选公众号栏目
   
3. **M3 - 上线**（P6）
   - 完成测试，部署到生产环境

---

## 八、注意事项

### 8.1 认证依赖

搜索公众号需要有效的微信公众号后台 Cookie。解决方案：

1. **管理员认证**：管理员在 Admin 后台配置自己的微信认证
2. **共享凭证池**：复用现有的 `wechat_shared_credentials` 机制
3. **降级处理**：无可用凭证时，显示提示信息

### 8.2 频率限制

微信公众号后台有请求频率限制：

- 搜索接口：建议间隔 3 秒以上
- 文章列表：建议间隔 2 秒以上
- 定时任务：每 2 小时执行一次，避免频繁请求
- **批量导入**：每个公众号搜索间隔 3 秒，50 个公众号约需 2.5 分钟

### 8.3 缓存策略

| 数据 | 缓存时间 | 说明 |
|------|----------|------|
| 精选公众号列表 | 5 分钟 | Admin 修改后自动失效 |
| 公众号文章 | 30 分钟 | 定时任务更新后失效 |
| 搜索结果 | 不缓存 | 实时搜索 |
| 批量导入预览 | 10 分钟 | preview_id 有效期 |

### 8.4 错误处理

| 场景 | 处理方式 |
|------|----------|
| 微信认证过期 | 提示管理员重新配置认证 |
| 搜索无结果 | 显示"未找到相关公众号" |
| 抓取失败 | 记录日志，下次重试 |
| 公众号被封禁 | 自动禁用，通知管理员 |
| 批量导入超时 | 支持断点续传，已匹配的不丢失 |

### 8.5 公众号头像代理

微信公众号头像 URL 有防盗链限制，需要通过服务端代理：

```python
# 已有实现：/api/wechat/avatar-proxy
# 前端使用：/api/wechat/avatar-proxy?url={encoded_url}
```

### 8.6 文章 URL 有效期

微信公众号文章 URL 可能会失效（被删除、被举报等），需要：

1. 定期检测文章 URL 有效性
2. 失效文章标记为不可用
3. 前端显示时过滤失效文章

### 8.7 数据导出

支持将精选公众号列表导出为 CSV，便于备份和迁移：

```
GET /api/admin/featured-mps/export
```

---

## 九、风险与应对

### 9.1 技术风险

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| 微信接口变更 | 搜索/抓取失败 | 监控告警 + 快速适配 |
| 认证频繁过期 | 无法抓取文章 | 多凭证轮换 + 扫码续期提醒 |
| 请求被限流 | 批量导入慢 | 队列化处理 + 进度显示 |

### 9.2 业务风险

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| 公众号停更 | 内容陈旧 | 定期检测更新频率，提示管理员 |
| 公众号改名 | 显示不一致 | 定期同步公众号信息 |
| 内容违规 | 法律风险 | 仅展示标题和链接，不存储正文 |

---

## 十、确认事项

> ✅ 已确认（2026-01-28）

### 10.1 功能范围

| 问题 | 确认结果 |
|------|----------|
| 用户端订阅功能 | V1 不做，仅管理员管理。标题右键可一键关注（后续考虑） |
| 分组展示 | 统一列表，不按分类分组（只放科技/AI/财经类） |
| 文章阅读统计 | 复用系统现有的点击率统计机制 |

### 10.2 数据相关

| 问题 | 确认结果 |
|------|----------|
| 每个公众号显示文章数 | **50 篇** |
| 文章保留时间 | 30 天，自动清理旧文章 |
| 文章全文缓存 | 否，仅存标题和链接 |

### 10.3 运营相关

| 问题 | 确认结果 |
|------|----------|
| 初始精选公众号 | 后期管理员自行导入 |
| 分类 | 与普通栏目保持一致 |
| 抓取频率 | 复用系统现有的公众号抓取机制 |

### 10.4 技术相关

| 问题 | 确认结果 |
|------|----------|
| 微信认证来源 | 优先使用共享凭证池 |
| 栏目位置 | 放在「每日AI早报」后面 |

---

## 十一、扩展规划

### 11.1 后续功能

1. **用户订阅**：允许用户订阅精选公众号，个性化推荐
2. **阅读统计**：统计文章点击量，优化排序
3. **智能推荐**：基于用户行为推荐公众号
4. **分类筛选**：前端支持按分类筛选公众号

### 11.2 数据分析

- 公众号文章更新频率分析
- 用户点击热度分析
- 最佳抓取时间分析

---

## 十二、相关文件

### 12.1 需要新建的文件

```
hotnews/hotnews/kernel/admin/featured_mp_admin.py         # Admin API
hotnews/hotnews/kernel/templates/admin_featured_mps.html  # Admin 页面
hotnews/hotnews/kernel/static/js/admin_featured_mps.js    # Admin JS
```

### 12.2 需要修改的文件

```
hotnews/hotnews/web/db_online.py          # 添加数据库表
hotnews/hotnews/web/news_viewer.py        # 添加栏目配置（放在每日AI早报后面）
hotnews/hotnews/kernel/admin/__init__.py  # 注册路由
# 现有公众号抓取任务文件                    # 集成精选公众号抓取
```

### 12.3 参考文件

```
hotnews/hotnews/kernel/admin/wechat_admin.py   # 微信相关 API 参考
hotnews/hotnews/kernel/admin/rss_admin.py      # Admin 页面结构参考
hotnews/hotnews/kernel/templates/admin_rss_sources.html  # 页面模板参考
```
