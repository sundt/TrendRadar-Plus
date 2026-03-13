#!/usr/bin/env python3
"""
IDE 记忆召回脚本（本地文件版）

从本地文件中语义搜索相关记忆。
文本在 memories.json，向量在 vectors.bin。

用法:
    python3 memory_recall.py "搜索架构"
    python3 memory_recall.py --top 10 "部署"
    python3 memory_recall.py --all          # 列出所有记忆
"""

import json
import math
import pickle
import sys
from pathlib import Path
import urllib.request

# ============================================
# 配置
# ============================================
SCRIPT_DIR = Path(__file__).resolve().parent
MEMORY_DIR = SCRIPT_DIR.parent / "memory"
MEMORY_FILE = MEMORY_DIR / "memories.json"
VECTOR_FILE = MEMORY_DIR / "vectors.bin"

# 百炼 Embedding API
DASHSCOPE_API_KEY = "sk-9e2a453cfef44f6cb0b9982764c82ce5"
EMBEDDING_MODEL = "text-embedding-v4"
EMBEDDING_DIMS = 1024
EMBEDDING_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"

DEFAULT_TOP_K = 5
DEFAULT_THRESHOLD = 0.3


def load_memories() -> list:
    if not MEMORY_FILE.exists():
        return []
    with open(MEMORY_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def load_vectors() -> dict:
    if not VECTOR_FILE.exists():
        return {}
    with open(VECTOR_FILE, "rb") as f:
        return pickle.load(f)


def get_embedding(text: str) -> list:
    url = f"{EMBEDDING_BASE_URL}/embeddings"
    payload = {
        "model": EMBEDDING_MODEL,
        "input": [text],
        "dimensions": EMBEDDING_DIMS,
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {DASHSCOPE_API_KEY}",
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    return data["data"][0]["embedding"]


def cosine_similarity(a: list, b: list) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def recall_memories(query: str, top_k: int = DEFAULT_TOP_K, threshold: float = DEFAULT_THRESHOLD) -> list:
    memories = load_memories()
    vectors = load_vectors()
    if not memories or not vectors:
        return []

    query_vec = get_embedding(query)

    scored = []
    for m in memories:
        mid = m["id"]
        if mid not in vectors:
            continue
        score = cosine_similarity(query_vec, vectors[mid])
        if score >= threshold:
            scored.append({
                "score": round(score, 4),
                "memory": m["data"],
                "created": m.get("createdAt", ""),
            })

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:top_k]


def list_all_memories() -> list:
    return [
        {"id": m["id"], "memory": m["data"], "created": m.get("createdAt", "")}
        for m in load_memories()
    ]


def main():
    args = sys.argv[1:]
    if not args:
        print("用法: python3 memory_recall.py \"查询内容\"")
        print("      python3 memory_recall.py --top 10 \"查询\"")
        print("      python3 memory_recall.py --all")
        sys.exit(1)

    if "--all" in args:
        memories = list_all_memories()
        if not memories:
            print("暂无记忆")
            return
        print(f"=== 共 {len(memories)} 条记忆 ===\n")
        for i, m in enumerate(memories, 1):
            print(f"{i}. [{m['created'][:10]}] {m['memory']}")
        return

    top_k = DEFAULT_TOP_K
    threshold = DEFAULT_THRESHOLD

    if "--top" in args:
        idx = args.index("--top")
        top_k = int(args[idx + 1])
        args = args[:idx] + args[idx + 2:]

    if "--threshold" in args:
        idx = args.index("--threshold")
        threshold = float(args[idx + 1])
        args = args[:idx] + args[idx + 2:]

    query = " ".join(args)
    if not query:
        print("请指定查询内容")
        sys.exit(1)

    results = recall_memories(query, top_k=top_k, threshold=threshold)

    if not results:
        print(f"没有找到与 \"{query}\" 相关的记忆 (threshold={threshold})")
        return

    print(f"=== 找到 {len(results)} 条相关记忆 (query: \"{query}\") ===\n")
    for i, r in enumerate(results, 1):
        print(f"{i}. [相似度:{r['score']}] [{r['created'][:10]}] {r['memory']}")


if __name__ == "__main__":
    main()
