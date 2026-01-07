# AI Guide (协作与维护)

## 1. 什么时候必须走 OpenSpec
- 涉及：proposal/spec/计划、引入新能力、破坏性改动、架构/安全/性能大改
- 操作：先读 `openspec/AGENTS.md`，在 `openspec/changes/<change-id>/` 写 `proposal.md/tasks.md/(design.md)/spec delta`，并通过审批后再实现。

## 2. 文档维护规则
- Canonical：`docs/ai/AI_CONTEXT.md` 是 AI 入口；`docs/README.md` 是 docs 索引。
- 入口文件（例如 `CLAUDE.md`、`WINDSURF.md`、`CURSOR.md`）只允许写“跳转指引”，不要复制规则，避免漂移。
- 迁移文档时：旧路径保留 stub（短重定向），避免断链。

## 3. 数据库变更（Schema）Checklist

当你要增加表/字段/索引时，至少要检查并同步：

- **news.db（日库）**：更新 `trendradar/storage/schema.sql`（并确认 `trendradar/storage/local.py` / `trendradar/storage/remote.py` 使用该 schema 初始化）。
- **online.db（RSS）**：更新 `trendradar/web/db_online.py` 的建表 SQL；如需兼容旧库，加 `_ensure_column(...)`（仅适合 ADD COLUMN 这类简单迁移）。
- **user.db**：更新 `trendradar/web/user_db.py` 的建表 SQL；如需兼容旧库，建议采用“新增列/新表”的方式，避免复杂迁移。
- **fts_index.db（搜索索引）**：更新 `trendradar/search/fts_index.py` 的 FTS 虚拟表定义（必要时需要重建索引）。

一般不需要也不建议提交 `.db` 文件；用初始化/迁移代码保证旧库可升级。

## 4. 提交建议（降低多模型协作成本）
- Commit message 尽量写清：范围 + 行为变化 + 关键文件。
- 对关键决策建议在 `docs/ai/AI_CONTEXT.md` 的“最近变更”里追加一条。

## 5. 快速定位
- 配置加载：`trendradar/core/loader.py`（默认 `config/config.yaml`）
- Viewer 指南：`docs/guides/viewer.md`
- RSS AI 分类：`docs/guides/rss-ai-classification.md`
