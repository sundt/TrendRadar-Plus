---
description: 存储本次对话的关键记忆到 Qdrant 向量数据库，供未来会话召回
---

## 使用场景

在完成一个任务或重要讨论后，调用此 workflow 将关键信息持久化。

## 步骤

1. **总结本次对话的关键信息**，提取以下类型的记忆：
   - 做出的技术决策及原因
   - 发现的 bug 和解决方案
   - 架构变更或新增功能
   - 服务器/部署相关的经验
   - 用户的偏好和习惯

2. 将每条记忆作为独立的一行，写入临时文件 `/tmp/ide_memories.txt`。每条记忆应该是一个**自包含的陈述**，不依赖上下文就能理解。

   示例格式：
   ```
   hotnews 搜索系统使用 FAISS + FTS5 混合搜索，通过 RRF 算法融合结果
   生产服务器配置为 2G/2核，不适合跑本地 embedding 模型，改用百炼 API
   Docker volume mount 顺序很重要，后挂载的会覆盖先挂载的文件
   ```

3. 运行批量存储命令：
// turbo
   ```bash
   python3 /Users/sun/Downloads/project/hotnews/.agent/scripts/memory_store.py --batch /tmp/ide_memories.txt
   ```

4. 确认存储结果，报告存储了多少条记忆。
