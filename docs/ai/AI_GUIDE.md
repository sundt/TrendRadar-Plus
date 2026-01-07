# AI Guide (协作与维护)

## 1. 什么时候必须走 OpenSpec
- 涉及：proposal/spec/计划、引入新能力、破坏性改动、架构/安全/性能大改
- 操作：先读 `openspec/AGENTS.md`，在 `openspec/changes/<change-id>/` 写 `proposal.md/tasks.md/(design.md)/spec delta`，并通过审批后再实现。

## 2. 文档维护规则
- Canonical：`docs/ai/AI_CONTEXT.md` 是 AI 入口；`docs/README.md` 是 docs 索引。
- 入口文件（例如 `CLAUDE.md`、`.windsurfrules`、`.cursorrules`）只允许写“跳转指引”，不要复制规则，避免漂移。
- 迁移文档时：旧路径保留 stub（短重定向），避免断链。

## 3. 提交建议（降低多模型协作成本）
- Commit message 尽量写清：范围 + 行为变化 + 关键文件。
- 对关键决策建议在 `docs/ai/AI_CONTEXT.md` 的“最近变更”里追加一条。

## 4. 快速定位
- 配置加载：`trendradar/core/loader.py`（默认 `config/config.yaml`）
- Viewer 指南：`docs/guides/viewer.md`
- RSS AI 分类：`docs/guides/rss-ai-classification.md`
