# coding=utf-8
"""
Rule-Based Classifier — 替代 AI LLM 的程序化分类引擎

用 3 层规则完全替代 AI API 调用：
  L1: 源级规则 — 根据 rss_sources.category 决定默认 action
  L2: 标题关键词 — 黑白名单过滤
  L3: 域名规则 — 特定域名加减分

产出格式与 AI 标注完全一致，写入 rss_entry_ai_labels + rss_entry_tags 表，
前端/缓存/Morning Brief 无需任何修改。
"""

import re
import logging
from typing import Any, Dict, List, Optional, Set, Tuple
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# =============================================================================
# L1: 源分类 → 默认 action + category 映射
# =============================================================================

# RSS source category → (default_action, ai_category, base_score)
SOURCE_CATEGORY_RULES: Dict[str, Tuple[str, str, int]] = {
    "tech_news":  ("include", "tech",          80),
    "developer":  ("include", "tech",          80),
    "explore":    ("include", "tech",          70),
    "user":       ("include", "tech",          70),
    "finance":    ("include", "finance",       60),
    "social":     ("exclude", "entertainment", 30),
    "general":    ("exclude", "other",         30),
}

DEFAULT_RULE = ("include", "other", 50)

# =============================================================================
# L2: 标题关键词规则
# =============================================================================

# 排除关键词 — 匹配则 exclude（优先级高于源级 include）
EXCLUDE_TITLE_PATTERNS: List[re.Pattern] = [
    # 聚合型内容（信息密度低，与单篇报道高度重复）
    re.compile(r"(早报|晚报|日报|周刊|快讯合集|一周要闻|今日热点|每日速递|每日摘要|本周精选)", re.IGNORECASE),
    re.compile(r"(morning\s*brief|daily\s*digest|weekly\s*roundup|newsletter|weekly\s*recap)", re.IGNORECASE),
    # 标题中用分隔符罗列3个以上事件
    re.compile(r"(?:[^、；|]+[、；|]){3,}", re.IGNORECASE),

    # 营销 / 广告
    re.compile(r"(限时优惠|立即购买|点击领取|扫码关注|加微信|领取福利|免费试用.*天)", re.IGNORECASE),
    re.compile(r"(sponsored|advertisement|promoted\s*content)", re.IGNORECASE),

    # 标题党
    re.compile(r"(震惊.{0,4}!|必看!|不看后悔|99%的人不知道|赶紧收藏|速看)", re.IGNORECASE),
]

# Finance 专用排除（仅 finance 源触发）
FINANCE_EXCLUDE_PATTERNS: List[re.Pattern] = [
    re.compile(r"(三大指数|涨跌幅|收盘综述|开盘综述|盘面|盘中|盘后)", re.IGNORECASE),
    re.compile(r"^(A股|港股|美股).{0,6}(收涨|收跌|高开|低开|震荡)", re.IGNORECASE),
    re.compile(r"(资金流向|龙虎榜|涨停板|跌停板|换手率)", re.IGNORECASE),
]

# 加分关键词 — 匹配则提高 score
BOOST_KEYWORD_GROUPS: Dict[str, Tuple[List[str], int]] = {
    # (关键词列表, 加分值)
    "ai_tech": ([
        "AI", "LLM", "GPT", "Claude", "Gemini", "DeepSeek", "Qwen",
        "大模型", "人工智能", "机器学习", "深度学习", "Agent", "Copilot",
        "RAG", "transformer", "diffusion", "multimodal", "embedding",
        "fine-tune", "微调", "推理", "训练", "多模态",
        "OpenAI", "Anthropic", "Google DeepMind",
    ], 15),
    "dev_tools": ([
        "GitHub", "开源", "open-source", "VSCode", "Docker",
        "Kubernetes", "Cursor", "编程", "API", "SDK",
        "框架", "library", "framework", "工具链",
    ], 10),
    "depth": ([
        "架构", "性能", "评测", "论文", "benchmark", "原理",
        "教程", "实战", "源码分析", "deep dive", "详解",
        "最佳实践", "实践", "踩坑", "经验",
    ], 10),
}

# =============================================================================
# L3: 域名规则
# =============================================================================

