## ADDED Requirements

### Requirement: Unified Documentation Structure
项目文档 SHALL 遵循统一的结构，以 OpenSpec 为规格管理的唯一来源。

#### Scenario: Developer finds feature specification
- **WHEN** 开发者需要了解某功能的规格
- **THEN** 在 `openspec/specs/[capability]/spec.md` 中找到

#### Scenario: Developer creates new feature proposal
- **WHEN** 开发者要提出新功能
- **THEN** 在 `openspec/changes/` 下创建 proposal

#### Scenario: AI reads project context
- **WHEN** AI 需要了解项目背景
- **THEN** 读取 `openspec/config.yaml` 和 `docs/ai/` 目录
