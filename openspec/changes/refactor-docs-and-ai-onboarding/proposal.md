# Change: 重整 docs 文档结构并建立 AI Onboarding 入口（多工具兼容）

## Why
当前项目在多个 AI 工具/模型之间切换（VSCode Claude / Windsurf / Claude Code 等），上下文与历史信息无法自动共享，导致：
- 反复解释项目结构、入口与约束
- 变更历史难以复用，容易与既有决策冲突
- `docs/` 缺少索引与信息架构，文档发现成本高

同时，`openspec/AGENTS.md` 是 OpenSpec 工作流权威入口，直接迁移/改名会破坏既有规则链路。

因此需要：
- 对 `docs/` 做基于项目现状的重整（迁移更整洁）
- 保持 `openspec/AGENTS.md` 不搬家，增加 docs 侧的“面向所有工具的 AI 入口”
- 通过多入口兼容策略，让不同工具都能稳定定位到同一份 canonical 上下文

## What Changes
- 建立新的 `docs/` 信息架构（迁移现有文档到更清晰的目录）：
  - `docs/ai/AI_CONTEXT.md`：AI/模型必读入口（项目概况、关键入口、近期变更、禁忌）
  - `docs/ai/AI_GUIDE.md`：AI 协作指南（需求表达、变更门禁、测试要求、文档维护流程）
  - `docs/runbooks/`：故障排查/操作手册（例如 AI 分类状态检查、编码问题修复）
  - `docs/guides/`：使用指南（例如 viewer 使用指南、RSS AI 分类说明）
  - `docs/dev/`：开发期工具与约定（例如 MetaGPT dev-only 使用）
  - `docs/README.md`：docs 索引页（Single entry for humans)

- 迁移策略：
  - 迁移现有 5 份 docs 到新路径（保持内容语义，更新内部链接）
  - 旧路径文件保留为 stub（短重定向文档），避免断链
  - 更新仓库内引用（脚本/README/其他 docs 等）

- OpenSpec 规则链路保持：
  - `openspec/AGENTS.md` 保持原地，仍为 OpenSpec 工作流权威
  - 在 `openspec/AGENTS.md` 顶部增加指向 `docs/ai/AI_CONTEXT.md` 的“项目入口链接”

- 多入口兼容策略（不确定工具读取哪个文件名时的兜底）：
  - 新增 `CLAUDE.md`（Claude Code 常见入口）
  - 新增 `WINDSURF.md`（Windsurf 项目入口说明）
  - 新增 `CURSOR.md`（VSCode Claude / Cursor-style 项目入口说明）
  - 入口文件仅做“跳转指引”，不承载重复规则，统一指向 `docs/ai/AI_CONTEXT.md` + `openspec/AGENTS.md`

## Impact
- Affected specs:
  - 新增 capability：`docs-and-ai-onboarding`（定义 canonical docs/AI 入口与维护要求）

- Affected code (expected, after approval):
  - 文档迁移与新增文档：`docs/**`
  - 新增/更新多工具入口文件：`CLAUDE.md`、`WINDSURF.md`、`CURSOR.md`（以及 README/CONTRIBUTING 的入口链接，如需要）
  - 可能更新脚本/文档中的引用链接（例如 `metagpt-dev.sh` 与 docs 内互链）

- Risk notes:
  - **断链风险**：通过 stub 重定向与全仓库引用更新缓解
  - **规则漂移风险**：通过“入口文件只做跳转，规则只维护在 canonical docs + openspec”缓解
