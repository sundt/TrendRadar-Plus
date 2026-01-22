## Context
当前部署脚本会同时做“同步文件 + 重启服务”，一旦网络/镜像/命令执行失败，可能在错误的时间点停止线上容器，造成服务中断。近期实际发生过：
- macOS 默认构建 `linux/arm64` 镜像，目标服务器为 `linux/amd64`，镜像可传输但运行异常，`/health` 失败。
- SSH 命令中嵌套复杂引号/多层命令，导致本地 shell 与远端 shell 的解析差异，引发多次失败与线上不稳定。

## Goals / Non-Goals
- Goals:
  - 将“架构匹配”和“远程执行安全性”固化为 MUST 级规则。
  - 部署前必须有可重复的 preflight 检测；失败必须不影响线上现有服务。
  - 执行阶段必须可回滚，且最小中断。
- Non-Goals:
  - 不在本 change 中引入复杂的蓝绿发布/流量切换（可以作为后续增强）。

## Decisions
- Decision: 以“预检（只读）→ 执行（可回滚）”两阶段组织部署流程。
- Decision: 架构检测以 server 的 `docker info --format '{{.Architecture}}'` 或 `uname -m` 为准；本地镜像以 `docker image inspect --format '{{.Architecture}}'` 为准。
- Decision: 避免依赖本地 shell 引号语义的长命令，优先使用 `ssh ... bash -s` 的脚本化方式，或先 `copy_files` 上传脚本到 server 再运行。

## Risks / Trade-offs
- 风险：增加预检步骤导致部署流程更“严格” → 以减少线上中断为第一优先级。
- 风险：server 网络不稳定/无法拉取 Docker Hub → 明确要求离线部署或中止。

## Migration Plan
- 增量引入：先在规范中明确 MUST 规则，再逐步把这些规则落地到 `sync-to-server.sh` 的 preflight。
- 回滚：保留 `.env.prev` 并提供一键回滚路径；任何失败必须输出回滚指令。
