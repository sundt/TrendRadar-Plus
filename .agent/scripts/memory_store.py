#!/usr/bin/env python3
"""
IDE 记忆存储脚本（本地文件版）

存储结构：
  - memories.json: 纯文本记忆（人类可读，AI 可直接读取）
  - vectors.bin:   embedding 向量（二进制，仅脚本使用，不消耗 token）

用法:
    python3 memory_store.py "要存储的记忆内容"
    python3 memory_store.py --batch memories.txt   # 批量存储，每行一条
"""

import hashlib
import json
import os
import pickle
import sys
import time
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

# ============================================
# 配置
# ============================================
SCRIPT_DIR = Path(__file__).resolve().parent
MEMORY_DIR = SCRIPT_DIR.parent / "memory"
MEMORY_FILE = MEMORY_DIR / "memories.json"    # 纯文本，人类可读
VECTOR_FILE = MEMORY_DIR / "vectors.bin"      # 向量数据，二进制

# 百炼 Embedding API
DASHSCOPE_API_KEY = "sk-9e2a453cfef44f6cb0b9982764c82ce5"
EMBEDDING_MODEL = "text-embedding-v4"
EMBEDDING_DIMS = 1024
EMBEDDING_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"


def ensure_memory_dir():
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)


def load_memories() -> list:
    """加载文本记忆"""
    if not MEMORY_FILE.exists():
        return []
    with open(MEMORY_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def load_vectors() -> dict:
    """加载向量数据 {id: vector}"""
    if not VECTOR_FILE.exists():
        return {}
    with open(VECTOR_FILE, "rb") as f:
        return pickle.load(f)


def save_memories(memories: list):
    ensure_memory_dir()
    with open(MEMORY_FILE, "w", encoding="utf-8") as f:
        json.dump(memories, f, ensure_ascii=False, indent=2)


def save_vectors(vectors: dict):
    ensure_memory_dir()
    with open(VECTOR_FILE, "wb") as f:
        pickle.dump(vectors, f)


def get_embedding(text: str) -> list:
    """调用百炼 API 获取文本 embedding"""
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


def text_hash(text: str) -> str:
    return hashlib.md5(text.strip().encode()).hexdigest()


def store_memory(text: str) -> dict:
    """存储一条记忆"""
    text = text.strip()
    if not text:
        return {"status": "skipped", "reason": "empty text"}

    memories = load_memories()
    vectors = load_vectors()

    # 去重
    h = text_hash(text)
    for m in memories:
        if m.get("hash") == h:
            return {"status": "skipped", "reason": "duplicate", "hash": h}

    # Embedding
    vector = get_embedding(text)

    # 存文本记忆
    memory_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    memories.append({
        "id": memory_id,
        "data": text,
        "hash": h,
        "createdAt": now,
    })
    save_memories(memories)

    # 存向量（单独文件）
    vectors[memory_id] = vector
    save_vectors(vectors)

    return {"status": "stored", "id": memory_id, "hash": h}


def store_batch(texts: list) -> list:
    results = []
    for i, text in enumerate(texts):
        text = text.strip()
        if not text or text.startswith("#"):
            continue
        try:
            result = store_memory(text)
            results.append({"text": text[:60] + "..." if len(text) > 60 else text, **result})
            print(f"  [{i+1}/{len(texts)}] {result['status']}: {text[:80]}")
        except Exception as e:
            results.append({"text": text[:60], "status": "error", "error": str(e)})
            print(f"  [{i+1}/{len(texts)}] error: {e}")
        if result.get("status") == "stored":
            time.sleep(0.2)
    return results


def main():
    if len(sys.argv) < 2:
        print("用法: python3 memory_store.py \"记忆内容\"")
        print("      python3 memory_store.py --batch file.txt")
        sys.exit(1)

    if sys.argv[1] == "--batch":
        if len(sys.argv) < 3:
            print("请指定文件路径")
            sys.exit(1)
        with open(sys.argv[2], "r") as f:
            texts = [line.strip() for line in f if line.strip()]
        print(f"批量存储 {len(texts)} 条记忆...")
        results = store_batch(texts)
        stored = sum(1 for r in results if r["status"] == "stored")
        skipped = sum(1 for r in results if r["status"] == "skipped")
        print(f"\n完成: {stored} 条已存储, {skipped} 条已跳过")
    else:
        text = " ".join(sys.argv[1:])
        result = store_memory(text)
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
