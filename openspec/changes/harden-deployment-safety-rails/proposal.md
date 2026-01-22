# Change: 加固部署安全护栏（架构匹配 + 远程执行预检）

## Why
最近一次部署中出现了两个高风险问题：
- 本地默认构建为 `linux/arm64`（macOS），服务器为 `linux/amd64`，导致镜像可被传输但运行异常，`/health` 失败，线上服务中断。
- SSH 命令中嵌套复杂引号/Here-string 容易被本地 shell 解析破坏，重复失败导致频繁重启/中断线上服务，影响非常大。

需要把这些经验固化为 OpenSpec 的硬性规则（MUST），并形成可验证的预检步骤与最低风险的执行方式。

## What Changes
- 增加部署硬性规则：部署前必须校验目标服务器架构，并确保发布镜像与其一致。
- 增加远程执行硬性规则：禁止“复杂引号拼接的一次性 SSH 命令”直接做破坏性操作；必须先做 preflight 再执行。
- 明确“最小中断”部署原则：未确认新镜像可用/健康前，不得停止现有服务。

## Impact
- Affected specs:
  - `deployment`（新增 deployment safety rails 的 requirements）
- Affected code (expected):
  - `sync-to-server.sh`（后续实现阶段：加入 preflight 检查与安全执行方式）
