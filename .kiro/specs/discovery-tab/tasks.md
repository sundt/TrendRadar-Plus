# 实现计划：新发现栏目

## 概述

按照"我的关注"栏目的实现模式，分阶段实现"新发现"栏目功能。复用现有代码结构，减少开发成本。

## 任务

- [x] 1. 后端 API 实现
  - [x] 1.1 在 `preferences_api.py` 添加 `/api/user/preferences/discovery-news` 接口
    - 复用 `recommended-tags` 中的 new_tags 查询逻辑
    - 查询符合晋升标准的 tag_candidates
    - 按 occurrence_count 降序排列
    - 最多返回 30 个标签
    - _Requirements: 2.1, 2.5, 6.1_
  
  - [x] 1.2 实现每个标签的新闻查询
    - 通过 rss_entry_tags + rss_entries 关联查询
    - 每个标签最多 50 条新闻
    - 复用 `_deduplicate_news_by_title()` 去重逻辑
    - 按 published_at 降序排列
    - _Requirements: 2.4, 3.3_
  
  - [x] 1.3 实现全局缓存
    - 在 `timeline_cache.py` 创建 `discovery_news_cache` 缓存实例
    - TTL: 10 分钟（600秒）
    - 缓存粒度：全局缓存（所有用户共享）
    - _Requirements: 5.4_
  
  - [x] 1.4 在 `page_rendering.py` 添加栏目注入函数
    - 创建 `_inject_discovery_category()` 函数
    - 在 my-tags 之后注入 discovery 栏目
    - 设置 requires_auth: False（无需登录）
    - 在 `render_viewer_page()` 中调用注入函数
    - _Requirements: 1.1, 1.3, 1.5_

- [x] 2. 前端模块实现
  - [x] 2.1 创建 `discovery.js` 模块
    - 复用 my-tags.js 的模块结构
    - 定义常量：DISCOVERY_CATEGORY_ID, DISCOVERY_CACHE_KEY, DISCOVERY_CACHE_TTL
    - 实现状态管理：discoveryLoaded, discoveryLoading
    - _Requirements: 5.1, 5.2, 5.3_
  
  - [x] 2.2 实现数据加载函数 `loadDiscovery()`
    - 检查 localStorage 缓存
    - 缓存有效则直接渲染
    - 缓存无效则调用 API
    - 无需登录检查（公开接口）
    - _Requirements: 1.3, 5.1, 5.2, 5.3_
  
  - [x] 2.3 实现卡片渲染函数 `createDiscoveryCard()`
    - 复用 my-tags.js 的 createTagCard() 结构
    - 添加 NEW 徽章显示
    - 添加发现日期显示
    - 添加 data-candidate="true" 属性
    - _Requirements: 2.2, 2.3_
  
  - [x] 2.4 实现新闻列表渲染
    - 复用 my-tags.js 的新闻项结构
    - 显示序号、标题、日期
    - 支持 AI 总结按钮
    - 支持已读状态
    - _Requirements: 3.1, 3.2, 3.4, 3.5_
  
  - [x] 2.5 实现空状态和错误状态渲染
    - 无数据时显示空状态提示
    - 加载失败时显示错误状态和重试按钮
    - _Requirements: 2.6, 5.5, 5.6_

- [x] 3. 栏目集成
  - [x] 3.1 在 `tabs.js` 添加 discovery 到特殊栏目列表
    - 在 `_cleanupInactiveTabs` 的 skip 列表中添加 'discovery'
    - 确保 discovery 栏目不会被内存清理
    - _Requirements: 1.1_
  
  - [x] 3.2 在 `index.js` 中导入和初始化 discovery 模块
    - 添加 import 语句
    - 在模块初始化中调用 discovery.init()
    - _Requirements: 1.1_
  
  - [x] 3.3 实现 Tab 切换事件监听
    - 监听 tr_tab_switched 事件
    - 切换到 discovery 时触发 loadDiscovery()
    - 复用 my-tags.js 的事件监听模式
    - _Requirements: 5.1_
  
  - [x] 3.4 在 `init.js` 中添加 discoveryGrid 容器渲染
    - 检查 categoryId === 'discovery' 的特殊处理
    - 创建 discoveryGrid 容器 HTML
    - _Requirements: 1.1, 1.2_

