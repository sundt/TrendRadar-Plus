# 用户文章发布到精选博客 - 详细设计方案

> 简化版：只发布到精选博客，去掉多平台发布功能

## 1. 需求概述

### 1.1 用户发布流程
```
用户在编辑器写文章 → 点击「发布」→ 确认弹窗确认后：
  1. 草稿状态改为 published
  2. 同步到 rss_entries 表（source_id = user_articles）
  3. 文章出现在精选博客列表
  4. 跳转到文章详情页 /article/{id}
```

### 1.2 数据存储
| 数据库 | 表 | 用途 |
|--------|-----|------|
| 主数据库 | user_articles | 存储文章完整内容（草稿+已发布） |
| 主数据库 | rss_entries | 存储标题、URL、发布时间（用于列表展示） |
| 主数据库 | rss_sources | 每用户一个源 user_{user_id}，category = explore |

**架构变更**：将 drafts 表从用户数据库迁移到主数据库，统一为 `user_articles` 表。
- 优点：单库操作，事务一致性有保障，无数据冗余
- 原 user.db 中的 drafts 表废弃（测试数据可忽略）

### 1.3 管理后台
- 新增「用户文章」管理页面
- 功能：查看列表、下架/删除

### 1.4 简化说明
- ❌ 去掉多平台发布（知乎、掘金、CSDN、微信等）
- ❌ 去掉插件通信和平台适配器
- ❌ 去掉发布历史页面
- ❌ 去掉「一键转入草稿」功能（新闻列表、收藏列表、插件侧边栏）
- ✅ 只保留发布到精选博客功能
- ✅ 用户手动在编辑器创建文章

---

## 2. 数据库设计

### 2.1 架构决策：每用户独立源 ✅

每个用户作为独立的内容创作者，拥有自己的 RSS 源：

```
rss_sources: user_{user_id} (每个用户一个源)
rss_entries: source_id = 'user_123', 自然关联到作者
```

**选择理由**：
1. 符合 RSS 架构语义（一个作者 = 一个内容源）
2. 支持未来功能：作者主页、关注作者、作者 RSS Feed
3. 与现有查询逻辑完全兼容
4. 按作者查询时直接用 source_id，无需额外 JOIN

### 2.2 rss_sources 表 - 用户源

用户首次发布时动态创建源记录：

```sql
-- 在 publish API 中执行
INSERT OR IGNORE INTO rss_sources (
    id, name, url, host, category, cadence, source_type, enabled, created_at, updated_at
) VALUES (
    'user_123',                -- id: user_{user_id}
    '张三的博客',               -- name: 用户昵称 + "的博客"
    'internal://user/123',     -- url: 内部标识
    'hotnews.local',           -- host: 内部域名
    'explore',                 -- category: 归属精选博客栏目
    'P0',                      -- cadence: 最高优先级（用户文章优先展示）
    'user',                    -- source_type: 标识为用户源
    1,                         -- enabled: 启用
    strftime('%s', 'now'),     -- created_at
    strftime('%s', 'now')      -- updated_at
);
```

**注意**：需要为 rss_sources 表添加 `source_type` 字段，用于区分 RSS 源和用户源。

### 2.3 user_articles 表（新建，替代原 drafts 表）

统一存储用户文章（草稿和已发布），位于主数据库 `online.db`：

```sql
CREATE TABLE IF NOT EXISTS user_articles (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    source_id TEXT NOT NULL,           -- user_{user_id}，关联 rss_sources
    title TEXT NOT NULL DEFAULT '',
    digest TEXT DEFAULT '',
    cover_url TEXT DEFAULT '',
    html_content TEXT NOT NULL DEFAULT '',
    markdown_content TEXT DEFAULT '',
    
    -- 导入来源
    import_type TEXT DEFAULT 'manual', -- manual/news/collection/url
    import_source_id TEXT DEFAULT '',
    import_source_url TEXT DEFAULT '',
    
    -- 状态
    status TEXT DEFAULT 'draft',       -- draft/published
    version INTEGER DEFAULT 1,
    
    -- 统计
    view_count INTEGER DEFAULT 0,
    
    -- 时间
    published_at INTEGER,              -- 发布时间
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_articles_user_id ON user_articles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_articles_source_id ON user_articles(source_id);
CREATE INDEX IF NOT EXISTS idx_user_articles_status ON user_articles(status);
CREATE INDEX IF NOT EXISTS idx_user_articles_updated_at ON user_articles(updated_at DESC);
```

