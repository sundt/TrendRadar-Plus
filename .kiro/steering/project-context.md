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
- ✅ 阅读原文不关闭弹窗 - `summary-modal.js`（移除 onclick 关闭事件）
- ✅ 总结失败追踪功能 - `summary_failure_tracker.py`, `summary_failure_api.py`, `summary-modal.js`
  - 前端 5s 显示加载提示，10s 硬超时并记录失败
  - 新增 `/api/summary/failures/record` 接口
  - 后端 HTTP 超时从 30s 改为 10s
- ✅ analyze-before-action skill 增强 - 添加影响分析、服务器信息、强制更新 project-context、错误记录机制
- ✅ 创建 common-mistakes.md - 记录 AI 常见错误避免重复

## 待办事项
<!-- 在这里记录进行中的任务 -->
- [ ] 以上改动待部署到服务器
