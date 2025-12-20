## ADDED Requirements

### Requirement: 部署前必须校验镜像架构与服务器架构一致
系统 MUST 在执行任何可能影响线上服务可用性的部署动作（例如停止容器、替换 `.env`、重启服务）之前，完成以下校验：
- 目标服务器架构（例如 `linux/amd64`）
- 待部署镜像架构（例如 `linux/arm64` / `linux/amd64`）

若架构不匹配，系统 MUST 中止部署流程，并且 MUST 保持线上现有服务不受影响。

#### Scenario: 架构匹配，允许继续部署
- **WHEN** server 架构为 `linux/amd64` 且待部署镜像架构为 `linux/amd64`
- **THEN** 部署流程允许进入后续阶段（同步/传输/重启）

#### Scenario: 架构不匹配，必须阻止部署且不影响线上
- **WHEN** server 架构为 `linux/amd64` 且待部署镜像架构为 `linux/arm64`
- **THEN** 部署流程必须终止
- **AND THEN** 线上服务必须保持可用（旧容器/旧版本不被停止）

### Requirement: 远程执行必须先预检再执行（避免破坏性失败）
系统 MUST 将部署执行拆分为“只读预检阶段”和“可回滚执行阶段”。

预检阶段至少 MUST 覆盖：
- SSH 连通性
- server 运行环境能力（docker / compose 可用性）
- 镜像可用性（在线 pull 可达或离线镜像已准备）

#### Scenario: 预检失败，不得进入执行阶段
- **WHEN** 预检发现任一关键条件不满足（例如无法访问 Docker Hub 且未启用离线模式）
- **THEN** 部署流程必须终止
- **AND THEN** 不得执行任何会导致线上中断的动作（不得停止/删除旧容器）

### Requirement: 远程执行不得依赖复杂 shell 引号拼接
系统 MUST 避免使用依赖本地 shell/远端 shell 解析差异的复杂单行 SSH 命令来执行部署。
系统 MUST 使用脚本化方式执行远程动作（例如 `ssh ... bash -s` 且 heredoc 使用单引号保护，或先上传脚本文件再执行）。

#### Scenario: 执行方式安全可重放
- **WHEN** 执行部署操作
- **THEN** 远程命令不依赖多层引号拼接
- **AND THEN** 重复执行不会因本地 shell 解析差异而改变语义

### Requirement: 失败时必须最小中断并可回滚
系统 MUST 确保：在确认新版本已成功启动且健康检查通过之前，不会停止线上旧服务。
若执行阶段失败，系统 MUST 提供明确的回滚路径（例如恢复 `.env.prev` 并重启旧版本）。

#### Scenario: 新版本未通过健康检查
- **WHEN** 新版本启动后健康检查失败
- **THEN** 系统不得继续切断旧服务
- **AND THEN** 系统必须提供回滚操作指引（或自动回滚）