HIGH_QUALITY_DOMAINS: Set[str] = {
    "github.com", "arxiv.org", "huggingface.co",
    "openai.com", "anthropic.com", "deepmind.google",
    "research.google", "ai.meta.com",
    "blog.google", "engineering.fb.com",
    "developer.apple.com", "devblogs.microsoft.com",
}

# =============================================================================
# Topic 标签自动提取规则
# =============================================================================

TOPIC_DETECTION_RULES: Dict[str, List[str]] = {
    "ai_ml":       ["AI", "人工智能", "机器学习", "ML", "artificial intelligence", "neural"],
    "llm":         ["LLM", "大模型", "大语言模型", "GPT", "Claude", "Gemini",
                    "千问", "Qwen", "DeepSeek", "ChatGPT", "Llama", "Mistral"],
    "dev_tools":   ["IDE", "编辑器", "Cursor", "Copilot", "VSCode", "开发工具",
                    "Windsurf", "Cline", "编程工具"],
    "programming": ["编程", "Python", "JavaScript", "TypeScript", "Rust", "Go语言",
                    "Java", "C++", "Swift", "Kotlin", "代码"],
    "cloud":       ["云", "AWS", "Azure", "阿里云", "Cloud", "GCP", "Serverless",
                    "Lambda", "容器", "Kubernetes", "K8s", "Docker"],
    "cybersecurity": ["安全", "漏洞", "黑客", "security", "CVE", "勒索", "攻击"],
    "hardware":    ["芯片", "GPU", "CPU", "英伟达", "NVIDIA", "处理器", "半导体",
                    "AMD", "Intel", "TSMC", "台积电", "光刻"],
    "mobile":      ["iPhone", "Android", "手机", "iOS", "鸿蒙", "HarmonyOS",
                    "iPad", "Pixel"],
    "opensource":  ["开源", "open source", "GitHub", "开源项目", "MIT协议",
                    "Apache", "GPL"],
    "robotics":    ["机器人", "Robot", "具身智能", "Optimus", "人形机器人"],
    "stock":       ["A股", "美股", "股票", "基金", "ETF", "纳斯达克", "道琼斯"],
    "crypto":      ["比特币", "加密", "区块链", "Web3", "Bitcoin", "Ethereum",
                    "NFT", "DeFi"],
    "startup":     ["创业", "融资", "估值", "startup", "独角兽", "孵化"],
    "ecommerce":   ["电商", "直播带货", "跨境", "拼多多", "淘宝", "亚马逊"],
    "gaming":      ["游戏", "Game", "Switch", "PlayStation", "Steam", "电竞"],
}

# 属性标签检测规则
ATTRIBUTE_DETECTION_RULES: Dict[str, List[str]] = {
    "free_deal":  ["免费", "0元", "限时", "薅羊毛", "开源免费", "限免", "优惠", "折扣"],
    "tutorial":   ["教程", "实战", "手把手", "从零开始", "入门指南", "指南", "如何"],
    "deep_dive":  ["深度", "解读", "分析", "详解", "原理", "研报"],
    "breaking":   ["突发", "刚刚", "快讯", "速报", "紧急"],
    "official":   ["官方", "发布", "公告", "更新", "Release", "新品"],
    "tool_rec":   ["推荐", "盘点", "合集", "工具", "效率"],
    "opinion":    ["观点", "评论", "看法", "我认为", "专栏"],
}

# Region 检测规则
REGION_CN_KEYWORDS = [
    "中国", "国内", "A股", "人民币", "央行", "北京", "上海", "深圳",
    "广州", "杭州", "阿里", "腾讯", "百度", "字节", "华为", "小米",
    "工信部", "发改委", "国务院",
]
REGION_US_KEYWORDS = [
    "美国", "硅谷", "美联储", "美股", "纳斯达克", "华尔街",
    "Apple", "Google", "Microsoft", "Amazon", "Meta", "Tesla",
    "OpenAI", "Anthropic", "NVIDIA",
]


# =============================================================================
# 核心分类函数
# =============================================================================

def extract_domain(url: str) -> str:
    """提取 URL 的域名"""
    try:
        return (urlparse(url or "").hostname or "").strip().lower()
    except Exception:
        return ""


def detect_topics(title: str) -> List[str]:
    """从标题中提取 topic 标签（最多 3 个）"""
    topics = []
    title_lower = title.lower()
    for topic_id, keywords in TOPIC_DETECTION_RULES.items():
        if any(kw.lower() in title_lower for kw in keywords):
            topics.append(topic_id)
        if len(topics) >= 3:
            break
    return topics


