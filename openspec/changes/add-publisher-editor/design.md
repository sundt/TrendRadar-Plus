# Design: 用户文章发布系统

> 简化版：只发布到精选博客，去掉多平台发布功能

## 1. 架构概述

```
用户在编辑器写文章 → 点击「发布」→ 确认后：
  1. 草稿状态改为 published
  2. 同步到 rss_entries 表（source_id = user_{user_id}）
  3. 文章出现在精选博客列表
  4. 跳转到文章详情页 /article/{id}
```

## 2. 数据库设计

### 2.1 user_articles 表（主数据库 online.db）

```sql
CREATE TABLE IF NOT EXISTS user_articles (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    source_id TEXT NOT NULL,           -- user_{user_id}
    title TEXT NOT NULL DEFAULT '',
    digest TEXT DEFAULT '',
    cover_url TEXT DEFAULT '',
    html_content TEXT NOT NULL DEFAULT '',
    markdown_content TEXT DEFAULT '',
    import_type TEXT DEFAULT 'manual',
    import_source_id TEXT DEFAULT '',
    import_source_url TEXT DEFAULT '',
    status TEXT DEFAULT 'draft',       -- draft/published
    version INTEGER DEFAULT 1,
    view_count INTEGER DEFAULT 0,
    published_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
```

### 2.2 rss_sources 用户源

每个用户作为独立 RSS 源：
- `id`: `user_{user_id}`
- `category`: `explore`
- `source_type`: `user`

## 3. API 设计

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/publisher/drafts` | GET/POST | 草稿列表/创建 |
| `/api/publisher/drafts/{id}` | GET/PUT/DELETE | 草稿 CRUD |
| `/api/publisher/drafts/{id}/publish` | POST | 发布到精选博客 |
| `/api/publisher/drafts/{id}/unpublish` | POST | 下架文章 |
| `/api/publisher/article/{id}` | GET | 文章详情（公开） |
| `/api/publisher/upload/image` | POST | 图片上传 |
| `/api/publisher/import/document` | POST | 文档导入 |
| `/api/publisher/ai/polish` | POST | AI 润色 |
| `/api/admin/user-articles` | GET | 管理后台列表 |

## 4. 前端页面

| 路由 | 说明 |
|------|------|
| `/write` | 编辑器页面 |
| `/write/{id}` | 编辑已有草稿 |
| `/drafts` | 草稿列表 |
| `/article/{id}` | 文章详情页 |
| `/admin/user-articles` | 管理后台 |

## 5. 编辑器功能

- Tiptap 富文本编辑器
- 图片上传（粘贴/拖拽/选择）
- 封面裁剪（Cropper.js，2.35:1）
- 文档导入（Markdown/PDF/Word）
- AI 润色（改写/扩写/缩写/翻译）
- 草稿自动保存（30秒）
- TOC 目录导航
- Slash Commands
- 代码高亮
- 表格支持

## 6. 代码结构

```
hotnews/hotnews/web/api/publisher/
├── __init__.py
├── admin.py          # 管理后台 API
├── ai_polish.py      # AI 润色
├── article.py        # 文章详情
├── auth.py           # 认证辅助
├── db.py             # 数据库操作
├── document_parser.py # 文档解析
├── drafts.py         # 草稿 CRUD
├── import_content.py # 内容导入
├── sanitize.py       # HTML 清理
├── upload.py         # 图片上传
└── user.py           # 用户信息

hotnews/src/write/
├── index.html        # 编辑器页面
├── editor.js         # 编辑器逻辑
├── editor.css        # 编辑器样式
├── slash-commands.js # Slash 命令
├── drafts.html       # 草稿列表
├── drafts.js
└── drafts.css
```

## 7. 已移除功能

- ❌ 多平台发布（知乎、掘金、CSDN、微信等）
- ❌ 插件通信和平台适配器
- ❌ 发布历史页面
- ❌ 「一键转入草稿」功能

## 8. 相关文档

详细设计参见归档文档：
- `archive/legacy-proposals/user-articles-publish-design.md`
- `archive/legacy-proposals/publisher-design.md`
