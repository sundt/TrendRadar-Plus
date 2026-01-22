# RSS 订阅源页签 - 实现状态

## 📊 当前实现状态

### ✅ 已完成功能

#### 1. 数据库层
- [x] `user_rss_subscriptions` 表 - 存储用户订阅
- [x] `user_rss_subscription_adds` 表 - 记录首次添加时间
- [x] 相关索引和约束

#### 2. 后端 API (`hotnews/kernel/user/source_subscription_api.py`)
- [x] `GET /api/sources/search` - 搜索 RSS 源和自定义源
- [x] `GET /api/sources/subscriptions` - 获取用户订阅列表
- [x] `POST /api/sources/subscribe` - 订阅源
- [x] `POST /api/sources/unsubscribe` - 取消订阅

#### 3. 前端 UI (`hotnews/web/static/js/src/source-subscription.js`)
- [x] "订阅" 页签基础结构
- [x] 搜索功能（带 debounce）
- [x] "我的订阅" / "发现更多" 视图切换
- [x] 订阅/取消订阅按钮交互
- [x] 与 authState 集成（登录状态响应）
- [x] Toast 提示

#### 4. 现有订阅系统 (`subscription.js`)
- [x] 完整的 RSS 订阅管理模态框
- [x] 源选择器（picker）
- [x] 预览功能
- [x] 服务端同步
- [x] 本地存储

### ❌ 待完成功能

#### 1. 预览面板（参考 Feedly 设计）
- [ ] 点击源卡片展开预览面板
- [ ] 显示最新文章列表
- [ ] 显示源统计信息（订阅者数、文章频率）
- [ ] 预览面板样式优化

#### 2. 源详情 API
- [ ] `GET /api/sources/preview` - 获取源详情和最新文章
- [ ] 返回订阅者数量
- [ ] 返回文章发布频率

#### 3. 内容过滤
- [ ] 在"订阅源"页签激活时，只显示已订阅源的新闻
- [ ] 与现有新闻列表集成

#### 4. UI/UX 优化
- [ ] 源卡片样式优化（参考 mockup）
- [ ] 预览面板动画效果
- [ ] 移动端响应式优化
- [ ] 空状态优化

#### 5. 高级功能（可选）
- [ ] 分类浏览
- [ ] 热门源推荐
- [ ] 未读计数

## 📁 相关文件

### 后端
```
hotnews/kernel/user/source_subscription_api.py  # 订阅 API
hotnews/web/user_db.py                          # 数据库操作
hotnews/web/server.py                           # 路由注册
```

### 前端
```
hotnews/web/static/js/src/source-subscription.js  # 订阅页签模块
hotnews/web/static/js/src/subscription.js         # 现有订阅管理
hotnews/web/templates/viewer.html                 # 页面模板
```

### 文档
```
openspec/changes/add-rss-subscription-tab/
├── README.md                    # 项目概述
├── proposal.md                  # 功能方案
├── design.md                    # 详细设计
├── tasks.md                     # 任务清单
└── IMPLEMENTATION_STATUS.md     # 本文件
```

## 🔄 下一步计划

### Phase 1: 预览面板（优先级高）
1. 实现 `GET /api/sources/preview` API
2. 前端添加预览面板组件
3. 点击源卡片展开预览

### Phase 2: 内容过滤
1. 修改新闻列表过滤逻辑
2. 在订阅页签激活时应用过滤

### Phase 3: UI 优化
1. 参考 mockup 优化样式
2. 添加动画效果
3. 移动端适配

## 📝 注意事项

1. **两套订阅系统并存**
   - `subscription.js` - 原有的 RSS 订阅管理（模态框形式）
   - `source-subscription.js` - 新的订阅页签（页签形式）
   - 两者共用同一数据库表 `user_rss_subscriptions`

2. **认证要求**
   - 搜索功能：无需登录
   - 订阅/取消订阅：需要登录

3. **数据一致性**
   - 订阅数据存储在 `user.db` 的 `user_rss_subscriptions` 表
   - 源数据来自 `online.db` 的 `rss_sources` 和 `custom_sources` 表