- [x] 4. 一键关注功能
  - [x] 4.1 在 `platform-reorder.js` 添加 discovery 栏目的右键菜单
    - 检测 categoryId === 'discovery'
    - 显示"➕ 一键关注"选项
    - 获取卡片的 tag-id 属性
    - _Requirements: 4.1, 4.2_
  
  - [x] 4.2 实现关注处理函数
    - 检查登录状态，未登录弹出登录框
    - 调用 POST /api/user/preferences/tag-settings
    - 显示 Toast 提示
    - _Requirements: 4.3, 4.4, 4.5_
  
  - [x] 4.3 实现缓存同步
    - 关注成功后清除 my-tags 前端缓存
    - 调用 localStorage.removeItem('hotnews_my_tags_cache')
    - _Requirements: 4.6_

- [x] 5. 样式实现
  - [x] 5.1 在 `viewer.css` 添加 NEW 徽章样式
    - 绿色渐变背景 (linear-gradient)
    - 圆角边框
    - 脉冲动画效果 (@keyframes pulse)
    - _Requirements: 2.2_
  
  - [x] 5.2 添加发现日期样式
    - 灰色小字 (#9ca3af)
    - 位于标签名称后
    - _Requirements: 2.3_
  
  - [x] 5.3 添加卡片悬停效果
    - 边框颜色变化 (border-color: #10b981)
    - 阴影效果 (box-shadow)
    - _Requirements: 2.2_

- [x] 6. 前端打包配置
  - [x] 6.1 确保 discovery.js 被正确打包
    - 检查 esbuild/vite 配置
    - 确保模块被包含在 index.js 的 bundle 中
    - _Requirements: 1.1_

- [x] 7. 检查点 - 功能验证
  - 验证栏目位置正确（在"我的关注"右侧）
  - 验证无需登录可查看
  - 验证一键关注功能正常
  - 验证缓存机制正常
  - 验证 NEW 徽章和发现日期显示正确
  - 如有问题请询问用户

- [ ]* 8. 属性测试（可选）
  - [ ]* 8.1 编写属性测试：无需登录访问
    - **Property 1: 无需登录访问**
    - **Validates: Requirements 1.3**
  
  - [ ]* 8.2 编写属性测试：缓存有效性
    - **Property 2: 缓存有效性**
    - **Validates: Requirements 5.1, 5.2, 5.3**
  
  - [ ]* 8.3 编写属性测试：标签排序正确性
    - **Property 3: 标签排序正确性**
    - **Validates: Requirements 2.5**
  
  - [ ]* 8.4 编写属性测试：新闻数量限制
    - **Property 4: 新闻数量限制**
    - **Validates: Requirements 2.4**
  
  - [ ]* 8.5 编写属性测试：关注状态同步
    - **Property 5: 关注状态同步**
    - **Validates: Requirements 4.6**

## 文件清单

### 新建文件
- `hotnews/hotnews/web/static/js/src/discovery.js` - 前端模块

### 修改文件
- `hotnews/hotnews/kernel/user/preferences_api.py` - 添加 API 接口
- `hotnews/hotnews/web/page_rendering.py` - 添加栏目注入函数
- `hotnews/hotnews/web/timeline_cache.py` - 添加缓存实例
- `hotnews/hotnews/web/static/js/src/tabs.js` - 添加特殊栏目
- `hotnews/hotnews/web/static/js/src/index.js` - 导入模块
- `hotnews/hotnews/web/static/js/src/init.js` - 添加容器渲染
- `hotnews/hotnews/web/static/js/src/platform-reorder.js` - 添加右键菜单
- `hotnews/hotnews/web/static/css/viewer.css` - 添加样式

## 备注

- 标记 `*` 的任务为可选任务，可跳过以加快 MVP 交付
- 复用 my-tags.js 的代码结构，减少开发成本
- 后端 API 复用 recommended-tags 的查询逻辑
- 前端缓存 TTL 为 10 分钟，后端缓存 TTL 也为 10 分钟
- 栏目注入在 page_rendering.py 中完成，确保位置在 my-tags 之后
