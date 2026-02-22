#!/usr/bin/env python3
"""
Phase 1: 标签数据清洗脚本
- 合并重复标签
- 注册高频孤儿标签
- 修正 parent_id 归属
- 统计清洗结果

用法: docker exec hotnews python3 /app/scripts/tag_cleanup.py [--dry-run]
"""

import sqlite3
import sys
import time

DRY_RUN = "--dry-run" in sys.argv

DB_PATH = "/app/output/online.db"
NOW = int(time.time())


def log(msg):
    print(f"  {msg}")


def run():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")

    stats = {"merged": 0, "registered": 0, "reparented": 0, "errors": []}

    # ---------------------------------------------------------------
    # 1. 合并重复标签
    # ---------------------------------------------------------------
    print("\n=== 1. 合并重复标签 ===")

    # old_id -> new_id (产品级)
    MERGE_MAP = {
        "glm_5": "glm",
        "glm5": "glm",
        "glm_ocr": "glm",
        "kimi_k2_5": "kimi",
        "kimi_k2.5": "kimi",
        "seedance_2_0": "seedance",
        "seedance_2.0": "seedance",
        "doubao_2.0": "doubao",
        "embodied_intelligence": "embodied_ai",
        "deepseek_ocr2": "deepseek",
        "deepseek_v4": "deepseek",
        "claude_opus_4_6": "claude",
        "claude_cowork": "claude",
        "gpt_5_2": "gpt",
        "gpt_5_3_codex": "gpt",
        "gemini_3": "gemini",
        "gemini_3_1_pro": "gemini",
        "qwen3": "qwen",
        "qwen3_5": "qwen",
        "qwen3_max_thinking": "qwen",
        "minimax_m2_5": "minimax",
    }

    for old_id, new_id in MERGE_MAP.items():
        # Count affected rows
        cur = conn.execute(
            "SELECT COUNT(*) FROM rss_entry_tags WHERE tag_id = ?", (old_id,)
        )
        count = cur.fetchone()[0]
        if count == 0:
            continue

        log(f"MERGE: {old_id} -> {new_id} ({count} records)")

        if not DRY_RUN:
            # Update tag_id, ignore UNIQUE conflicts
            conn.execute(
                "UPDATE OR IGNORE rss_entry_tags SET tag_id = ? WHERE tag_id = ?",
                (new_id, old_id),
            )
            # Delete remaining old records (UNIQUE conflict means new_id already exists)
            conn.execute(
                "DELETE FROM rss_entry_tags WHERE tag_id = ?", (old_id,)
            )
            # Disable old tag in tags table
            conn.execute(
                "UPDATE tags SET enabled = 0 WHERE id = ?", (old_id,)
            )
        stats["merged"] += count

    # ---------------------------------------------------------------
    # 2. 注册高频孤儿标签
    # ---------------------------------------------------------------
    print("\n=== 2. 注册高频孤儿标签 ===")

    ORPHAN_REGISTRATIONS = [
        # (id, name, name_en, type, parent_id)
        ("energy", "能源", "Energy", "topic", "science"),
        ("space", "航天", "Space", "topic", "science"),
        ("agriculture", "农业", "Agriculture", "topic", "science"),
        ("biotech", "生物科技", "Biotech", "topic", "science"),
        ("telecom", "通信", "Telecom", "topic", "tech"),
        ("regulation", "监管政策", "Regulation", "topic", "business"),
        ("policy", "政策", "Policy", "topic", "business"),
        ("infrastructure", "基础设施", "Infrastructure", "topic", "business"),
        ("manufacturing", "制造业", "Manufacturing", "topic", "business"),
        ("transportation", "交通", "Transportation", "topic", "lifestyle"),
        ("retail", "零售", "Retail", "topic", "business"),
        ("pharma", "医药", "Pharma", "topic", "health"),
        ("logistics", "物流", "Logistics", "topic", "business"),
        ("social_media", "社交媒体", "Social Media", "topic", "tech"),
        ("public_health", "公共卫生", "Public Health", "topic", "health"),
        ("culture", "文化", "Culture", "topic", "lifestyle"),
        ("geopolitics", "地缘政治", "Geopolitics", "topic", "business"),
        ("trade", "贸易", "Trade", "topic", "business"),
        ("law", "法律", "Law", "topic", "business"),
        ("media", "媒体", "Media", "topic", "entertainment"),
        ("healthcare", "医疗", "Healthcare", "topic", "health"),
        ("tourism", "旅游", "Tourism", "topic", "lifestyle"),
        ("bond", "债券", "Bond", "topic", "finance"),
        ("film", "电影", "Film", "topic", "entertainment"),
        ("weather", "天气", "Weather", "topic", "lifestyle"),
        ("literature", "文学", "Literature", "topic", "education"),
        ("government", "政务", "Government", "topic", "business"),
        ("commodities", "大宗商品", "Commodities", "topic", "finance"),
        ("os", "操作系统", "OS", "topic", "tech"),
        ("psychology", "心理学", "Psychology", "topic", "health"),
        # 产品/公司级标签（在 tags 表中注册但可能缺失）
        ("gpt", "GPT", "GPT", "topic", "ai_ml"),
        ("glm", "GLM", "GLM", "topic", "ai_ml"),
    ]

    for tag_id, name, name_en, tag_type, parent_id in ORPHAN_REGISTRATIONS:
        # Check if already exists
        cur = conn.execute("SELECT id FROM tags WHERE id = ?", (tag_id,))
        if cur.fetchone():
            continue

        # Check usage count
        cur = conn.execute(
            "SELECT COUNT(*) FROM rss_entry_tags WHERE tag_id = ?", (tag_id,)
        )
        usage = cur.fetchone()[0]

        log(f"REGISTER: {tag_id} ({name}) parent={parent_id} usage={usage}")

        if not DRY_RUN:
            conn.execute(
                """INSERT OR IGNORE INTO tags
                   (id, name, name_en, type, parent_id, icon, color, description,
                    sort_order, enabled, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, '', '', '', 0, 1, ?, ?)""",
                (tag_id, name, name_en, tag_type, parent_id, NOW, NOW),
            )
        stats["registered"] += 1

    # ---------------------------------------------------------------
    # 3. 修正 parent_id 归属
    # ---------------------------------------------------------------
    print("\n=== 3. 修正 parent_id ===")

    REPARENT_MAP = {
        # AI 公司/产品 -> ai_ml
        "ai_ml": [
            "openai", "anthropic", "deepseek", "claude", "gemini", "xai",
            "zhipu", "minimax", "kimi", "qwen", "doubao", "grok", "codex",
            "stepfun", "tencent_yuanbao", "yuanbao", "gpt", "glm",
            "agentic_ai", "ai_agent", "agent_skills", "embodied_ai",
            "physical_ai", "ai_plus", "ai_education",
            "claude_code", "kimi_k2_5",
        ],
        # 机器人相关 -> robotics
        "robotics": [
            "humanoid_robot", "unitree", "optimus",
            "chunwan_robot", "lingbot_vla", "openclaw",
        ],
        # 芯片/硬件 -> hardware
        "hardware": [
            "semiconductor", "nvidia", "hbm4", "maia_200", "pingtouge",
        ],
        # 自动驾驶 -> autonomous_driving (先确保 autonomous_driving 本身 parent=tech)
        "autonomous_driving": [
            "robotaxi", "tesla_fsd", "cybercab",
        ],
    }

    # Ensure autonomous_driving itself has parent=tech
    if not DRY_RUN:
        conn.execute(
            "UPDATE tags SET parent_id = 'tech' WHERE id = 'autonomous_driving' AND parent_id != 'tech'"
        )

    for new_parent, tag_ids in REPARENT_MAP.items():
        for tag_id in tag_ids:
            cur = conn.execute(
                "SELECT parent_id FROM tags WHERE id = ?", (tag_id,)
            )
            row = cur.fetchone()
            if not row:
                continue
            old_parent = row[0] or ""
            if old_parent == new_parent:
                continue

            log(f"REPARENT: {tag_id}: {old_parent} -> {new_parent}")

            if not DRY_RUN:
                conn.execute(
                    "UPDATE tags SET parent_id = ?, updated_at = ? WHERE id = ?",
                    (new_parent, NOW, tag_id),
                )
            stats["reparented"] += 1

    # ---------------------------------------------------------------
    # Commit & Summary
    # ---------------------------------------------------------------
    if not DRY_RUN:
        conn.commit()
        print("\n✅ 已提交所有更改")
    else:
        print("\n⚠️  DRY RUN 模式，未做任何更改")

    print(f"\n=== 清洗结果 ===")
    print(f"  合并标签记录: {stats['merged']}")
    print(f"  注册孤儿标签: {stats['registered']}")
    print(f"  修正 parent:  {stats['reparented']}")

    # Verify
    print("\n=== 验证 ===")
    cur = conn.execute(
        "SELECT COUNT(DISTINCT t.tag_id) FROM rss_entry_tags t "
        "LEFT JOIN tags tg ON tg.id = t.tag_id WHERE tg.id IS NULL"
    )
    orphan_count = cur.fetchone()[0]
    print(f"  剩余孤儿标签: {orphan_count}")

    cur = conn.execute("SELECT COUNT(*) FROM tags WHERE enabled = 1 AND type = 'topic'")
    active_topics = cur.fetchone()[0]
    print(f"  活跃 topic 标签: {active_topics}")

    # Show parent hierarchy for ai_ml
    print("\n=== ai_ml 子标签层级 ===")
    cur = conn.execute(
        "SELECT id, name, parent_id FROM tags WHERE parent_id = 'ai_ml' AND enabled = 1 ORDER BY id"
    )
    for r in cur:
        print(f"  ai_ml -> {r[0]} ({r[1]})")

    conn.close()


if __name__ == "__main__":
    print(f"{'DRY RUN' if DRY_RUN else 'LIVE'} mode")
    print(f"Database: {DB_PATH}")
    run()
