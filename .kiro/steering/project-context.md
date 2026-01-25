---
inclusion: always
---

# HotNews 项目上下文

## 项目简介
HotNews 是一个新闻聚合和 AI 总结平台，支持 RSS 订阅、微信公众号、关键词追踪等多种新闻来源。

## 核心功能模块

| 功能 | 后端 | 前端 | 说明 |
|------|------|------|------|
| 用户认证 | `kernel/auth/` | `auth-*.js` | 微信扫码登录 |
| AI 总结 | `kernel/user/summary_api.py` | `summary-modal.js` | 文章智能总结 |
| 我的关注 | `kernel/user/preferences_api.py` | `my-tags.js` | 标签/源/关键词聚合 |
| 收藏夹 | `kernel/user/favorites_api.py` | `favorites.js` | 文章收藏管理 |
| Todo | `kernel/user/todo_api.py` | `todo.js` | 待读列表 |
| 支付 | `kernel/user/payment_*.py` | `payment.js` | 微信支付充值 |
| 订阅 | `kernel/user/subscription_*.py` | `subscription.js` | VIP 订阅 |

## 服务器信息

| 项目 | 值 |
|------|-----|
| 主机 | `120.77.222.205` |
| 用户 | `root` |
| SSH端口 | `52222` |
| 项目路径 | `~/hotnews` |
| 健康检查 | `http://127.0.0.1:8090/health` |

**⚠️ 重要**：不要直接通过 AI 执行 SSH 命令，应该：
1. 提供命令让用户手动执行
2. 或使用 `./deploy-fast.sh` 部署脚本

## 数据库
- `output/online.db` - 公共数据（RSS、标签、总结缓存）
- `output/user.db` - 用户数据（收藏、偏好、支付）

## 部署

### 服务器信息
- 主机：`120.77.222.205`
- 用户：`root`
- 端口：`52222`
- 项目路径：`~/hotnews`
- 健康检查：`http://127.0.0.1:8090/health`

### 本地开发
- 本地服务通过 Docker 运行，端口 8090
- 重启本地服务：`docker compose -f hotnews/docker/docker-compose-build.yml restart hotnews-viewer`
- 查看本地日志：`docker compose -f hotnews/docker/docker-compose-build.yml logs -f hotnews-viewer`

### 部署命令
- 快速部署：`./deploy-fast.sh`（仅重启容器，适用于代码修改）
- 完整重建：`./deploy-rebuild.sh`（重建镜像，适用于依赖变更）

### 远程操作示例
```bash
# SSH 连接
ssh -p 52222 root@120.77.222.205

# 查看数据库
cd ~/hotnews && sqlite3 output/online.db "SELECT ..."

# 查看日志
cd ~/hotnews/docker && docker compose -f docker-compose-build.yml logs -f hotnews-viewer
```

### ⚠️ 注意事项
- **本地优先**：默认查询本地数据库，只有用户要求时才查询服务器
- 数据库文件在 `hotnews/output/` 目录下（本地）或服务器的 `~/hotnews/output/`

## 最近改动

### 2026-01-25
- ✅ **修复 AI 总结定时器 bug** - `clearAllTimers()` 递归调用导致无限循环
  - `summary-modal.js` - 修复 `clearAllTimers()` 调用 `clearSlowLoadingTimer()`
- ✅ **移除总结中的 [ ] 复选框** - 行动清单不再显示空方括号
  - `prompts.py` - 模板中移除 `- [ ]` 格式
  - `summary-modal.js` - 渲染时过滤 `[ ]` 标记
- ✅ **移动端 5 秒自动打开原文** - 加载慢时自动跳转，保留弹窗可添加 Todo/收藏
  - `summary-modal.js` - slowLoadingTimer 中检测移动端并自动打开
- ✅ **移动端总结弹窗安全区域** - 避免被浏览器地址栏/工具栏遮挡
  - `mobile.css` - 使用 `dvh` 和 `env(safe-area-inset-*)` 
  - `viewer.html` - viewport 添加 `viewport-fit=cover`
- ✅ 阅读原文不关闭弹窗 - `summary-modal.js`
- ✅ 总结失败追踪功能 - `summary_failure_tracker.py`, `summary_failure_api.py`, `summary-modal.js`
- ✅ 反爬/验证码页面检测 - `summary_api.py`（检测微信验证码等，记录为 fetch_blocked）
- ✅ 失败记录补全 source_id/source_name - `summary_failure_api.py`, `summary_failure_tracker.py`
- ✅ analyze-before-action skill 增强
- ✅ 创建 common-mistakes.md
- ✅ **微信凭证有效期优化** - 从 cookie 读取实际过期时间，默认改为 24 小时
  - `wechat_shared_credentials.py` - 默认有效期 4h → 24h
  - `wechat_qr_login.py` - 从 `slave_sid` cookie 提取 `expires` 字段
  - `wechat_admin.py`, `auth_api.py` - 适配新返回值
- ✅ 创建 `docs/proposals/web-scraping-enhancement.md` - 网页抓取增强方案文档
- ✅ **普通栏目添加 AI 按钮** - 移除收藏按钮，统一使用 AI 总结按钮
  - `viewer.html` - 模板中 news-item 结构改为 news-actions + news-summary-btn
  - `tabs.js` - 懒加载渲染也使用 AI 按钮
  - `summary-modal.js` - 添加事件委托处理服务端渲染的按钮点击
- ✅ **修复移动端水平溢出** - 页面可以左右滑动露出紫色背景
  - `mobile.css`, `viewer.css` - `width: 100vw` → `width: 100%`
  - 添加 `html, body { overflow-x: hidden }`

## 待办事项
<!-- 在这里记录进行中的任务 -->
- 无
