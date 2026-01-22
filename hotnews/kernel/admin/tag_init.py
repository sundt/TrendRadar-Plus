# coding=utf-8
"""
Tag System Initialization

Presets the complete tag taxonomy for multi-label classification.
Run this script to initialize or reset tags in the database.
"""

import time
from pathlib import Path
from typing import List, Dict, Any

# Tag definitions following the implementation plan
PRESET_TAGS: List[Dict[str, Any]] = [
    # ==================== Categories (大类) - 互斥 ====================
    {"id": "tech", "name": "科技", "name_en": "Technology", "type": "category", "icon": "💻", "color": "#3B82F6", "sort_order": 1},
    {"id": "finance", "name": "财经", "name_en": "Finance", "type": "category", "icon": "💰", "color": "#F59E0B", "sort_order": 2},
    {"id": "business", "name": "商业", "name_en": "Business", "type": "category", "icon": "🏢", "color": "#8B5CF6", "sort_order": 3},
    {"id": "politics", "name": "政治", "name_en": "Politics", "type": "category", "icon": "🏛️", "color": "#EF4444", "sort_order": 4},
    {"id": "world", "name": "国际", "name_en": "World", "type": "category", "icon": "🌍", "color": "#10B981", "sort_order": 5},
    {"id": "entertainment", "name": "娱乐", "name_en": "Entertainment", "type": "category", "icon": "🎬", "color": "#EC4899", "sort_order": 6},
    {"id": "sports", "name": "体育", "name_en": "Sports", "type": "category", "icon": "⚽", "color": "#14B8A6", "sort_order": 7},
    {"id": "health", "name": "健康", "name_en": "Health", "type": "category", "icon": "🏥", "color": "#22C55E", "sort_order": 8},
    {"id": "science", "name": "科学", "name_en": "Science", "type": "category", "icon": "🔬", "color": "#6366F1", "sort_order": 9},
    {"id": "lifestyle", "name": "生活", "name_en": "Lifestyle", "type": "category", "icon": "🏠", "color": "#F97316", "sort_order": 10},
    {"id": "education", "name": "教育", "name_en": "Education", "type": "category", "icon": "📚", "color": "#0EA5E9", "sort_order": 11},
    {"id": "other", "name": "其他", "name_en": "Other", "type": "category", "icon": "📰", "color": "#6B7280", "sort_order": 99},

    # ==================== Topics (主题) - 科技类 ====================
    {"id": "ai_ml", "name": "AI/机器学习", "name_en": "AI/ML", "type": "topic", "parent_id": "tech", "icon": "🤖", "color": "#8B5CF6", "sort_order": 1},
    {"id": "llm", "name": "大语言模型", "name_en": "LLM", "type": "topic", "parent_id": "tech", "icon": "🧠", "color": "#A855F7", "sort_order": 2},
    {"id": "dev_tools", "name": "开发工具", "name_en": "Dev Tools", "type": "topic", "parent_id": "tech", "icon": "🛠️", "color": "#6366F1", "sort_order": 3},
    {"id": "programming", "name": "编程语言", "name_en": "Programming", "type": "topic", "parent_id": "tech", "icon": "💻", "color": "#3B82F6", "sort_order": 4},
    {"id": "database", "name": "数据库", "name_en": "Database", "type": "topic", "parent_id": "tech", "icon": "🗄️", "color": "#0EA5E9", "sort_order": 5},
    {"id": "cloud", "name": "云计算", "name_en": "Cloud", "type": "topic", "parent_id": "tech", "icon": "☁️", "color": "#06B6D4", "sort_order": 6},
    {"id": "cybersecurity", "name": "网络安全", "name_en": "Cybersecurity", "type": "topic", "parent_id": "tech", "icon": "🔒", "color": "#EF4444", "sort_order": 7},
    {"id": "hardware", "name": "硬件/芯片", "name_en": "Hardware", "type": "topic", "parent_id": "tech", "icon": "🔧", "color": "#78716C", "sort_order": 8},
    {"id": "mobile", "name": "移动开发", "name_en": "Mobile", "type": "topic", "parent_id": "tech", "icon": "📱", "color": "#22C55E", "sort_order": 9},
    {"id": "web3", "name": "Web3/区块链", "name_en": "Web3", "type": "topic", "parent_id": "tech", "icon": "⛓️", "color": "#F59E0B", "sort_order": 10},
    {"id": "gaming", "name": "游戏", "name_en": "Gaming", "type": "topic", "parent_id": "tech", "icon": "🎮", "color": "#EC4899", "sort_order": 11},
    {"id": "robotics", "name": "机器人", "name_en": "Robotics", "type": "topic", "parent_id": "tech", "icon": "🦾", "color": "#14B8A6", "sort_order": 12},
    {"id": "iot", "name": "物联网", "name_en": "IoT", "type": "topic", "parent_id": "tech", "icon": "📡", "color": "#84CC16", "sort_order": 13},
    {"id": "vr_ar", "name": "VR/AR", "name_en": "VR/AR", "type": "topic", "parent_id": "tech", "icon": "🥽", "color": "#D946EF", "sort_order": 14},
    {"id": "opensource", "name": "开源项目", "name_en": "Open Source", "type": "topic", "parent_id": "tech", "icon": "🌐", "color": "#10B981", "sort_order": 15},

    # ==================== Topics (主题) - 财经类 ====================
    {"id": "stock", "name": "股票", "name_en": "Stock", "type": "topic", "parent_id": "finance", "icon": "📈", "color": "#EF4444", "sort_order": 20},
    {"id": "crypto", "name": "加密货币", "name_en": "Crypto", "type": "topic", "parent_id": "finance", "icon": "₿", "color": "#F59E0B", "sort_order": 21},
    {"id": "macro", "name": "宏观经济", "name_en": "Macro", "type": "topic", "parent_id": "finance", "icon": "🌐", "color": "#3B82F6", "sort_order": 22},
    {"id": "banking", "name": "银行", "name_en": "Banking", "type": "topic", "parent_id": "finance", "icon": "🏦", "color": "#6366F1", "sort_order": 23},
    {"id": "insurance", "name": "保险", "name_en": "Insurance", "type": "topic", "parent_id": "finance", "icon": "🛡️", "color": "#8B5CF6", "sort_order": 24},
    {"id": "real_estate", "name": "房地产", "name_en": "Real Estate", "type": "topic", "parent_id": "finance", "icon": "🏘️", "color": "#A855F7", "sort_order": 25},
    {"id": "personal_fin", "name": "个人理财", "name_en": "Personal Finance", "type": "topic", "parent_id": "finance", "icon": "💳", "color": "#22C55E", "sort_order": 26},

    # ==================== Topics (主题) - 商业类 ====================
    {"id": "startup", "name": "创业/融资", "name_en": "Startup", "type": "topic", "parent_id": "business", "icon": "🚀", "color": "#F97316", "sort_order": 30},
    {"id": "ecommerce", "name": "电商", "name_en": "E-commerce", "type": "topic", "parent_id": "business", "icon": "🛒", "color": "#06B6D4", "sort_order": 31},
    {"id": "marketing", "name": "营销", "name_en": "Marketing", "type": "topic", "parent_id": "business", "icon": "📣", "color": "#EC4899", "sort_order": 32},
    {"id": "hr", "name": "人力资源", "name_en": "HR", "type": "topic", "parent_id": "business", "icon": "👥", "color": "#8B5CF6", "sort_order": 33},
    {"id": "management", "name": "企业管理", "name_en": "Management", "type": "topic", "parent_id": "business", "icon": "📊", "color": "#3B82F6", "sort_order": 34},

    # ==================== Topics (主题) - 生活类 ====================
    {"id": "food", "name": "美食", "name_en": "Food", "type": "topic", "parent_id": "lifestyle", "icon": "🍜", "color": "#F97316", "sort_order": 40},
    {"id": "travel", "name": "旅行", "name_en": "Travel", "type": "topic", "parent_id": "lifestyle", "icon": "✈️", "color": "#0EA5E9", "sort_order": 41},
    {"id": "fashion", "name": "时尚", "name_en": "Fashion", "type": "topic", "parent_id": "lifestyle", "icon": "👗", "color": "#EC4899", "sort_order": 42},
    {"id": "home", "name": "家居", "name_en": "Home", "type": "topic", "parent_id": "lifestyle", "icon": "🏡", "color": "#84CC16", "sort_order": 43},
    {"id": "parenting", "name": "育儿", "name_en": "Parenting", "type": "topic", "parent_id": "lifestyle", "icon": "👶", "color": "#F472B6", "sort_order": 44},
    {"id": "pets", "name": "宠物", "name_en": "Pets", "type": "topic", "parent_id": "lifestyle", "icon": "🐾", "color": "#A855F7", "sort_order": 45},
    {"id": "automotive", "name": "汽车", "name_en": "Automotive", "type": "topic", "parent_id": "lifestyle", "icon": "🚗", "color": "#6366F1", "sort_order": 46},

    # ==================== Topics (主题) - 娱乐类 ====================
    {"id": "movies", "name": "电影", "name_en": "Movies", "type": "topic", "parent_id": "entertainment", "icon": "🎬", "color": "#EF4444", "sort_order": 50},
    {"id": "music", "name": "音乐", "name_en": "Music", "type": "topic", "parent_id": "entertainment", "icon": "🎵", "color": "#8B5CF6", "sort_order": 51},
    {"id": "tv_shows", "name": "电视剧", "name_en": "TV Shows", "type": "topic", "parent_id": "entertainment", "icon": "📺", "color": "#3B82F6", "sort_order": 52},
    {"id": "celebrity", "name": "明星", "name_en": "Celebrity", "type": "topic", "parent_id": "entertainment", "icon": "⭐", "color": "#F59E0B", "sort_order": 53},
    {"id": "anime", "name": "动漫", "name_en": "Anime", "type": "topic", "parent_id": "entertainment", "icon": "🎌", "color": "#EC4899", "sort_order": 54},
    {"id": "books", "name": "书籍", "name_en": "Books", "type": "topic", "parent_id": "entertainment", "icon": "📖", "color": "#6366F1", "sort_order": 55},

    # ==================== Attributes (属性) ====================
    {"id": "free_deal", "name": "免费/优惠", "name_en": "Free/Deal", "type": "attribute", "icon": "🆓", "color": "#22C55E", "description": "薅羊毛、免费资源、折扣活动", "sort_order": 1},
    {"id": "tutorial", "name": "教程/实践", "name_en": "Tutorial", "type": "attribute", "icon": "📝", "color": "#3B82F6", "description": "动手教程、代码实战", "sort_order": 2},
    {"id": "deep_dive", "name": "深度分析", "name_en": "Deep Dive", "type": "attribute", "icon": "🔍", "color": "#8B5CF6", "description": "长文、研报、深度解读", "sort_order": 3},
    {"id": "breaking", "name": "快讯/速报", "name_en": "Breaking", "type": "attribute", "icon": "⚡", "color": "#EF4444", "description": "突发新闻、即时消息", "sort_order": 4},
    {"id": "official", "name": "官方发布", "name_en": "Official", "type": "attribute", "icon": "📢", "color": "#F59E0B", "description": "官方公告、新品发布", "sort_order": 5},
    {"id": "opinion", "name": "观点/评论", "name_en": "Opinion", "type": "attribute", "icon": "💭", "color": "#EC4899", "description": "专栏、评论文章", "sort_order": 6},
    {"id": "interview", "name": "访谈", "name_en": "Interview", "type": "attribute", "icon": "🎤", "color": "#14B8A6", "description": "人物访谈、对话", "sort_order": 7},
    {"id": "tool_rec", "name": "工具推荐", "name_en": "Tool Rec", "type": "attribute", "icon": "🧰", "color": "#6366F1", "description": "软件、服务推荐", "sort_order": 8},
    {"id": "career", "name": "职业/求职", "name_en": "Career", "type": "attribute", "icon": "💼", "color": "#0EA5E9", "description": "求职、招聘、职业发展", "sort_order": 9},
    {"id": "event", "name": "活动/会议", "name_en": "Event", "type": "attribute", "icon": "🎪", "color": "#A855F7", "description": "大会、展会、活动", "sort_order": 10},
]