def detect_attributes(title: str) -> List[str]:
    """从标题中提取属性标签（最多 2 个）"""
    attrs = []
    title_lower = title.lower()
    for attr_id, keywords in ATTRIBUTE_DETECTION_RULES.items():
        if any(kw.lower() in title_lower for kw in keywords):
            attrs.append(attr_id)
        if len(attrs) >= 2:
            break
    return attrs


def detect_region(title: str) -> str:
    """从标题判断地域"""
    cn_hits = sum(1 for kw in REGION_CN_KEYWORDS if kw in title)
    us_hits = sum(1 for kw in REGION_US_KEYWORDS if kw.lower() in title.lower())
    if cn_hits > us_hits and cn_hits > 0:
        return "cn"
    if us_hits > cn_hits and us_hits > 0:
        return "us"
    return "global"


def classify_entry(
    *,
    source_id: str,
    source_category: str,
    title: str,
    url: str,
    dedup_key: str = "",
) -> Dict[str, Any]:
    """
    对单条 entry 进行规则分类。

    Returns:
        与 AI 标注相同格式的 dict:
        {
            "source_id", "dedup_key", "url", "domain", "title",
            "category", "action", "score", "confidence", "reason",
            "topics", "attributes", "region",
        }
    """
    domain = extract_domain(url)

    # ------ L1: 源级规则 ------
    action, category, score = SOURCE_CATEGORY_RULES.get(
        source_category, DEFAULT_RULE
    )
    reason = f"src:{source_category}"

    # ------ L2: 标题关键词 ------

    # 2a. 全局排除检查
    for pattern in EXCLUDE_TITLE_PATTERNS:
        if pattern.search(title):
            action = "exclude"
            score = max(score - 40, 5)
            reason = "title_blacklist"
            break

    # 2b. Finance 专用排除
    if source_category == "finance" and action == "include":
        for pattern in FINANCE_EXCLUDE_PATTERNS:
            if pattern.search(title):
                action = "exclude"
                score = max(score - 30, 10)
                reason = "finance_noise"
                break

    # 2c. 加分关键词
    if action == "include":
        for group_name, (keywords, bonus) in BOOST_KEYWORD_GROUPS.items():
            for kw in keywords:
                if kw.lower() in title.lower():
                    score = min(score + bonus, 98)
                    break

    # ------ L3: 域名规则 ------
    if domain in HIGH_QUALITY_DOMAINS:
        score = min(score + 10, 98)
        if action == "exclude":
            action = "include"
            reason = "high_quality_domain"

    # ------ Topics / Attributes / Region ------
    topics = detect_topics(title)
    attributes = detect_attributes(title)
    region = detect_region(title)

    # 根据 topics 调整 category（AI 标题含 AI 关键词时覆盖为 tech）
    if category == "finance" and any(t in ("ai_ml", "llm") for t in topics):
        category = "tech"

    # 确保 score 合理区间
    score = max(0, min(100, score))

    # Confidence: 规则引擎固定 0.85（表示高确信）
    confidence = 0.85

    return {
        "source_id": source_id,
        "dedup_key": dedup_key,
        "url": url,
        "domain": domain,
        "title": title,
        "category": category,
        "action": action,
        "score": score,
        "confidence": confidence,
        "reason": reason[:300],
        "topics": topics,
        "attributes": attributes,
        "region": region,
        "error": "",
    }


def classify_batch(
    entries: List[Dict[str, Any]],
    source_categories: Dict[str, str],
) -> List[Dict[str, Any]]:
    """
    批量分类。

    Args:
        entries: list of {"source_id", "dedup_key", "url", "title"}
        source_categories: {source_id: category} 映射

    Returns:
        list of classify_entry 返回值
    """
    results = []
    for ent in entries:
        sid = str(ent.get("source_id") or "").strip()
        cat = source_categories.get(sid, "")
        result = classify_entry(
            source_id=sid,
            source_category=cat,
            title=str(ent.get("title") or ""),
            url=str(ent.get("url") or ""),
            dedup_key=str(ent.get("dedup_key") or ""),
        )
        results.append(result)
    return results
