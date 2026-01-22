# Tasks: Simplify Category Settings Modal

## 1. Proposal Artifacts
- [ ] 1.1 确认 `proposal.md` 覆盖需求：删“栏目管理”、删“一键开闭”、降低高度、默认收起栏目列表
- [ ] 1.2 编写 `specs/viewer-categories/spec.md`（本变更的 UX 行为要求与验收场景）
- [ ] 1.3 运行 `openspec validate update-category-settings-modal-simplify --strict` 并修复问题

## 2. UI/UX Implementation (after approval)
- [ ] 2.1 `viewer.html` 移除“📋 栏目管理”文案
- [ ] 2.2 `viewer.html` 移除“一键开闭”开关与文字
- [ ] 2.3 `viewer.css` 调低栏目设置弹窗高度（max-height / 布局占比）并降低弹窗 header 高度/内边距
- [ ] 2.4 `settings.js` 打开栏目设置时默认收起栏目列表（按钮文案与折叠状态一致）

## 3. Tests (after approval)
- [ ] 3.1 更新/补充 `tests/e2e/category-settings.spec.ts` 覆盖打开弹窗默认折叠行为
- [ ] 3.2 运行 `npm test` 并修复所有失败
