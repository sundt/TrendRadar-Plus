## ADDED Requirements

### Requirement: 小改动部署前必须选择部署路径（A 或 C）
系统 MUST 在执行部署前，基于变更类型提示用户选择部署路径：
- **A（热修补）**：用于 UI/模板/静态资源的小改动
- **C（标准发布）**：用于涉及依赖/后端逻辑/镜像变更的发布

#### Scenario: 小改动必须提示选择
- **WHEN** 变更仅涉及 UI/模板/静态资源
- **THEN** 系统必须提示用户选择 A 或 C

#### Scenario: 用户选择 A
- **WHEN** 用户选择 A
- **THEN** 系统按热修补路径执行，并尽量避免构建/传输完整镜像

#### Scenario: 用户选择 C
- **WHEN** 用户选择 C
- **THEN** 系统按标准发布路径执行（CI+镜像仓库或离线镜像），并执行健康检查

### Requirement: A 热修补必须可回滚且不破坏线上服务
系统 MUST 在热修补前保存服务器端可回滚的备份（例如 `.bak` 或 `.prev`），并在失败时能够恢复。

#### Scenario: 热修补成功
- **WHEN** 将模板/静态文件热修补到线上
- **THEN** 页面更新应在 1 分钟内生效

#### Scenario: 热修补失败回滚
- **WHEN** 热修补失败
- **THEN** 系统必须回滚到热修补前状态
- **AND THEN** 线上服务必须保持可用

### Requirement: C 标准发布必须基于服务器可运行架构构建镜像
系统 MUST 确保标准发布的镜像架构与目标服务器一致（例如生产为 `linux/amd64`）。

#### Scenario: CI 构建正确架构
- **WHEN** 执行标准发布
- **THEN** CI 必须产出 `linux/amd64` 镜像并推送到服务器可访问仓库

### Requirement: 本地必须提供一键刷新 Viewer（build + force-recreate + health check）
系统 MUST 提供一个本地一键命令，用于在修改 viewer 相关代码/模板/配置后，自动完成：
- 重新构建 viewer 镜像
- 以 `up --force-recreate` 方式重启 viewer（默认行为）
- 进行 `/health` 健康检查

#### Scenario: 本地刷新无需手动重启
- **WHEN** 用户执行本地一键刷新命令
- **THEN** viewer 容器必须被重建或重启（force-recreate）
- **AND THEN** `/health` 必须通过

#### Scenario: 本地刷新失败输出日志
- **WHEN** 本地一键刷新命令的 health check 失败
- **THEN** 命令必须输出 viewer 容器的日志（tail）以便排查

#### Scenario: 可选触发 provider ingestion
- **WHEN** 用户启用“本地刷新后触发 provider ingestion”的选项
- **THEN** 系统必须在 viewer 重启后执行一次 provider ingestion 并输出 metrics 摘要
