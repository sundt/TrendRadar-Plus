# Change: 用户文章发布系统

## Why
让用户能够在 hotnews 平台创建和发布原创文章到精选博客。

## What Changes
- Tiptap 富文本编辑器（图片上传、封面裁剪、文档导入）
- AI 润色功能（改写/扩写/缩写/翻译）
- 草稿自动保存和管理
- 发布到精选博客（作为 RSS 源展示）
- 管理后台审核

## Current Status
**阶段**: M6 - 用户文章发布到精选博客 ✅ 已完成  
**最后更新**: 2026-02-03  
**部署状态**: 待部署

### 已完成功能
- ✅ Tiptap 编辑器核心功能
- ✅ 图片上传（粘贴/拖拽/选择）
- ✅ 封面裁剪（Cropper.js）
- ✅ 文档导入（Markdown/PDF/Word）
- ✅ AI 润色
- ✅ 草稿自动保存
- ✅ 发布到精选博客
- ✅ 管理后台

### 暂缓任务
- [ ] AI 生成配图
- [ ] 精选博客列表显示「原创」标签

## Non-goals
- ❌ 多平台发布（知乎、掘金、CSDN、微信等）- 已移除
- ❌ 插件通信和平台适配器 - 已移除

## Impact
- 新增 API: `/api/publisher/*`
- 新增页面: `/write`, `/drafts`, `/article/{id}`
- 新增管理页: `/admin/user-articles`
- 数据库: `user_articles` 表, `temp_images` 表

## Related Files
- 编辑器: `src/write/`
- API: `hotnews/web/api/publisher/`
- 测试: `tests/publisher/`
