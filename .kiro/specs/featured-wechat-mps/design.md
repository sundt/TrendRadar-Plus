# Design Document: 精选公众号功能

## Overview

本设计在 Admin 后台新增「公众号订阅」页签，实现精选公众号的管理功能。管理员可以通过批量导入或单个添加的方式维护精选公众号列表，前端新增「精选公众号」栏目展示这些公众号的最新文章。

设计原则：
- 复用现有架构，最小化改动
- 批量导入为主，单个添加为辅
- 复用共享凭证池和现有抓取机制
- 与现有栏目系统无缝集成

## Architecture

### 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Admin 后台                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  公众号订阅 Tab                                       │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │   │
│  │  │批量导入   │ │单个添加   │ │导出列表   │            │   │
│  │  └──────────┘ └──────────┘ └──────────┘            │   │
│  │                                                     │   │
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │ 精选公众号列表（拖拽排序、编辑、删除）         │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      后端 API                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Admin API   │  │ 前端 API    │  │ 现有抓取机制         │  │
│  │ /api/admin/ │  │ /api/       │  │ (复用)              │  │
│  │ featured-mps│  │ featured-mps│  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      数据库                                  │
│  ┌─────────────────────┐  ┌─────────────────────────────┐  │
│  │ featured_wechat_mps │  │ wechat_mp_articles (复用)    │  │
│  │ (新增)              │  │                             │  │
│  └─────────────────────┘  └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      前端首页                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  精选公众号栏目（位于每日AI早报后面）                   │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐       │   │
│  │  │ 36氪   │ │ 虎嗅   │ │第一财经│ │ ...    │       │   │
│  │  │ 文章1  │ │ 文章1  │ │ 文章1  │ │        │       │   │
│  │  │ 文章2  │ │ 文章2  │ │ 文章2  │ │        │       │   │
│  │  │ ...    │ │ ...    │ │ ...    │ │        │       │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 数据流

1. **批量导入流程**:
   ```
   CSV 文件/文本 → 解析 → 逐个搜索匹配 → 预览结果 → 确认导入 → 写入数据库
   ```

2. **单个添加流程**:
   ```
   搜索关键词 → 调用微信 API → 显示结果 → 点击添加 → 写入数据库
   ```

3. **前端展示流程**:
   ```
   加载栏目配置 → 查询 featured_wechat_mps → 查询 wechat_mp_articles → 渲染卡片
   ```

## Data Loading Strategy

### 动态栏目机制

精选公众号栏目采用与"我的关注"相同的动态加载机制：

```python
# page_rendering.py 中注入栏目配置
def _inject_featured_mps_category(data: Dict[str, Any]) -> Dict[str, Any]:
    """Inject 'featured-mps' category (public, no auth required)."""
    featured_mps = {
        "id": "featured-mps",
        "name": "精选公众号",
        "icon": "📱",
        "platforms": {},
        "news_count": 0,
        "filtered_count": 0,
        "is_new": False,
        "requires_auth": False,  # 无需登录
        "is_dynamic": True,      # 动态加载
    }
    # Insert after 每日AI早报 (knowledge)
    ...
```

### 前端加载流程

```javascript
// featured-mps.js
const FEATURED_MPS_CACHE_KEY = 'hotnews_featured_mps_cache';
const FEATURED_MPS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let featuredMpsLoaded = false;
let featuredMpsLoading = false;

/**
 * 主加载函数
 */
async function loadFeaturedMps(force = false) {
    if (featuredMpsLoading) return;
    if (featuredMpsLoaded && !force) return;
    
    const container = document.getElementById('featuredMpsGrid');
    if (!container) return;
    
    featuredMpsLoading = true;
    
    try {
        // 1. 尝试从前端缓存加载
        if (!force) {
            const cached = getCachedData();
            if (cached && cached.length > 0) {
                renderFeaturedMps(container, cached);
                featuredMpsLoaded = true;
                featuredMpsLoading = false;
                // 后台静默更新缓存
                fetchAndUpdateCache();
                return;
            }
        }
        
        // 2. 显示加载状态
        container.innerHTML = `<div class="loading">加载中...</div>`;
        
        // 3. 从 API 获取数据
        const result = await fetch('/api/featured-mps');
        const data = await result.json();
        
        // 4. 保存到前端缓存
        setCachedData(data.mps);
        
        // 5. 渲染数据
        renderFeaturedMps(container, data.mps);
        featuredMpsLoaded = true;
        
    } finally {
        featuredMpsLoading = false;
    }
}

/**
 * Tab 切换时触发加载
 */
function handleTabSwitch(categoryId) {
    if (categoryId === 'featured-mps') {
        loadFeaturedMps();
    }
}

// 监听 Tab 切换事件
window.addEventListener('tr_tab_switched', (event) => {
    handleTabSwitch(event?.detail?.categoryId);
});
```

