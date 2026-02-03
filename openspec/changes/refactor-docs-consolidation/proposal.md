# Change: 统一文档管理结构

## Why
目前 hotnews 有三套文档系统，造成混乱：
- `docs/` - 传统文档（27+ proposals、12+ fixes、7+ guides）
- `.kiro/specs/` - Kiro 生成的 7 个 specs
- `openspec/` - OpenSpec 的 specs 和 changes

AI 和开发者都难以找到正确的参考文档，导致重复工作和不一致。

## What Changes

### 1. 确立 OpenSpec 为唯一的规格管理系统
- `openspec/specs/` - 已实现功能的规格（真相来源）
- `openspec/changes/` - 进行中的变更提案

### 2. 迁移 .kiro/specs 到 openspec/specs
- 将 7 个 Kiro specs 转换为 OpenSpec 格式
- 删除 `.kiro/specs/` 目录

### 3. 整理 docs/ 目录
保留：
- `docs/guides/` - 用户指南（如何使用）
- `docs/ai/` - AI 上下文文档

归档或删除：
- `docs/proposals/` → 已完成的迁移到 `openspec/changes/archive/`，未完成的转为 openspec changes
- `docs/fixes/` → 已解决的删除，有价值的整理到 guides
- `docs/ui/` → mockup 保留，分析文档删除

### 4. 新的文档结构
```
hotnews/
├── README.md              # 项目入口
├── docs/
│   ├── guides/            # 用户指南（如何使用）
│   └── ai/                # AI 上下文（给 AI 看的）
├── openspec/
│   ├── config.yaml        # 项目配置
│   ├── specs/             # 已实现功能规格
│   │   ├── auth/
│   │   ├── crawler/
│   │   ├── publisher/
│   │   └── ...
│   └── changes/           # 变更提案
│       ├── [active]/
│       └── archive/
└── .kiro/
    └── steering/          # Kiro steering 规则（保留）
```

## Non-goals
- 不改变代码结构
- 不迁移 README.md
- 不删除 .kiro/steering/（这是 Kiro 的配置）

## Impact
- 受影响目录：`docs/`、`.kiro/specs/`、`openspec/specs/`
- 工作量：约 4-6 小时
- 风险：低（只是文档整理）
