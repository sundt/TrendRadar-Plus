# Implementation Plan: 精选公众号功能

## Overview

本实现计划将精选公众号功能分为数据库、后端 API、Admin 前端、首页集成、数据维护五个主要部分，按照依赖关系逐步实现。

预估总工时：约 13-15 小时

## Tasks

- [x] 1. 数据库层
  - [x] 1.1 创建 featured_wechat_mps 表
    - 在 db_online.py 中添加建表语句
    - 添加 fakeid、nickname、round_head_img、signature、category、sort_order、enabled、article_count、last_fetch_at、created_at、updated_at 字段
    - 添加 fakeid UNIQUE 约束
    - 添加 (enabled, sort_order) 和 (category, enabled) 索引
    - _Requirements: 8.1, 8.2, 8.3_
  
  - [x] 1.2 运行数据库迁移
    - 确保表创建成功
    - 验证索引生效

- [x] 2. 检查点 - 数据库层完成
  - 确保表结构正确
  - 可以手动插入测试数据验证

- [x] 3. Admin API 后端
  - [x] 3.1 创建 `hotnews/kernel/admin/featured_mp_admin.py`
    - 定义路由前缀 /api/admin/featured-mps
    - 添加管理员权限验证
    - _Requirements: 1.1_
  
  - [x] 3.2 实现列表查询 API
    - GET /api/admin/featured-mps
    - 支持 category 和 enabled 筛选参数
    - 返回精选公众号列表
    - _Requirements: 1.2, 1.3, 1.4_
  
  - [x] 3.3 实现添加 API
    - POST /api/admin/featured-mps
    - 接收 fakeid、nickname、round_head_img、signature、category
    - 检查 fakeid 是否已存在
    - _Requirements: 3.4, 3.5_
  
  - [x] 3.4 实现更新 API
    - PUT /api/admin/featured-mps/{fakeid}
    - 支持更新 category、sort_order、enabled、article_count
    - _Requirements: 4.1, 4.2_
  
  - [x] 3.5 实现删除 API
    - DELETE /api/admin/featured-mps/{fakeid}
    - _Requirements: 4.3, 4.4_
  
  - [x] 3.6 实现排序 API
    - POST /api/admin/featured-mps/reorder
    - 接收 orders 数组批量更新 sort_order
    - _Requirements: 4.5_
  
  - [x] 3.7 实现搜索 API
    - GET /api/admin/featured-mps/search?keyword=xxx
    - 复用现有 WeChatMPProvider.search_mp()
    - 标记已在精选列表中的公众号
    - _Requirements: 3.1, 3.2, 3.3_
  
  - [x] 3.8 实现批量导入预览 API
    - POST /api/admin/featured-mps/import/preview
    - 支持 multipart/form-data 上传文件或 JSON 传 csv_text
    - 解析 CSV，逐个搜索匹配公众号
    - 返回预览结果和 preview_id
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  
  - [x] 3.9 实现批量导入确认 API
    - POST /api/admin/featured-mps/import/confirm
    - 根据 preview_id 和 selected_lines 批量添加
    - _Requirements: 2.6, 2.7, 2.8_
  
  - [x] 3.10 实现模板下载 API
    - GET /api/admin/featured-mps/import/template
    - 返回 CSV 模板文件
    - _Requirements: 2.9_
  
  - [x] 3.11 实现导出 API
    - GET /api/admin/featured-mps/export
    - 生成 CSV 文件下载
    - _Requirements: 5.1, 5.2, 5.3_
  
  - [x] 3.12 实现手动抓取 API
    - POST /api/admin/featured-mps/fetch
    - 可选指定 fakeid，不传则抓取所有启用的
    - _Requirements: 7.1_
  
  - [x] 3.13 在 server.py 中注册路由
    - 导入 featured_mp_admin 模块
    - 注册路由组
    - _Requirements: 1.1_

- [x] 4. 检查点 - Admin API 完成
  - 使用 curl 测试各 API 端点
  - 确保权限验证正确

