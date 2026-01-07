# AI Context (Canonical)

本文件是 **AI 助手必读入口**（适用于 VSCode Claude / Windsurf / Claude Code 等）。

## 必读文件
- `docs/ai/AI_CONTEXT.md`（本文件）
- `docs/ai/AI_GUIDE.md`
- `docs/README.md`
- `openspec/AGENTS.md`（当涉及 proposal/spec/架构调整时必须遵循）

## 项目目的（TL;DR）
TrendRadar：多平台热点新闻聚合与 AI 分析工具（抓取、分类查看器、RSS、推送、MCP 分析）。

## 关键入口
- Web Server：`trendradar/web/server.py`
- 主配置：`config/config.yaml`（可被环境变量 `CONFIG_PATH` 覆盖）
- 搜索配置：`trendradar/search/config.py`（环境变量 `TREND_RADAR_*`）
- 前端模板：`trendradar/web/templates/`
- 前端 JS（模块化源码）：`trendradar/web/static/js/src/`

## 工作方式（最低要求）
- 进行较大改动/新增能力/规范调整前：先走 OpenSpec（见 `openspec/AGENTS.md`）。
- 涉及前端行为变更：按 OpenSpec 要求跑 Playwright E2E（`npm test`）。

## 最近变更（维护建议）
- 仅保留最近 10 条，新增条目写在最上面。
- 示例格式：`YYYY-MM-DD: [area] 简述变更 + 关键文件`。

## 禁忌/安全
- 不要把 webhook/token/password 等敏感信息写入仓库或文档。
- 文档示例请使用占位符。