### 后端 API 缓存

```python
# featured_mp_admin.py
from functools import lru_cache
import time

# 内存缓存，5分钟过期
_featured_mps_cache = {
    "data": None,
    "timestamp": 0,
    "ttl": 300  # 5 minutes
}

def get_featured_mps_with_articles():
    """获取精选公众号及其文章（带缓存）"""
    now = time.time()
    
    # 检查缓存是否有效
    if (_featured_mps_cache["data"] is not None and 
        now - _featured_mps_cache["timestamp"] < _featured_mps_cache["ttl"]):
        return {
            "ok": True,
            "mps": _featured_mps_cache["data"],
            "cached": True,
            "cache_age": int(now - _featured_mps_cache["timestamp"])
        }
    
    # 从数据库加载
    mps = _load_featured_mps_from_db()
    
    # 更新缓存
    _featured_mps_cache["data"] = mps
    _featured_mps_cache["timestamp"] = now
    
    return {
        "ok": True,
        "mps": mps,
        "cached": False
    }

def invalidate_featured_mps_cache():
    """Admin 修改后清除缓存"""
    _featured_mps_cache["data"] = None
    _featured_mps_cache["timestamp"] = 0
```

### 缓存层级

| 层级 | 位置 | TTL | 失效条件 |
|------|------|-----|----------|
| L1 | 前端 localStorage | 5 分钟 | 手动清除或过期 |
| L2 | 后端内存 | 5 分钟 | Admin 修改或过期 |
| L3 | 数据库 | - | 实时数据 |

### 数据流

```
用户切换到精选公众号 Tab
         │
         ▼
    检查前端缓存 ──有效──→ 渲染缓存数据 ──→ 后台静默更新
         │
        无效
         │
         ▼
    调用 /api/featured-mps
         │
         ▼
    检查后端缓存 ──有效──→ 返回缓存数据
         │
        无效
         │
         ▼
    查询数据库 → 更新后端缓存 → 返回数据
         │
         ▼
    前端保存缓存 → 渲染数据
```

## Components and Interfaces

### 1. 后端组件

#### 1.1 Featured MP Admin API (`hotnews/kernel/admin/featured_mp_admin.py`)

```python
# Admin API 端点（需要管理员权限）

# 列表管理
GET  /api/admin/featured-mps              # 获取精选公众号列表
POST /api/admin/featured-mps              # 添加精选公众号
PUT  /api/admin/featured-mps/{fakeid}     # 更新精选公众号
DELETE /api/admin/featured-mps/{fakeid}   # 删除精选公众号
POST /api/admin/featured-mps/reorder      # 批量调整排序

# 搜索
GET  /api/admin/featured-mps/search       # 搜索公众号

# 批量导入
POST /api/admin/featured-mps/import/preview   # 预览批量导入
POST /api/admin/featured-mps/import/confirm   # 确认批量导入
GET  /api/admin/featured-mps/import/template  # 下载导入模板

# 导出
GET  /api/admin/featured-mps/export       # 导出精选公众号列表

# 手动抓取
POST /api/admin/featured-mps/fetch        # 手动触发抓取
```

#### 1.2 前端展示 API

```python
# 前端 API（无需登录）

GET /api/featured-mps                     # 获取精选公众号及其文章
```

### 2. 数据库设计

#### 2.1 新增表：featured_wechat_mps

