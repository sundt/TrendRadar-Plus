---
name: local-dev
description: 本地开发环境设置与运行
---

# 本地开发环境

## 概述
本 Skill 指导如何设置和运行 hotnews 本地开发环境。

## 环境要求
- Python 3.11+
- Node.js 18+（可选，用于前端开发）
- Redis（用于缓存）
- 推荐使用 uv 包管理器

## 快速开始

// turbo-all

### 1. 安装 Python 依赖
```bash
cd /Users/sun/Downloads/hotnews
uv sync
```

### 2. 配置环境变量
复制 `.env.example` 为 `.env` 并配置必要的环境变量：
- `REDIS_URL`: Redis 连接地址
- `SECRET_KEY`: 应用密钥
- `ADMIN_PASSWORD`: 管理员密码

### 3. 启动开发服务器
```bash
uv run python -m hotnews.main
```

### 4. 访问应用
- 前端: http://localhost:8000
- Admin: http://localhost:8000/admin

## 常用开发命令

### 运行测试
```bash
uv run pytest tests/
```

### 代码格式化
```bash
uv run ruff format .
```

### 代码检查
```bash
uv run ruff check .
```

## Docker 本地开发

### 构建镜像
```bash
docker compose build
```

### 启动服务
```bash
docker compose up
```

## 目录结构说明
- `hotnews/` - 主应用代码
- `hotnews/kernel/` - 核心业务逻辑（子模块）
- `hotnews/web/` - Web 前端资源
- `mcp_server/` - MCP 服务
- `tests/` - 测试代码
- `scripts/` - 辅助脚本
