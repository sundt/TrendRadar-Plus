## 1. Docs Information Architecture
- [ ] 1.1 新增 `docs/README.md`（docs 总索引：面向人类与 AI 的入口链接集合）
- [ ] 1.2 新增 `docs/ai/AI_CONTEXT.md`（AI 必读入口：项目概况/入口/近期变更/禁忌）
- [ ] 1.3 新增 `docs/ai/AI_GUIDE.md`（AI 协作指南：变更门禁、测试、文档维护流程）

## 2. Migrate Existing Docs (Keep stubs)
- [ ] 2.1 迁移 `docs/NEWS_VIEWER_GUIDE.md` -> `docs/guides/viewer.md`
- [ ] 2.2 迁移 `docs/RSS_AI_CLASSIFICATION.md` -> `docs/guides/rss-ai-classification.md`
- [ ] 2.3 迁移 `docs/HOW_TO_CHECK_AI_STATUS.md` -> `docs/runbooks/ai-status.md`
- [ ] 2.4 迁移 `docs/FIX_ENCODING_ISSUE.md` -> `docs/runbooks/fix-encoding.md`
- [ ] 2.5 迁移 `docs/METAGPT_DEV_GUIDE.md` -> `docs/dev/metagpt.md`
- [ ] 2.6 在旧路径保留 stub 文档（只写“已迁移到新路径”+链接），避免断链
- [ ] 2.7 更新 docs 内部相互引用链接，确保新路径自洽

## 3. Update References (Repo-wide)
- [ ] 3.1 更新 `metagpt-dev.sh` 引用：从 `docs/METAGPT_DEV_GUIDE.md` 指向新路径
- [ ] 3.2 更新 docs 互链引用（例如 runbook 指向 guide）
- [ ] 3.3 扫描并更新 README/openspec/脚本中对旧 docs 路径的引用（如存在）

## 4. Keep OpenSpec Authority (No relocation)
- [ ] 4.1 保持 `openspec/AGENTS.md` 位置不变
- [ ] 4.2 在 `openspec/AGENTS.md` 顶部增加指向 `docs/ai/AI_CONTEXT.md` 的入口链接

## 5. Multi-entry Tool Compatibility
- [ ] 5.1 新增 `CLAUDE.md`：指向 `docs/ai/AI_CONTEXT.md` + `openspec/AGENTS.md`
- [ ] 5.2 新增 `WINDSURF.md`：指向 `docs/ai/AI_CONTEXT.md` + `openspec/AGENTS.md`
- [ ] 5.3 新增 `CURSOR.md`：指向 `docs/ai/AI_CONTEXT.md` + `openspec/AGENTS.md`
- [ ] 5.4（可选）在 `README.md`/`CONTRIBUTING.md` 增加“AI Assistants”入口链接（不复制规则，只链接）

## 6. Verification
- [ ] 6.1 用 Claude Code 开新会话，验证能被入口引导阅读 `docs/ai/AI_CONTEXT.md`
- [ ] 6.2 用 Windsurf 开新会话，验证同上
- [ ] 6.3 用 VSCode Claude 开新会话，验证同上
- [ ] 6.4 验证旧 docs 路径仍可访问（stub 生效，不 404），且能跳转到新路径