```sql
CREATE TABLE IF NOT EXISTS featured_wechat_mps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fakeid TEXT NOT NULL UNIQUE,           -- 公众号唯一ID
    nickname TEXT NOT NULL,                 -- 公众号名称
    round_head_img TEXT DEFAULT '',         -- 头像URL
    signature TEXT DEFAULT '',              -- 公众号简介
    category TEXT DEFAULT 'general',        -- 分类标签
    sort_order INTEGER DEFAULT 0,           -- 排序权重
    enabled INTEGER DEFAULT 1,              -- 是否启用
    article_count INTEGER DEFAULT 50,       -- 每次抓取文章数量
    last_fetch_at INTEGER DEFAULT 0,        -- 最后抓取时间
    created_at INTEGER NOT NULL,            -- 添加时间
    updated_at INTEGER NOT NULL             -- 更新时间
);

CREATE INDEX IF NOT EXISTS idx_featured_mps_enabled 
    ON featured_wechat_mps(enabled, sort_order);
CREATE INDEX IF NOT EXISTS idx_featured_mps_category 
    ON featured_wechat_mps(category, enabled);
```

#### 2.2 复用现有表

文章数据存储在现有的 `wechat_mp_articles` 表中，无需修改。

### 3. 前端组件

#### 3.1 Admin 页面结构

```html
<!-- Admin 公众号订阅页签 -->
<div class="admin-tab" id="featured-mps-tab">
    <!-- 操作按钮区 -->
    <div class="action-bar">
        <button id="btn-batch-import">📥 批量导入</button>
        <button id="btn-single-add">➕ 单个添加</button>
        <button id="btn-download-template">📄 下载模板</button>
        <button id="btn-export">📤 导出列表</button>
    </div>
    
    <!-- 筛选区 -->
    <div class="filter-bar">
        <select id="filter-category">
            <option value="">全部分类</option>
        </select>
        <select id="filter-status">
            <option value="">全部状态</option>
            <option value="enabled">已启用</option>
            <option value="disabled">已禁用</option>
        </select>
        <span class="count">共 <span id="total-count">0</span> 个精选公众号</span>
    </div>
    
    <!-- 列表区 -->
    <div class="featured-mp-list" id="featured-mp-list">
        <!-- 动态渲染 -->
    </div>
</div>

<!-- 批量导入弹窗 -->
<div class="modal" id="batch-import-modal">
    <!-- 步骤1：上传/粘贴 -->
    <!-- 步骤2：预览结果 -->
    <!-- 步骤3：确认导入 -->
</div>

<!-- 单个添加弹窗 -->
<div class="modal" id="single-add-modal">
    <!-- 搜索框 -->
    <!-- 搜索结果列表 -->
</div>

<!-- 编辑弹窗 -->
<div class="modal" id="edit-modal">
    <!-- 编辑表单 -->
</div>
```

#### 3.2 首页栏目集成

在 `news_viewer.py` 的 `PLATFORM_CATEGORIES` 中动态添加精选公众号栏目：

```python
def _load_featured_mps_category(conn):
    """加载精选公众号栏目数据"""
    # 获取启用的精选公众号
    cur = conn.execute("""
        SELECT fakeid, nickname, round_head_img, signature
        FROM featured_wechat_mps
        WHERE enabled = 1
        ORDER BY sort_order ASC
    """)
    mps = cur.fetchall()
    
    platforms = {}
    for mp in mps:
        fakeid, nickname, avatar, signature = mp
        
        # 获取该公众号最新文章
        art_cur = conn.execute("""
            SELECT title, url, publish_time, digest
            FROM wechat_mp_articles
            WHERE fakeid = ?
            ORDER BY publish_time DESC
            LIMIT 50
        """, (fakeid,))
        articles = art_cur.fetchall()
        
        # 构建平台数据
        platform_id = f"wechat-{fakeid[:8]}"
        platforms[platform_id] = {
            "name": nickname,
            "icon": avatar or "📱",
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
    
    return {
        "id": "featured-mps",
        "name": "精选公众号",
        "icon": "📱",
        "platforms": platforms
    }
```

### 4. 接口定义

