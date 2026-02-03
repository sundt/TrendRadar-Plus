---
inclusion: always
---

# HotNews 项目上下文

## 项目简介
HotNews 是一个新闻聚合和 AI 总结平台，支持 RSS 订阅、微信公众号、关键词追踪等多种新闻来源。

## 文档结构

| 目录 | 用途 |
|------|------|
| `openspec/specs/` | 已实现功能的规格（真相来源） |
| `openspec/changes/` | 进行中的变更提案 |
| `openspec/changes/archive/` | 已完成或废弃的提案归档 |
| `openspec/config.yaml` | 项目配置和上下文 |
| `docs/guides/` | 用户指南和操作手册 |
| `docs/ai/` | AI 上下文文档 |
| `docs/dev/` | 开发文档 |

**查找功能规格**：`openspec/specs/[capability]/spec.md`
**创建新功能**：在 `openspec/changes/` 下创建提案
**查看归档**：`openspec/changes/archive/legacy-proposals/`

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

### 2026-01-27
- ✅ **AI 按钮行为优化** - blocked URL 点击 AI 按钮显示弹窗，点"阅读原文"在新标签打开，扩展显示提示引导用户点击总结
  - `summary-modal.js` - 简化流程，blocked URL 统一走弹窗流程，URL 添加 `?hotnews_auto_summarize=1` 参数
  - `summary-modal.css` - 添加 `.summary-extension-hint` 样式
  - `misc_routes.py` - 添加 `/extension/install` 重定向路由
  - `extension-install.html` - 创建扩展安装引导页面
  - `hotnews-summarizer/content.js` - 检测 URL 参数，显示 10 秒可点击提示引导打开侧边栏

### 2026-01-26
- ✅ **AI 总结支持百度千帆** - 添加 Qianfan provider 支持，优先级高于 DashScope
  - `article_summary.py` - 添加 Qianfan API 支持，修复 model 参数覆盖问题
  - `docker-compose-build.yml` - 添加 QIANFAN_API_KEY/QIANFAN_MODEL 环境变量
  - 当前配置：千帆已禁用（API_KEY 为空），使用阿里千问
- ✅ **10s 超时改为显示链接** - 不再自动关闭弹窗，显示"点击阅读原文"链接
  - `summary-modal.js` - 修改 10s 超时行为
- ✅ **解除微信公众号 block** - `mp.weixin.qq.com` 被误标记为 blocked
  - 服务器执行 SQL 解除 block
- ✅ **日期格式统一为 MM-DD** - 移除年份显示
  - `explore-timeline.js`, `morning-brief.js` - `_fmtTime()` 改为 MM-DD
- ✅ **日期背景透明** - 移除白色背景，融入卡片
  - `news-item.css`, `viewer.css` - `.news-actions` background: white → transparent
- ✅ **创建 AI 总结流程文档** - `docs/ai/ai-summary-flow.md`

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