- [x] 5. Admin 前端页面
  - [x] 5.1 修改现有 Admin 页面添加页签入口
    - 在 admin 页面的 Tab 栏添加「精选公众号」链接
    - _Requirements: 1.1_
  
  - [x] 5.2 创建 `admin_featured_mps.html` 模板
    - 参考 admin_rss_sources.html 结构
    - _Requirements: 1.1, 1.2_
  
  - [x] 5.3 实现操作按钮区
    - 批量导入、单个添加、下载模板、导出列表按钮
    - _Requirements: 1.5_
  
  - [x] 5.4 实现筛选区
    - 分类下拉框、状态下拉框
    - 显示总数统计
    - _Requirements: 1.4_
  
  - [x] 5.5 实现精选公众号列表
    - 显示头像、名称、分类、状态、操作按钮
    - _Requirements: 1.3_
  
  - [x] 5.6 实现空状态提示
    - 列表为空时显示引导
    - _Requirements: 1.6_
  
  - [x] 5.7 创建 `admin_featured_mps.js`
    - 实现列表加载和渲染
    - 实现筛选逻辑
    - _Requirements: 1.2, 1.3, 1.4_
  
  - [x] 5.8 实现批量导入弹窗
    - 步骤1：上传文件或粘贴文本
    - 步骤2：预览匹配结果，勾选要导入的
    - 步骤3：确认导入，显示结果
    - _Requirements: 2.1, 2.2, 2.5, 2.6, 2.7_
  
  - [x] 5.9 实现单个添加弹窗
    - 搜索输入框（带防抖，间隔3秒）
    - 搜索结果列表
    - 添加按钮
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  
  - [x] 5.10 实现编辑弹窗
    - 分类选择、排序权重、启用状态
    - _Requirements: 4.1, 4.2_
  
  - [x] 5.11 实现删除确认
    - 删除前显示确认对话框
    - _Requirements: 4.3, 4.4_
  
  - [ ] 5.12 实现批量操作 (V2)
    - 全选/取消全选
    - 批量启用/禁用/删除
    - _Requirements: 4.6_

- [x] 6. 检查点 - Admin 前端完成
  - 测试完整的批量导入流程
  - 测试单个添加流程
  - 测试编辑和删除功能

- [x] 7. 前端数据加载模块
  - [x] 7.1 创建 `featured-mps.js` 模块
    - 参考 my-tags.js 实现
    - 实现前端 localStorage 缓存（5分钟TTL）
    - 实现懒加载（Tab 切换时加载）
    - 实现后台静默更新缓存
    - _Requirements: 10.1, 10.5_
  
  - [x] 7.2 在 index.js 中导入模块
    - `import './featured-mps.js';`
  
  - [x] 7.3 修改 page_rendering.py
    - 添加 `_inject_featured_mps_category()` 函数
    - 设置 `is_dynamic: True`, `requires_auth: False`
    - 插入位置：每日AI早报（knowledge）后面
    - _Requirements: 6.1_
  
  - [x] 7.4 修改 data.js
    - 添加 featured-mps 的特殊处理（类似 my-tags）
    - 渲染空的 grid 容器 `#featuredMpsGrid`

- [x] 8. 前端栏目展示 API
  - [x] 8.1 实现前端展示 API
    - GET /api/featured-mps
    - 返回启用的精选公众号及其最新 50 篇文章
    - 按 sort_order 排序
    - **实现后端内存缓存（5分钟TTL）**
    - 返回 cached 和 cache_age 字段
    - _Requirements: 6.1, 6.2, 6.3, 6.6, 6.7, 10.1, 10.2, 10.3_

- [x] 9. 首页栏目集成
  - [x] 9.1 修改 page_rendering.py
    - 动态注入 featured-mps 栏目
    - 位置放在「每日AI早报」后面
    - _Requirements: 6.1_
  
  - [x] 9.2 实现 /api/featured-mps API
    - 查询 featured_wechat_mps 表获取启用的公众号
    - 查询 wechat_mp_articles 表获取每个公众号的最新文章
    - 构建 platforms 数据结构
    - _Requirements: 6.2, 6.3, 6.4, 6.5_
  
  - [x] 9.3 处理公众号头像代理
    - 复用现有的 /api/wechat/avatar-proxy
    - _Requirements: 6.2_