#### 4.1 批量导入预览请求/响应

```typescript
// 请求
interface ImportPreviewRequest {
    csv_text?: string;      // CSV 文本内容
    file?: File;            // 或上传文件
}

// 响应
interface ImportPreviewResponse {
    ok: boolean;
    preview_id: string;     // 预览会话ID，10分钟有效
    total: number;          // 总行数
    valid: number;          // 有效行数
    invalid: number;        // 无效行数
    items: PreviewItem[];
}

interface PreviewItem {
    line: number;           // 行号
    input_name: string;     // 输入的公众号名称
    input_category: string; // 输入的分类
    status: 'found' | 'not_found' | 'duplicate' | 'exists' | 'error';
    matched?: {             // 匹配到的公众号信息
        fakeid: string;
        nickname: string;
        round_head_img: string;
        signature: string;
    };
    error?: string;         // 错误信息
}
```

#### 4.2 精选公众号列表响应

```typescript
interface FeaturedMPListResponse {
    ok: boolean;
    list: FeaturedMP[];
    total: number;
}

interface FeaturedMP {
    id: number;
    fakeid: string;
    nickname: string;
    round_head_img: string;
    signature: string;
    category: string;
    sort_order: number;
    enabled: number;
    article_count: number;
    last_fetch_at: number;
    created_at: number;
    updated_at: number;
}
```

#### 4.3 前端栏目数据响应

```typescript
interface FeaturedMPsCategoryResponse {
    ok: boolean;
    mps: MPWithArticles[];
}

interface MPWithArticles {
    fakeid: string;
    nickname: string;
    round_head_img: string;
    signature: string;
    category: string;
    articles: Article[];
}

interface Article {
    id: number;
    title: string;
    url: string;
    digest: string;
    cover_url: string;
    publish_time: number;
}
```

## Data Models

### 数据库模型

```python
# featured_wechat_mps 表字段
class FeaturedMP:
    id: int                    # 自增主键
    fakeid: str                # 公众号唯一标识（UNIQUE）
    nickname: str              # 公众号名称
    round_head_img: str        # 头像 URL
    signature: str             # 公众号简介
    category: str              # 分类：tech/finance/news/lifestyle/general
    sort_order: int            # 排序权重（越小越靠前）
    enabled: int               # 启用状态：0=禁用，1=启用
    article_count: int         # 每次抓取文章数量，默认50
    last_fetch_at: int         # 最后抓取时间戳
    created_at: int            # 创建时间戳
    updated_at: int            # 更新时间戳
```

### 前端状态模型

```javascript
// Admin 页面状态
const featuredMPState = {
    list: [],                  // 精选公众号列表
    filters: {
        category: '',          // 分类筛选
        status: '',            // 状态筛选
    },
    loading: false,
    
    // 批量导入状态
    import: {
        step: 1,               // 当前步骤：1=上传，2=预览，3=完成
        previewId: null,
        items: [],
        selected: new Set(),
    },
    
    // 搜索状态
    search: {
        query: '',
        results: [],
        loading: false,
    },
};
```

## Error Handling

### API 错误处理

| 错误场景 | 错误码 | 处理策略 |
|---------|--------|---------|
| 共享凭证不可用 | 503 | 提示管理员配置凭证 |
| 公众号已存在 | 409 | 显示"该公众号已在列表中" |
| 搜索无结果 | 404 | 显示"未找到相关公众号" |
| 批量导入超时 | 408 | 支持断点续传，已匹配的不丢失 |
| 微信 API 限流 | 429 | 显示"请稍后再试"，自动延迟重试 |
| 公众号被封禁 | - | 自动禁用，通知管理员 |

### 频率限制控制

微信公众号后台有请求频率限制，需要严格控制：

| 接口 | 间隔要求 | 说明 |
|------|----------|------|
| 搜索接口 | ≥ 3 秒 | 批量导入时逐个搜索 |
| 文章列表 | ≥ 2 秒 | 抓取文章时 |

**批量导入耗时估算：** 50 个公众号约需 2.5 分钟（每个 3 秒间隔）

### 批量导入断点续传

