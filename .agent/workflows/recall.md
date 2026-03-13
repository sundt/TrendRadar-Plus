---
description: 从 Qdrant 向量数据库召回与当前话题相关的历史记忆
---

## 使用场景

在新窗口开始时，或讨论一个可能有历史上下文的话题时调用。

## 步骤

1. 根据用户当前的话题或请求，构造一个简短的查询关键词（中文）。

2. 运行召回命令：
// turbo
   ```bash
   python3 /Users/sun/Downloads/project/hotnews/.agent/scripts/memory_recall.py "查询关键词"
   ```

3. 如果需要查看所有记忆：
// turbo
   ```bash
   python3 /Users/sun/Downloads/project/hotnews/.agent/scripts/memory_recall.py --all
   ```

4. 将召回的记忆作为背景知识，融入后续的回答中。不要逐条念给用户听，而是自然地运用这些知识。