- [ ] 10. 检查点 - 首页集成完成
  - 验证精选公众号栏目正确显示
  - 验证懒加载机制工作正常
  - 验证前端缓存和后端缓存
  - 验证文章列表按时间排序
  - 验证点击文章能正确跳转

- [x] 11. 抓取机制集成
  - [x] 11.1 实现手动抓取 API
    - POST /api/admin/featured-mps/fetch
    - 优先使用共享凭证池
    - 控制请求间隔（文章列表 ≥ 2秒）
    - _Requirements: 7.1, 7.2_
  
  - [x] 11.2 实现文章存储
    - 复用 wechat_mp_articles 表
    - 根据 URL 去重
    - _Requirements: 7.3_
  
  - [ ] 11.3 实现旧文章清理 (V2)
    - 清理超过 30 天的文章
    - _Requirements: 7.4_

- [ ] 12. 检查点 - 抓取集成完成
  - 验证精选公众号文章能被正确抓取
  - 验证文章去重逻辑

- [ ] 13. 数据维护任务 (V2)
  - [ ] 13.1 实现公众号信息同步
  - [ ] 13.2 实现文章 URL 有效性检测
  - [ ] 13.3 实现公众号活跃度检测

- [x] 14. 缓存机制
  - [x] 14.1 实现后端缓存失效机制
    - Admin 修改后自动清除后端内存缓存
    - 调用 `_invalidate_cache()`
    - _Requirements: 10.3_

- [x] 15. 错误处理完善
  - [x] 15.1 共享凭证不可用提示
    - _Requirements: 11.1, 11.2_
  
  - [x] 15.2 批量导入预览缓存
    - 预览结果存储在缓存中（10分钟TTL）
    - _Requirements: 11.3_
  
  - [x] 15.3 频率限制处理
    - 搜索接口间隔 ≥ 3秒
    - 文章列表间隔 ≥ 2秒
    - _Requirements: 11.6, 11.7_

- [ ] 16. 最终检查点
  - 完整测试批量导入流程
  - 完整测试单个添加流程
  - 验证首页栏目展示
  - 验证懒加载和缓存机制
  - 验证抓取机制工作正常
  - 验证缓存失效机制
  - 本地测试通过后可部署

## Notes

- 每个任务都引用了具体的需求条款以便追溯
- 检查点用于确保增量验证
- 批量导入是核心功能，需要重点测试
- 复用现有的微信 Provider 和抓取机制，减少重复代码
- **数据加载采用与"我的关注"相同的动态加载机制**（懒加载 + 前端缓存 + 后端缓存）
- 本地测试通过后再部署到服务器
- 数据维护任务（13.1-13.3）标记为 V2，后续优化
- 拖拽排序和批量操作标记为 V2，后续优化

## 已完成的文件

- `hotnews/hotnews/web/db_online.py` - 数据库表创建
- `hotnews/hotnews/kernel/admin/featured_mp_admin.py` - Admin API
- `hotnews/hotnews/web/server.py` - 路由注册
- `hotnews/hotnews/web/page_rendering.py` - 动态栏目注入
- `hotnews/hotnews/web/static/js/src/data.js` - 前端占位符
- `hotnews/hotnews/web/static/js/src/featured-mps.js` - 前端数据加载模块
- `hotnews/hotnews/web/static/js/src/index.js` - 模块导入
- `hotnews/hotnews/web/static/js/src/tabs.js` - Tab 跳过清理
- `hotnews/hotnews/kernel/templates/admin_featured_mps.html` - Admin 页面模板
- `hotnews/hotnews/kernel/static/js/admin_featured_mps.js` - Admin 页面 JS
- `hotnews/hotnews/kernel/templates/admin_rss_sources.html` - 添加入口链接
