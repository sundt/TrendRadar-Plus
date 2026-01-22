# Tasks: 添加微信公众号订阅源支持

## 1. Proposal Approval
- [ ] 1.1 Review and approve `proposal.md`

## 2. Database & Models
- [ ] 2.1 创建 `wechat_mp_auth` 表（用户认证信息）
- [ ] 2.2 创建 `wechat_mp_subscriptions` 表（用户订阅）
- [ ] 2.3 创建 `wechat_mp_articles` 表（文章缓存）
- [ ] 2.4 添加数据库迁移脚本

## 3. Backend Provider
- [ ] 3.1 创建 `hotnews/kernel/providers/wechat_provider.py`
  - [ ] 3.1.1 实现 `search_mp()` 搜索公众号
  - [ ] 3.1.2 实现 `get_articles()` 获取文章列表
  - [ ] 3.1.3 实现 `test_auth()` 测试认证有效性
  - [ ] 3.1.4 添加错误处理（过期、限流、网络错误）

## 4. Backend API
- [ ] 4.1 创建 `hotnews/kernel/admin/wechat_admin.py`
  - [ ] 4.1.1 `POST /api/wechat/auth` - 保存认证信息
  - [ ] 4.1.2 `GET /api/wechat/auth/status` - 获取认证状态
  - [ ] 4.1.3 `POST /api/wechat/auth/test` - 测试认证
  - [ ] 4.1.4 `GET /api/wechat/search` - 搜索公众号
  - [ ] 4.1.5 `POST /api/wechat/subscribe` - 订阅公众号
  - [ ] 4.1.6 `POST /api/wechat/unsubscribe` - 取消订阅
  - [ ] 4.1.7 `GET /api/wechat/subscriptions` - 获取订阅列表
  - [ ] 4.1.8 `GET /api/wechat/articles` - 获取文章列表
  - [ ] 4.1.9 `POST /api/wechat/refresh` - 手动刷新
- [ ] 4.2 在 `server.py` 中注册路由

## 5. Scheduler
- [ ] 5.1 创建定时任务：定期抓取订阅公众号的文章
- [ ] 5.2 实现请求频率控制（每公众号 30 分钟一次）
- [ ] 5.3 实现文章去重逻辑

## 6. Frontend UI
- [ ] 6.1 在设置页面添加"微信公众号"Tab
- [ ] 6.2 实现认证配置 UI
  - [ ] 6.2.1 Cookie/Token 输入表单
  - [ ] 6.2.2 认证状态显示
  - [ ] 6.2.3 获取认证指南弹窗
- [ ] 6.3 实现公众号搜索 UI
  - [ ] 6.3.1 搜索输入框
  - [ ] 6.3.2 搜索结果列表
  - [ ] 6.3.3 订阅按钮
- [ ] 6.4 实现订阅列表 UI
  - [ ] 6.4.1 已订阅公众号列表
  - [ ] 6.4.2 取消订阅按钮
- [ ] 6.5 实现文章展示
  - [ ] 6.5.1 在首页/订阅源 Tab 展示微信文章
  - [ ] 6.5.2 文章卡片样式（带微信图标标识）

## 7. Integration
- [ ] 7.1 将微信文章整合到统一的新闻流中
- [ ] 7.2 支持按来源过滤（只看微信公众号）
- [ ] 7.3 添加微信公众号分类标签

## 8. Testing
- [ ] 8.1 单元测试：Provider 核心方法
- [ ] 8.2 集成测试：API 端点
- [ ] 8.3 E2E 测试：前端交互流程

## 9. Documentation
- [ ] 9.1 更新用户文档：如何获取 Cookie/Token
- [ ] 9.2 更新 API 文档