```python
# 预览结果存储在 Redis/内存缓存中，10分钟有效
preview_cache = {
    "prev_abc123": {
        "items": [...],           # 已匹配的结果
        "last_processed": 45,     # 最后处理的行号
        "created_at": timestamp,
        "expires_at": timestamp + 600
    }
}

# 如果导入中断，可以从 last_processed 继续
```

### 批量导入错误处理

```python
def handle_import_error(line: int, name: str, error: Exception) -> PreviewItem:
    """处理单行导入错误"""
    if isinstance(error, MPNotFoundException):
        return PreviewItem(line=line, input_name=name, status='not_found', 
                          error='未找到匹配的公众号')
    elif isinstance(error, MPAlreadyExistsError):
        return PreviewItem(line=line, input_name=name, status='exists',
                          error='已在精选列表中')
    elif isinstance(error, RateLimitError):
        return PreviewItem(line=line, input_name=name, status='error',
                          error='请求过于频繁，请稍后重试')
    else:
        return PreviewItem(line=line, input_name=name, status='error',
                          error=str(error))
```

## Caching Strategy

| 数据 | 缓存时间 | 失效条件 |
|------|----------|----------|
| 精选公众号列表 | 5 分钟 | Admin 修改后自动失效 |
| 公众号文章 | 30 分钟 | 抓取任务更新后失效 |
| 搜索结果 | 不缓存 | 实时搜索 |
| 批量导入预览 | 10 分钟 | preview_id 有效期 |

### 缓存失效机制

```python
# 在 Admin API 修改操作后，清除相关缓存
def invalidate_featured_mps_cache():
    """清除精选公众号相关缓存"""
    cache.delete("featured_mps_list")
    cache.delete("featured_mps_category")
```

## Data Maintenance

### 公众号信息同步

公众号可能改名或更新简介，需要定期同步：

```python
async def sync_featured_mp_info():
    """
    定期同步精选公众号信息
    执行频率：每天一次
    """
    # 1. 获取所有精选公众号
    # 2. 调用微信 API 获取最新信息
    # 3. 更新 nickname、round_head_img、signature
    # 4. 记录变更日志
```

### 文章 URL 有效性检测

微信文章可能被删除或举报，需要定期检测：

```python
async def check_article_validity():
    """
    定期检测文章 URL 有效性
    执行频率：每天一次
    """
    # 1. 抽样检测最近文章的 URL
    # 2. 失效文章标记 is_valid = 0
    # 3. 前端查询时过滤失效文章
```

### 公众号活跃度检测

检测公众号是否停更：

```python
async def check_mp_activity():
    """
    检测公众号更新频率
    执行频率：每周一次
    """
    # 1. 统计每个公众号最近30天的文章数
    # 2. 如果为0，标记为"疑似停更"
    # 3. 在 Admin 列表中显示警告标识
```

## Testing Strategy

### 单元测试

1. **CSV 解析**: 验证各种格式的 CSV 正确解析
2. **数据库操作**: 验证 CRUD 操作正确性
3. **去重逻辑**: 验证 fakeid 唯一性约束

### 集成测试

1. 完整的批量导入流程
2. 单个添加 → 编辑 → 删除流程
3. 前端栏目数据加载
4. 与现有抓取机制的集成

## File Structure

### 需要新建的文件

```
hotnews/hotnews/kernel/admin/featured_mp_admin.py      # Admin API
hotnews/hotnews/kernel/templates/admin_featured_mps.html  # Admin 页面
hotnews/hotnews/kernel/static/js/admin_featured_mps.js    # Admin JS
```

### 需要修改的文件

```
hotnews/hotnews/web/db_online.py          # 添加数据库表
hotnews/hotnews/web/news_viewer.py        # 添加栏目配置
hotnews/hotnews/kernel/admin/__init__.py  # 注册路由
```

### 参考文件

```
hotnews/hotnews/kernel/admin/wechat_admin.py   # 微信相关 API 参考
hotnews/hotnews/kernel/admin/rss_admin.py      # Admin 页面结构参考
hotnews/hotnews/kernel/templates/admin_rss_sources.html  # 页面模板参考
```
