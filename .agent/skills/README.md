# 🛠️ Hotnews Skills

本目录包含用于扩展 AI 助手能力的 Skills。

## 什么是 Skill？

Skill 是一组指令、脚本和资源的集合，帮助 AI 助手更好地理解和执行特定任务。

## Skill 目录结构

本项目采用**混合管理模式**，包含项目专属、全局引用、社区引用和共享标准四部分。

```
.agent/skills/
├── README.md
├── _claude_global/ → ~/.claude/skills            # 🔗 Claude 官方 Skills
├── _community/ → ~/.claude/skills-community      # 🌍 社区 awesome-claude-skills
├── _shared/                                      # 📚 团队共享标准与规范
│   ├── standards/
│   └── guides/
└── project/                                      # 🛠️ 项目专属 Skills
    ├── deploy/
    ├── create-scraper/
    └── local-dev/
```

## 可用的 Skills

### 🛠️ 项目专属
针对本项目的具体业务逻辑定制。

| Skill | 描述 | 使用场景 |
|-------|------|----------|
| [deploy](./project/deploy/SKILL.md) | 部署应用到服务器 | 日常（自动）、重大更新（需确认） |
| [create-scraper](./project/create-scraper/SKILL.md) | 创建新闻源爬虫 | 添加新的数据源 |
| [local-dev](./project/local-dev/SKILL.md) | 本地开发环境 | 日常开发 |
| [cleanup-temp-files](./project/cleanup-temp-files/SKILL.md) | 清理临时测试文件 | 开发结束、提交代码前 |

### 🔗 Claude 官方引用
直接复用 Claude 本地安装的高质量 Skills。

- [frontend-design](./_claude_global/frontend-design/SKILL.md) - 前端设计规范
- [webapp-testing](./_claude_global/webapp-testing/SKILL.md) - Web 应用测试
- [mcp-builder](./_claude_global/mcp-builder/SKILL.md) - MCP 服务构建

### 🌍 社区 Skills 引用
来自 [awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills)。

- [skill-creator](./_community/skill-creator/SKILL.md) - 创建新 Skill 的指南
- [mcp-builder](./_community/mcp-builder/SKILL.md) - MCP 服务构建
- [changelog-generator](./_community/changelog-generator/SKILL.md) - 自动生成变更日志
- [webapp-testing](./_community/webapp-testing/SKILL.md) - Web 应用测试

更新社区 Skills：`cd ~/.claude/skills-community && git pull`

### 📚 共享标准

- [conventions](./_shared/standards/conventions.md) - Skill 编写与引用规范
- [temp-file-management](./_shared/guides/temp-file-management.md) - 临时文件管理规范

## 如何添加新 Skill

1. **项目专用**: 在 `.agent/skills/project/` 下创建新目录
2. **团队通用**: 添加到 `.agent/skills/_shared/`
3. **官方引用**: 通过 `_claude_global` 访问
4. **社区引用**: 通过 `_community` 访问