def init_tags(project_root: Path) -> int:
    """
    Initialize tags in the database.
    
    Args:
        project_root: Path to project root
        
    Returns:
        Number of tags inserted/updated
    """
    from hotnews.web.db_online import get_online_db_conn
    
    conn = get_online_db_conn(project_root)
    now = int(time.time())
    
    count = 0
    for tag in PRESET_TAGS:
        try:
            conn.execute(
                """
                INSERT OR REPLACE INTO tags 
                (id, name, name_en, type, parent_id, icon, color, description, sort_order, enabled, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (
                    tag["id"],
                    tag["name"],
                    tag.get("name_en", ""),
                    tag["type"],
                    tag.get("parent_id", ""),
                    tag.get("icon", ""),
                    tag.get("color", ""),
                    tag.get("description", ""),
                    tag.get("sort_order", 0),
                    now,
                    now,
                )
            )
            count += 1
        except Exception as e:
            print(f"Error inserting tag {tag['id']}: {e}")
    
    conn.commit()
    print(f"✅ Initialized {count} tags")
    return count


def get_all_tags(project_root: Path) -> List[Dict[str, Any]]:
    """Get all enabled tags from database."""
    from hotnews.web.db_online import get_online_db_conn
    
    conn = get_online_db_conn(project_root)
    cur = conn.execute(
        """
        SELECT id, name, name_en, type, parent_id, icon, color, description, sort_order
        FROM tags
        WHERE enabled = 1
        ORDER BY type, sort_order
        """
    )
    rows = cur.fetchall() or []
    return [
        {
            "id": r[0],
            "name": r[1],
            "name_en": r[2],
            "type": r[3],
            "parent_id": r[4],
            "icon": r[5],
            "color": r[6],
            "description": r[7],
            "sort_order": r[8],
        }
        for r in rows
    ]


if __name__ == "__main__":
    import sys
    project_root = Path(__file__).parent.parent.parent
    sys.path.insert(0, str(project_root))
    
    init_tags(project_root)
