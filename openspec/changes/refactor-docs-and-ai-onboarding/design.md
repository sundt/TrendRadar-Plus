## Context
当前仓库 `docs/` 文档数量不多，但缺少索引页与清晰的信息架构；同时多 AI 工具并用导致上下文割裂。

`openspec/AGENTS.md` 已被项目规则与工作流依赖，直接迁移/改名会破坏 OpenSpec 的约束链路，因此需要保留其权威地位，并在 docs 中建立项目化、工具无关的 AI 入口。

## Goals / Non-Goals
- Goals:
  - 通过“迁移 + 索引 + stub 重定向”建立整洁、可发现的 docs 结构
  - 通过 `docs/ai/AI_CONTEXT.md` 让任意工具/模型在会话开始时快速获得项目上下文
  - 通过多入口兼容策略保证 VSCode Claude / Windsurf / Claude Code 都能定位到同一份 canonical 上下文
  - 保持 `openspec/AGENTS.md` 原地不动，避免破坏既有规则链路

- Non-Goals:
  - 不追求让模型“自动长期记忆”；以仓库内 canonical 文档作为唯一可控方案
  - 不引入外部知识库作为唯一真相来源

## Decisions
- Decision: `openspec/AGENTS.md` 继续作为 OpenSpec 工作流权威文件，不迁移到 `docs/`
- Decision: docs 的 canonical AI 入口使用 `docs/ai/AI_CONTEXT.md`
- Decision: 旧 docs 路径保留 stub 重定向，避免断链
- Decision: 多工具入口文件只做跳转，不承载重复规则，以防漂移

## Risks / Trade-offs
- 断链风险：迁移会导致历史链接失效 → 通过 stub 重定向与全仓库引用更新缓解
- 漂移风险：多入口文件可能内容不同步 → 入口文件只做“跳转”，规则集中在 canonical 文档
- 维护成本：新增文档需要长期维护 → 通过限制篇幅与“Recent changes 只保留最近 N 条”降低成本

## Migration Plan
- Phase 1（本 change 目标）：建立新结构 + 迁移现有 docs + stub + 入口文件
- Phase 2（可选后续）：在持续迭代中逐步收敛/归档过时内容，完善 docs 索引与 cross-links
