# Tasks: 用户文章发布系统

## 已完成任务

### Phase 1: 后端基础 ✅
- [x] P1-01: 数据库迁移（user_articles, temp_images 表）
- [x] P1-02: 重构草稿 API 使用新表
- [x] P1-03: 修改发布 API（同步到 rss_entries）
- [x] P1-04: 新增下架 API
- [x] P1-05: 新增文章详情 API
- [x] P1-06: 更新文章详情页路由

### Phase 2: 前端页面 ✅
- [x] P2-01: 创建文章详情页
- [x] P2-02: 添加文章详情页路由
- [x] P2-03: 简化发布弹窗

### Phase 3: 清理代码 ✅
- [x] P3-01: 清理编辑器中的多平台发布代码
- [x] P3-02: 清理编辑器 HTML
- [x] P3-03: 清理「一键转草稿」功能
- [x] P3-04: 清理插件代码
- [x] P3-05: 删除发布历史相关文件

### Phase 4: 管理后台 ✅
- [x] P4-01: 用户文章管理 API
- [x] P4-02: 用户文章管理页面

### Phase 5: 测试和构建 ✅
- [x] P5-01: 发布流程测试（12 tests）
- [x] P5-02: 重新构建前端
- [x] P5-03: 删除或更新现有测试

## 暂缓任务

- [ ] M5-08: AI 生成配图
- [ ] P2-04: 精选博客列表显示「原创」标签

## 待部署

功能已完成，等待部署到生产环境。

## 测试统计

| 测试文件 | 测试数 |
|----------|--------|
| test_draft_db.py | 22 |
| test_draft_api.py | 14 |
| test_upload_api.py | 8 |
| test_sanitize.py | 27 |
| test_import_api.py | 6 |
| test_document_parser.py | 22 |
| test_publish_to_explore.py | 12 |
| **总计** | **111** |
