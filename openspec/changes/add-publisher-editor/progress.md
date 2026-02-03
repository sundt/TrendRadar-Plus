# 发布系统 - 开发进度

> 每次开发前先读这个文件，开发后更新进度

---

## 当前状态

**阶段**: M6 - 用户文章发布到精选博客 ✅ 已完成  
**进度**: 全部任务完成  
**最后更新**: 2026-02-03  
**部署状态**: 待部署

### 重大架构变更 (2026-02-03)

**简化发布流程**：
- ❌ 移除多平台发布功能（知乎、掘金、CSDN、微信等）
- ❌ 移除插件通信和平台适配器
- ❌ 移除发布历史页面
- ❌ 移除「一键转入草稿」功能（新闻列表、收藏列表、插件侧边栏）
- ✅ 只保留发布到精选博客功能
- ✅ 用户手动在编辑器创建文章

**数据库架构变更**：
- 从双数据库（user.db + online.db）迁移到单数据库（online.db）
- 新建 `user_articles` 表（替代原 drafts 表）
- 新建 `temp_images` 表
- 为 `rss_sources` 表添加 `source_type` 字段
- 每个用户作为独立 RSS 源（`user_{user_id}`）

### 已完成功能

**编辑器核心功能**：
- ✅ Tiptap 富文本编辑器 (v3.18.0)
- ✅ 图片上传（粘贴/拖拽/选择）
- ✅ 封面裁剪（Cropper.js，2.35:1 比例）
- ✅ 文档导入（Markdown/PDF/Word）
- ✅ AI 润色（改写/扩写/缩写/翻译）
- ✅ 草稿自动保存
- ✅ 草稿列表页
- ✅ TOC 目录导航
- ✅ Slash Commands（输入 `/` 弹出命令菜单）
- ✅ 代码高亮
- ✅ 表格支持
- ✅ BubbleMenu 浮动工具栏

**发布功能**：
- ✅ 发布到精选博客（rss_entries 表）
- ✅ 文章详情页（`/article/{id}`）
- ✅ 下架功能
- ✅ 管理后台（`/admin/user-articles`）

### 暂缓任务

- [ ] **M5-08**: AI 生成配图（暂缓）
- [ ] **P2-04**: 精选博客列表显示「原创」标签（暂缓）

---

## 已删除的文件和功能

### 删除的文件
- `src/write/history.js` - 发布历史页面
- `src/write/history.html` - 发布历史页面
- `src/write/history.css` - 发布历史样式
- `tests/publisher/test_history_api.py` - 发布历史测试

### 删除的路由
- `/publish-history` - 发布历史页面路由

### 清理的代码
- `editor.js`: 删除 `showPublishResults`, `renderResultItem`, `hideResultModal`, `retrySinglePlatform`, `retryFailedPublish`, `updateResultSummary`
- `viewer.html`: 删除 `.news-draft-btn`, `handleToDraftClick`, `checkPublisherMemberStatus`
- `favorites.js`: 删除 `.favorite-draft-btn`, `handleToDraftClick`
- `sidepanel.js` (插件): 删除转草稿按钮和 `handleToDraft` 函数
- `background.js` (插件): 删除右键菜单相关代码
- `index.html`: 删除发布结果弹窗（result-modal）、发布历史按钮

---

## 代码结构

```
hotnews/hotnews/web/api/publisher/
├── __init__.py       # 模块导出
├── admin.py          # 管理后台 API（新增）
├── ai_polish.py      # AI 润色 API
├── article.py        # 文章详情 API（新增）
├── auth.py           # 认证辅助函数
├── db.py             # 数据库操作（重写，使用 online.db）
├── document_parser.py # 文档解析器
├── drafts.py         # 草稿 CRUD API
├── import_content.py # 内容导入 API
├── sanitize.py       # HTML 清理
├── upload.py         # 图片上传 API
└── user.py           # 用户信息 API

hotnews/src/write/           # 编辑器源码
├── index.html        # 编辑器页面
├── editor.js         # Tiptap 编辑器逻辑
├── editor.css        # 编辑器样式
├── slash-commands.js # Slash 命令菜单
├── drafts.html       # 草稿列表页面
├── drafts.js         # 草稿列表逻辑
└── drafts.css        # 草稿列表样式

hotnews/hotnews/kernel/templates/
└── admin_user_articles.html  # 管理后台页面（新增）

hotnews/tests/publisher/
├── __init__.py
├── test_draft_db.py          # 数据库操作测试
├── test_draft_api.py         # 草稿 CRUD API 测试
├── test_upload_api.py        # 图片上传测试
├── test_import_api.py        # 内容导入测试
├── test_document_parser.py   # 文档解析测试
├── test_sanitize.py          # HTML 清理测试
└── test_publish_to_explore.py # 发布到精选博客测试（新增，12 tests）
```

---

## 开发命令

```bash
# 开发模式（热更新）
npm run dev:write

# 构建生产版本
npm run build:write

# 运行测试
uv run pytest tests/publisher/ -v

# 启动后端服务
python -m hotnews web
```

---

## 相关文档

- `user-articles-publish-design.md` - 用户文章发布详细设计（最新）
- `publisher-design.md` - 原始技术设计（部分过时）
- `publisher-tasks.md` - 原始任务清单（部分过时）

---

## 上下文恢复指南

**下次开发时，按顺序读取：**
1. 本文件 (publisher-progress.md) - 了解当前进度
2. user-articles-publish-design.md - 查看最新设计和任务清单
3. publisher-errors.md - 查看已知问题（避免重复踩坑）

**关键文件：**
- API 路由: `hotnews/hotnews/web/api/publisher/`
- 数据库操作: `hotnews/hotnews/web/api/publisher/db.py`
- 测试: `hotnews/tests/publisher/`
- 路由注册: `hotnews/hotnews/web/server.py` (搜索 `_publisher_`)