### 2.4 rss_entries 表 - 用户文章记录

用户发布文章时，插入一条记录：

```sql
INSERT INTO rss_entries (
    source_id,      -- 'user_{user_id}'（用户源ID）
    dedup_key,      -- draft_id（草稿ID，用于去重和关联）
    url,            -- '/article/{draft_id}'（文章详情页URL）
    title,          -- 文章标题
    published_at,   -- 发布时间戳
    published_raw,  -- 发布时间字符串
    fetched_at,     -- 同 published_at
    created_at,     -- 同 published_at
    description,    -- 文章摘要（digest）
    cover_url,      -- 封面图URL
    source_type     -- 'user'（区分用户文章）
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user');
```

### 2.5 rss_sources 表 - 新增字段

```sql
-- 添加 source_type 字段，区分 RSS 源和用户源
ALTER TABLE rss_sources ADD COLUMN source_type TEXT DEFAULT 'rss';
```

**source_type 取值**：
- `rss`: 普通 RSS 订阅源
- `user`: 用户创作源
- `mp`: 微信公众号源（已有）

---

## 3. API 设计

### 3.1 发布 API（已有，需修改）

**端点**: `POST /api/publisher/drafts/{draft_id}/publish`

**修改内容**:
1. 更新草稿状态为 `published`
2. 同步到 rss_entries 表
3. 返回文章详情页 URL

**请求**: 无需额外参数

**响应**:
```json
{
  "ok": true,
  "data": {
    "draft": { ... },
    "article_url": "/article/{draft_id}",
    "rss_entry_id": 12345
  }
}
```

### 3.2 文章详情 API（新增）

**端点**: `GET /api/publisher/article/{draft_id}`

**响应**:
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "title": "文章标题",
    "digest": "文章摘要",
    "cover_url": "封面URL",
    "html_content": "<p>文章内容...</p>",
    "author": {
      "id": 123,
      "nickname": "作者昵称",
      "avatar": "头像URL"
    },
    "published_at": 1706918400,
    "view_count": 100
  }
}
```

### 3.3 下架 API（新增）

**端点**: `POST /api/publisher/drafts/{draft_id}/unpublish`

**功能**:
1. 更新草稿状态为 `draft`
2. 从 rss_entries 表删除记录

**响应**:
```json
{
  "ok": true,
  "message": "文章已下架"
}
```

### 3.4 管理后台 API（新增）

**端点**: `GET /api/admin/user-articles`

**查询参数**:
- `page`: 页码
- `page_size`: 每页数量
- `status`: 状态筛选（published/draft）
- `user_id`: 用户筛选

**响应**:
```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "title": "文章标题",
        "author_name": "作者昵称",
        "status": "published",
        "published_at": 1706918400
      }
    ],
    "total": 50,
    "page": 1,
    "page_size": 20
  }
}
```

**端点**: `POST /api/admin/user-articles/{draft_id}/unpublish`

**功能**: 管理员下架文章

---

## 4. 前端页面设计

### 4.1 文章详情页 `/article/{id}`

**路由**: `/article/{draft_id}`

**页面结构**:
```html
<article class="user-article">
  <header>
    <h1>{{ title }}</h1>
    <div class="meta">
      <img src="{{ author.avatar }}" class="avatar" />
      <span class="author">{{ author.nickname }}</span>
      <span class="date">{{ published_at | formatDate }}</span>
      <span class="views">{{ view_count }} 阅读</span>
    </div>
    <img src="{{ cover_url }}" class="cover" />
  </header>
  
  <div class="content">
    {{ html_content | safe }}
  </div>
  
  <footer>
    <div class="actions">
      <button class="share">分享</button>
      <button class="favorite">收藏</button>
    </div>
  </footer>
</article>
```

**样式要点**:
- 响应式布局，适配移动端
- 文章内容样式与编辑器预览一致
- 代码块高亮
- 图片懒加载

### 4.2 精选博客列表集成

**修改文件**: `hotnews/hotnews/web/static/js/src/viewer.js`

**展示逻辑**:
1. 用户文章与其他 RSS 文章混合展示
2. 按 `published_at` 降序排列
3. 用户文章显示「原创」标签

**列表项样式**:
```html
<div class="news-item user-article">
  <span class="badge original">原创</span>
  <a href="/article/{{ id }}">{{ title }}</a>
  <span class="meta">{{ author }} · {{ time }}</span>
