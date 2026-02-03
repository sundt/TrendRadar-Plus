## 1. 迁移 Kiro Specs 到 OpenSpec
- [x] 1.1 分析 .kiro/specs/ 下 7 个 spec 的内容
- [x] 1.2 转换为 OpenSpec 格式并放入 openspec/specs/
- [x] 1.3 删除 .kiro/specs/ 目录

## 2. 整理 docs/proposals/
- [x] 2.1 识别已完成的 proposals（对应已实现功能）
- [x] 2.2 将已完成的转为 openspec/specs/ 或归档
- [x] 2.3 将未完成的转为 openspec/changes/
- [x] 2.4 删除 docs/proposals/ 目录

## 3. 整理 docs/fixes/
- [x] 3.1 识别有长期价值的 fix 文档
- [x] 3.2 有价值的整理到 docs/guides/
- [x] 3.3 删除过时的 fix 文档
- [x] 3.4 删除 docs/fixes/ 目录

## 4. 整理 docs/ui/
- [x] 4.1 保留 mockup HTML 文件
- [x] 4.2 删除过时的分析文档
- [x] 4.3 如果目录为空则删除

## 5. 更新引用
- [x] 5.1 更新 openspec/config.yaml 中的文档引用
- [x] 5.2 更新 .kiro/steering/project-context.md
- [x] 5.3 更新 README.md 中的文档链接（如有）

## 6. 验证
- [x] 6.1 运行 openspec validate --strict
- [x] 6.2 确认 AI 能正确读取新的文档结构

---

## 完成总结

**迁移完成时间**: 2026-02-03

**最终文档结构**:
```
hotnews/
├── docs/
│   ├── ai/           # AI 上下文文档
│   ├── dev/          # 开发文档
│   └── guides/       # 用户指南
├── openspec/
│   ├── config.yaml   # 项目配置
│   ├── specs/        # 8 个功能规格
│   └── changes/
│       ├── add-publisher-editor/  # 发布系统（进行中）
│       ├── archive/legacy-proposals/  # 24 个归档文档
│       └── [其他活跃变更]
└── .kiro/
    └── steering/     # Kiro 引导规则
```

**已删除目录**:
- `.kiro/specs/` → 迁移到 `openspec/specs/`
- `docs/proposals/` → 迁移到 `openspec/changes/`
- `docs/fixes/` → 合并到 `docs/guides/`
- `docs/ui/` → 删除（空目录）