</div>
```

### 4.3 发布确认弹窗

**修改文件**: `hotnews/src/write/index.html`

**弹窗内容**:
```html
<div class="publish-confirm-modal">
  <h3>发布到精选博客</h3>
  <p>发布后，文章将出现在精选博客列表，所有用户可见。</p>
  
  <div class="preview">
    <img src="{{ cover_url }}" class="cover-preview" />
    <div class="info">
      <h4>{{ title }}</h4>
      <p>{{ digest }}</p>
    </div>
  </div>
  
  <div class="actions">
    <button class="cancel">取消</button>
    <button class="confirm">确认发布</button>
  </div>
</div>
```

---

## 5. 实现任务清单

### Phase 1: 后端基础（预计 2h）✅ 已完成

- [x] **P1-01**: 数据库迁移
  - 文件: `hotnews/hotnews/web/db_online.py`
  - 新建 `user_articles` 表
  - 新建 `temp_images` 表
  - 为 `rss_sources` 表添加 `source_type` 字段
  - 添加相关索引

- [x] **P1-02**: 重构草稿 API 使用新表
  - 文件: `hotnews/hotnews/web/api/publisher/db.py`
  - 修改 CRUD 操作使用 `online.db.user_articles`
  - 添加 `ensure_user_source()` 函数

- [x] **P1-03**: 修改发布 API
  - 文件: `hotnews/hotnews/web/api/publisher/drafts.py`
  - 发布时同步到 rss_entries
  - 单库事务，保证一致性

- [x] **P1-04**: 新增下架 API
  - 文件: `hotnews/hotnews/web/api/publisher/drafts.py`
  - 实现 unpublish 端点

- [x] **P1-05**: 新增文章详情 API
  - 文件: `hotnews/hotnews/web/api/publisher/article.py`（新建）
  - 实现公开访问的文章详情接口

- [x] **P1-06**: 更新文章详情页路由
  - 文件: `hotnews/hotnews/web/server.py`
  - 使用新的数据库函数

### Phase 2: 前端页面（预计 2h）✅ 已完成

- [x] **P2-01**: 创建文章详情页
  - 文件: `hotnews/hotnews/web/server.py`（内联渲染）
  - 已实现响应式布局、代码高亮、图片展示

- [x] **P2-02**: 添加文章详情页路由
  - 文件: `hotnews/hotnews/web/server.py`
  - 已添加 `/article/{id}` 路由

- [x] **P2-03**: 简化发布弹窗
  - 文件: `hotnews/src/write/index.html`
  - 文件: `hotnews/src/write/editor.js`
  - 已简化为确认弹窗，去掉平台选择

- [ ] **P2-04**: 精选博客列表集成
  - 用户文章显示「原创」标签（待实现）

### Phase 3: 清理代码（预计 2h）

- [x] **P3-01**: 清理编辑器中的多平台发布代码
  - 文件: `hotnews/src/write/editor.js`
  - 去掉平台选择、登录检测、插件通信、发布结果展示等
  - 简化 `confirmPublish` 方法
  - 已删除: `showPublishResults`, `renderResultItem`, `hideResultModal`, `retrySinglePlatform`, `retryFailedPublish`, `updateResultSummary`

- [x] **P3-02**: 清理编辑器 HTML
  - 文件: `hotnews/src/write/index.html`
  - 删除「发布历史」按钮
  - 删除发布结果弹窗（result-modal）

- [x] **P3-03**: 清理「一键转草稿」功能
  - 文件: `hotnews/hotnews/web/templates/viewer.html`
    - 删除 `.news-draft-btn` 按钮
    - 删除 `handleToDraftClick` 函数
    - 删除 `checkPublisherMemberStatus` 函数
    - 删除 `window._publisherUserInfo` 相关代码
  - 文件: `hotnews/hotnews/web/static/js/src/favorites.js`
    - 删除 `.favorite-draft-btn` 按钮
    - 删除 `handleToDraftClick` 函数

- [x] **P3-04**: 清理插件代码
  - 文件: `hotnews-summarizer/sidepanel.js` - 删除转草稿按钮和 `handleToDraft` 函数
  - 文件: `hotnews-summarizer/background.js` - 删除右键菜单相关代码
  - 目录: `hotnews-summarizer/background/publish/` - 可选删除整个目录（保留，可能有其他用途）

- [x] **P3-05**: 删除发布历史相关文件
  - 删除 `src/write/history.js`
  - 删除 `src/write/history.html`
  - 删除 `src/write/history.css`

### Phase 4: 管理后台（预计 1h）

- [x] **P4-01**: 用户文章管理 API
  - 文件: `hotnews/hotnews/web/api/publisher/admin.py`（新建）
  - 实现: 列表、详情、下架、删除、统计 API

- [x] **P4-02**: 用户文章管理页面
  - 文件: `hotnews/hotnews/kernel/templates/admin_user_articles.html`（新建）
  - 访问路径: `/admin/user-articles`

### Phase 5: 测试和构建（预计 1h）✅ 已完成

- [x] **P5-01**: 发布流程测试
  - 文件: `hotnews/tests/publisher/test_publish_to_explore.py`（新建）
  - 12 个测试全部通过

- [x] **P5-02**: 重新构建前端
  - 已运行 `npm run build:write`
  - 已更新 `vite.config.write.js` 移除 history.html 入口
  - 已删除 `/publish-history` 路由

- [x] **P5-03**: 删除或更新现有测试
  - 删除 `test_history_api.py`（发布历史测试）
  - 更新其他受影响的测试

---

## 6. 技术细节

### 6.1 数据同步策略

**发布时**:
```python
def ensure_user_source(online_conn, user):
    """确保用户源存在，不存在则创建"""
    source_id = f"user_{user['id']}"
    now = int(time.time())
    
    # 检查源是否存在
    existing = online_conn.execute(
        "SELECT id FROM rss_sources WHERE id = ?", (source_id,)
    ).fetchone()
    
    if not existing:
        # 创建用户源
        online_conn.execute("""
            INSERT INTO rss_sources (
                id, name, url, host, category, cadence, source_type, enabled, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            source_id,
            f"{user['nickname']}的博客",
            f"internal://user/{user['id']}",
            'hotnews.local',
            'explore',
            'P0',
            'user',
            1,
            now,
            now
        ))
    
    return source_id


def publish_to_explore(conn, online_conn, draft, user):
    """发布文章到精选博客"""
    now = int(time.time())
    
    # 1. 确保用户源存在
    source_id = ensure_user_source(online_conn, user)
    
    # 2. 更新草稿状态
    update_draft(conn, draft['id'], user['id'], status='published')
    
    # 3. 插入 rss_entries
    online_conn.execute("""
        INSERT OR REPLACE INTO rss_entries (
            source_id, dedup_key, url, title, 
            published_at, published_raw, fetched_at, created_at,
            description, cover_url, source_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user')
    """, (
        source_id,
        draft['id'],
        f"/article/{draft['id']}",
        draft['title'],
        now,
        datetime.fromtimestamp(now).strftime('%Y-%m-%d %H:%M:%S'),
        now,
        now,
        draft['digest'],
        draft['cover_url'],
    ))
    
    # 4. 记录 rss_entry_id
    entry_id = online_conn.execute(
        "SELECT id FROM rss_entries WHERE source_id = ? AND dedup_key = ?",
        (source_id, draft['id'])
    ).fetchone()[0]
    
    conn.execute(
        "UPDATE drafts SET rss_entry_id = ? WHERE id = ?",
        (entry_id, draft['id'])
    )
    
    return entry_id
```

**下架时**:
```python
def unpublish_from_explore(conn, online_conn, draft_id, user_id):
    """从精选博客下架文章"""
    source_id = f"user_{user_id}"
    
    # 1. 验证权限
    draft = get_draft(conn, draft_id)
    if draft['user_id'] != user_id:
        raise PermissionError("无权操作此文章")
    
    # 2. 更新草稿状态
    update_draft(conn, draft_id, user_id, status='draft')
    
    # 3. 删除 rss_entries 记录
    online_conn.execute(
        "DELETE FROM rss_entries WHERE source_id = ? AND dedup_key = ?",
        (source_id, draft_id)
    )
    
    # 4. 清除 rss_entry_id
    conn.execute(
        "UPDATE drafts SET rss_entry_id = NULL WHERE id = ?",
        (draft_id,)
    )
```

### 6.2 文章详情页渲染

**服务端渲染（SEO 友好）**:
```python
@app.get("/article/{draft_id}")
async def article_page(request: Request, draft_id: str):
    # 从用户数据库获取文章内容
    draft = get_published_draft(draft_id)
    if not draft:
        raise HTTPException(404, "文章不存在")
    
    # 获取作者信息
    author = get_user_info(draft['user_id'])
    
    # 增加阅读计数
    increment_view_count(draft_id)
    
    return templates.TemplateResponse("article.html", {
        "request": request,
        "article": draft,
        "author": author,
    })
```

### 6.3 精选博客列表查询

**修改 viewer_service.get_categorized_news()**:
```python
def get_explore_news(self, limit=50):
    """获取精选博客文章（包含用户原创）"""
    # 查询 explore 分类下的所有源（包括用户源）
    sources = self.conn.execute("""
        SELECT id, source_type FROM rss_sources 
        WHERE category = 'explore' AND enabled = 1
    """).fetchall()
    
    source_ids = [s[0] for s in sources]
    
    # 查询文章
    entries = self.conn.execute("""
        SELECT e.*, s.name as source_name, s.source_type as src_type
        FROM rss_entries e
        JOIN rss_sources s ON e.source_id = s.id
        WHERE e.source_id IN ({})
        ORDER BY e.published_at DESC
        LIMIT ?
    """.format(','.join(['?'] * len(source_ids))), 
    source_ids + [limit]).fetchall()
    
    # 标记用户原创（source_type = 'user' 或 source_id 以 'user_' 开头）
    for entry in entries:
        entry['is_original'] = entry['source_type'] == 'user' or entry['src_type'] == 'user'
    
    return entries
```

**按作者查询文章**（未来功能）:
```python
def get_user_articles(self, user_id, limit=20):
    """获取指定用户的所有文章"""
    source_id = f"user_{user_id}"
    
    entries = self.conn.execute("""
        SELECT e.*, s.name as author_name
        FROM rss_entries e
        JOIN rss_sources s ON e.source_id = s.id
        WHERE e.source_id = ?
        ORDER BY e.published_at DESC
        LIMIT ?
    """, (source_id, limit)).fetchall()
    
    return entries
```

---

## 7. 安全考虑

### 7.1 内容审核
- 发布前检查敏感词
- 管理员可下架违规内容
- 记录操作日志

### 7.2 权限控制
- 只有会员可发布
- 只能编辑/下架自己的文章
- 管理员可操作所有文章

### 7.3 防刷机制
- 发布频率限制（每天最多 10 篇）
- 内容长度限制（最少 100 字）

---

## 8. 边界情况和异常处理

### 8.1 发布前校验
| 校验项 | 规则 | 错误提示 |
|--------|------|----------|
| 标题 | 必填，1-100 字 | "请输入标题" / "标题不能超过100字" |
| 内容 | 必填，最少 100 字 | "内容太短，至少需要100字" |
| 封面 | 可选 | - |
| 摘要 | 可选，自动截取前 200 字 | - |

### 8.2 重复发布处理
- 已发布的文章再次点击发布：提示"文章已发布"，显示"查看文章"按钮
- 使用 `INSERT OR REPLACE` 避免重复记录

### 8.3 下架后重新发布
- 下架后草稿状态变为 `draft`
- 可以编辑后重新发布
- 重新发布时生成新的 `published_at` 时间

### 8.4 用户昵称变更
- 用户修改昵称后，`rss_sources.name` 需要同步更新
- 方案：在发布时检查并更新源名称

### 8.5 用户注销/封禁
- 用户注销：保留文章但标记为"已注销用户"
- 用户封禁：管理员可批量下架该用户所有文章

### 8.6 数据库事务
- 发布操作涉及两个数据库（用户库 + 主库）
- 需要保证原子性：先写主库，成功后再更新用户库
- 失败时回滚，避免数据不一致

### 8.7 图片处理
- 文章中的图片已上传到服务器（`/api/publisher/upload/image`）
- 发布时无需额外处理图片
- 图片 URL 格式：`/api/publisher/image/{image_id}`

---

## 9. 后续优化

### 9.1 短期
- 文章阅读统计
- 分享功能
- 评论功能

### 9.2 中期（方案 B 支持的功能）
- **作者主页** `/author/{user_id}` - 展示用户所有文章
- **关注作者** - 订阅用户的 RSS 源
- **作者 RSS Feed** `/feed/user/{user_id}.xml` - 生成用户文章的 RSS

### 9.3 长期
- 文章推荐算法
- 作者排行榜
- 打赏功能

---

## 10. 时间估算

| 阶段 | 任务 | 预计时间 |
|------|------|----------|
| Phase 1 | 后端基础 | 1.5h |
| Phase 2 | 前端页面 | 2h |
| Phase 3 | 清理代码 | 2h |
| Phase 4 | 管理后台 | 1h |
| Phase 5 | 测试和构建 | 1h |
| **总计** | | **7.5h** |

---

## 11. 验收标准

1. ✅ 用户可在编辑器发布文章到精选博客
2. ✅ 发布后文章出现在精选博客列表
3. ✅ 点击文章可跳转到详情页
4. ✅ 用户可下架自己的文章
5. ✅ 管理员可管理所有用户文章
6. ✅ 多平台发布和一键转草稿代码已清理
7. ✅ 测试通过

---

## 12. 需要清理的文件（多平台发布相关）

### hotnews-summarizer 插件
- `background/publish/` - 整个发布模块（adapters、manager.js、login-checker.js 等）
- `content/publish-bridge.js` - 通信桥
- `tests/publish-manager.test.js` - 发布测试
- `sidepanel.js` - 「转为草稿」按钮和 `handleToDraft` 函数
- `background.js` - 右键菜单「发送到编辑器」相关代码

### hotnews 后端
- `hotnews/web/api/publisher/user.py` - 会员状态检查 API（可选保留）
- `src/write/history.js/html/css` - 发布历史页（删除）

### hotnews 前端 - 一键转草稿相关
- `hotnews/web/templates/viewer.html`:
  - 删除 `.news-draft-btn` 按钮
  - 删除 `handleToDraftClick` 函数
  - 删除 `checkPublisherMemberStatus` 函数
  - 删除 `window._publisherUserInfo` 相关代码
- `hotnews/web/static/js/src/favorites.js`:
  - 删除 `.favorite-draft-btn` 按钮
  - 删除 `handleToDraftClick` 函数
- `hotnews/web/static/css/features/favorites.css` - 转草稿按钮样式
- `hotnews/web/static/css/components/news-item.css` - 转草稿按钮样式

### hotnews 编辑器 - 多平台发布相关
- `src/write/index.html`:
  - 删除「发布历史」按钮
  - 删除发布结果弹窗（result-modal）
  - 简化发布确认弹窗（去掉平台选择）
- `src/write/editor.js`:
  - 删除 `showPublishResults`、`renderResultItem`、`hideResultModal` 方法
  - 删除 `retrySinglePlatform`、`retryFailedPublish`、`updateResultSummary` 方法
  - 删除 `loadFromContextMenu` 方法
  - 删除 `lastPublishResults`、`lastArticleData` 属性
  - 删除插件通信相关代码（postMessage）
  - 简化 `confirmPublish` 方法（只调用后端 API）

### 需要重新构建的文件
- `hotnews/web/static/js/chunk-*.js` - 前端构建产物（需要重新 build）

### 文档
- `docs/proposals/multi-platform-publisher-spec.md`
- `docs/proposals/platform-analysis.md`
- `docs/proposals/wechatsync-integration-proposal.md`
- `docs/guides/publisher-user-guide.md` - 需要更新（去掉多平台发布说明）

---

## 13. 保留的功能

### 编辑器核心功能（保留）
- Tiptap 富文本编辑器
- 图片上传（粘贴/拖拽/选择）
- 封面裁剪
- 文档导入（Markdown/PDF/Word）
- AI 润色（改写/扩写/缩写/翻译）
- 草稿自动保存
- 草稿列表页
- TOC 目录导航
- Slash Commands
- 代码高亮

### API（保留）
- `/api/publisher/drafts` - 草稿 CRUD
- `/api/publisher/upload/image` - 图片上传
- `/api/publisher/import/document` - 文档导入
- `/api/publisher/import/url` - URL 导入（可选保留）
- `/api/publisher/ai/polish` - AI 润色

### API（删除）
- `/api/publisher/user/me` - 会员状态检查（可选删除）
- `/api/publisher/history` - 发布历史（删除）

---

## 14. 风险和注意事项

### 数据库操作
- 发布时需要同时操作两个数据库（用户库 + 主库）
- 需要考虑事务一致性，失败时回滚

### 前端构建
- 修改 `src/write/` 后需要重新运行 `npm run build:write`
- 修改 `hotnews/web/static/js/src/` 后需要重新构建

### 测试
- 现有测试可能需要更新（删除多平台发布相关测试）
- 新增发布到精选博客的测试

### 插件
- 插件代码修改后需要重新加载扩展
- 考虑是否需要发布新版本到 Chrome Web Store
