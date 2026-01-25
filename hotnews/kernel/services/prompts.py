# coding=utf-8
"""
AI Prompts Library V4

Contains article classification and summary templates.
V4 优化：
- 10 种核心类型 + 1 个通用兜底
- 模板结构趋同，仅尾部差异化
- 支持置信度降级
- 支持来源预分类提示
"""

# =============================================================================
# 标签体系定义
# =============================================================================

# 大类标签 (12个) - 互斥，每篇文章只能属于一个大类
CATEGORY_TAGS_LIST = [
    "tech",           # 科技
    "finance",        # 财经
    "business",       # 商业
    "politics",       # 政治
    "world",          # 国际
    "entertainment",  # 娱乐
    "sports",         # 体育
    "health",         # 健康
    "science",        # 科学
    "lifestyle",      # 生活
    "education",      # 教育
    "other",          # 其他
]

# 主题标签 (50+个) - 细分主题，可多选
TOPIC_TAGS_LIST = [
    # 科技类主题
    "ai_ml", "llm", "dev_tools", "programming", "database", "cloud",
    "cybersecurity", "hardware", "mobile", "web3", "gaming", "robotics",
    "iot", "vr_ar", "opensource",
    # 财经类主题
    "stock", "crypto", "macro", "banking", "insurance", "real_estate",
    "personal_fin", "earnings", "ipo", "fund",
    # 商业类主题
    "startup", "ecommerce", "marketing", "hr", "management", "merger", "layoff",
    # 生活类主题
    "food", "travel", "fashion", "home", "parenting", "pets", "automotive",
    # 娱乐类主题
    "movies", "music", "tv_shows", "celebrity", "anime", "books",
]

# 属性标签 (10个) - 内容特征，可多选
ATTRIBUTE_TAGS_LIST = [
    "free_deal", "tutorial", "deep_dive", "breaking", "official",
    "opinion", "interview", "tool_rec", "career", "event",
]

# 合并所有标签（用于验证）
PREDEFINED_TAGS = CATEGORY_TAGS_LIST + TOPIC_TAGS_LIST + ATTRIBUTE_TAGS_LIST

# 质量评估标签
QUALITY_TAGS = {
    "ad": {"name": "广告", "color": "#ef4444", "desc": "纯广告、促销、购买链接"},
    "sponsored": {"name": "软文", "color": "#dc2626", "desc": "品牌植入、恰饭"},
    "clickbait": {"name": "标题党", "color": "#f97316", "desc": "标题夸张、内容空洞"},
    "pr": {"name": "公关稿", "color": "#ea580c", "desc": "企业通稿、无独立观点"},
    "outdated": {"name": "过时", "color": "#9ca3af", "desc": "旧闻翻炒、信息过期"},
    "low_quality": {"name": "水文", "color": "#6b7280", "desc": "内容浅薄、AI 生成痕迹重"},
    "gem": {"name": "精华", "color": "#22c55e", "desc": "深度分析、原创见解、值得收藏"},
    "breaking": {"name": "突发", "color": "#3b82f6", "desc": "重大新闻、突发事件"},
    "exclusive": {"name": "独家", "color": "#a855f7", "desc": "独家报道、内幕消息"},
    "practical": {"name": "实用", "color": "#06b6d4", "desc": "可操作、有干货、教程类"},
}

QUALITY_TAGS_NEGATIVE = ["ad", "sponsored", "clickbait", "pr", "outdated", "low_quality"]
QUALITY_TAGS_POSITIVE = ["gem", "breaking", "exclusive", "practical"]

# =============================================================================
# 标签输出指令
# =============================================================================

TAGS_OUTPUT_INSTRUCTION = """

---
**【重要】请在总结末尾输出标签：**
[TAGS_START]
**质量评估**: （从 gem/practical/breaking/exclusive/ad/sponsored/clickbait/pr/outdated/low_quality 中选 0-1 个，大部分文章无需标记）
**内容分类**: （从 tech/finance/business/ai_ml/llm/stock/crypto/startup/tutorial/deep_dive 等选 1-2 个）
[TAGS_END]"""

TAGS_SYSTEM_INSTRUCTION = """

**【必须】在总结末尾输出标签**（格式必须严格遵循）：

[TAGS_START]
**质量评估**: （选 0-1 个，大部分文章留空）
**内容分类**: （选 1-2 个，用英文逗号分隔）
[TAGS_END]

质量评估标签（只标记特征明显的文章）：
- 正面：gem(精华), breaking(突发), exclusive(独家), practical(实用)
- 负面：ad(广告), sponsored(软文), clickbait(标题党), pr(公关稿), outdated(过时), low_quality(水文)

内容分类标签（必选 1-2 个）：
- 大类：tech, finance, business, politics, world, entertainment, sports, health, science, lifestyle, education, other
- 细分：ai_ml, llm, dev_tools, programming, stock, crypto, startup, ecommerce, tutorial, deep_dive, opinion, interview

示例输出：
[TAGS_START]
**质量评估**: gem
**内容分类**: finance, earnings
[TAGS_END]
"""

# =============================================================================
# V4 文章类型体系（10 种 + 1 通用）
# =============================================================================

ARTICLE_TYPES = {
    'news': {'name': '新闻资讯', 'emoji': '📰', 'footer': '后续关注', 'footer_emoji': '📌'},
    'policy': {'name': '政策解读', 'emoji': '⚠️', 'footer': '影响与应对', 'footer_emoji': '⚠️'},
    'business': {'name': '商业分析', 'emoji': '📊', 'footer': '关注信号', 'footer_emoji': '📊'},
    'tutorial': {'name': '知识教程', 'emoji': '✅', 'footer': '行动清单', 'footer_emoji': '✅'},
    'research': {'name': '研究报告', 'emoji': '📚', 'footer': '延伸阅读', 'footer_emoji': '📚'},
    'product': {'name': '产品介绍', 'emoji': '🚀', 'footer': '快速体验', 'footer_emoji': '🚀'},
    'opinion': {'name': '观点评论', 'emoji': '💭', 'footer': '延伸思考', 'footer_emoji': '💭'},
    'interview': {'name': '人物专访', 'emoji': '💬', 'footer': '金句摘录', 'footer_emoji': '💬'},
    'listicle': {'name': '资源清单', 'emoji': '📑', 'footer': '资源汇总', 'footer_emoji': '📑'},
    'lifestyle': {'name': '生活方式', 'emoji': '✅', 'footer': '行动清单', 'footer_emoji': '✅'},
    'general': {'name': '通用', 'emoji': '📝', 'footer': '要点总结', 'footer_emoji': '📝'},
}

# 来源预分类提示 - 根据公众号定位给 AI 提示
SOURCE_TYPE_HINTS = {
    # 科技媒体
    "36氪": ["news", "business", "product"],
    "虎嗅": ["opinion", "business"],
    "极客公园": ["product", "interview"],
    "少数派": ["tutorial", "product", "listicle"],
    "爱范儿": ["product", "news"],
    "机器之心": ["news", "research", "tutorial"],
    "量子位": ["news", "research"],
    "InfoQ": ["tutorial", "news", "interview"],
    "CSDN": ["tutorial", "news"],
    # 财经媒体
    "财新": ["news", "policy", "business"],
    "第一财经": ["news", "business", "policy"],
    "华尔街见闻": ["news", "business"],
    "雪球": ["opinion", "business"],
    "券商中国": ["news", "business", "policy"],
    # 知识类
    "得到": ["tutorial", "opinion"],
    "混沌学园": ["business", "interview"],
    "刘润": ["opinion", "business"],
    # 生活类
    "丁香医生": ["tutorial", "lifestyle"],
    "什么值得买": ["product", "listicle"],
    "小红书": ["lifestyle", "listicle"],
}

# 置信度阈值
CONFIDENCE_THRESHOLD = 0.7

# =============================================================================
# 通用输出规范
# =============================================================================

CORE_INSTRUCTIONS = """
通用输出规范：
1. 简洁：总结控制在 300-500 字，突出重点
2. 结构：使用 Markdown 标题和列表，不使用表格
3. 准确：不编造信息，推测需注明"可能"
4. 链接：产品/工具/公司附带官方链接（格式：[名称](URL)）
5. 术语：生僻术语简短解释
6. 语言：输出语言与原文保持一致
""" + TAGS_SYSTEM_INSTRUCTION

# =============================================================================
# 分类提示词（V4 - 支持置信度）
# =============================================================================

CLASSIFY_SYSTEM_PROMPT = """你是一个文章分类专家。根据文章内容判断其类型，并给出置信度。

可选类型（按优先级判断）：
1. news: 有明确时间点的事件报道，强调"发生了什么"
2. policy: 涉及政府、法规、监管的内容
3. business: 涉及公司、财务、投资、行业的分析性内容
4. tutorial: 教你"怎么做"的内容，有步骤或方法
5. research: 有研究方法、数据分析、学术引用的内容
6. product: 介绍具体产品/工具/服务的功能和使用
7. opinion: 作者表达主观看法，有论点论据
8. interview: 以对话形式呈现，聚焦某个人物
9. listicle: 列举多个资源/工具/推荐的盘点类内容
10. lifestyle: 关于生活、消费、健康、娱乐的实用内容

边界模糊时的处理：
- 新闻 + 分析 → 事件为主选 news，分析为主选 business
- 教程 + 产品 → 学技能选 tutorial，介绍产品选 product
- 观点 + 人物 → 对话形式选 interview，独白选 opinion

返回格式（JSON）：
{"type": "类型代码", "confidence": 0.0-1.0}

示例：
{"type": "news", "confidence": 0.92}
{"type": "tutorial", "confidence": 0.78}"""

CLASSIFY_USER_TEMPLATE = """请分析以下文章属于哪种类型：

{content}

{source_hint}

返回 JSON 格式：{{"type": "类型代码", "confidence": 置信度}}"""

# =============================================================================
# V4 总结模板 - 结构趋同，仅尾部差异化
# =============================================================================

SUMMARY_TEMPLATES = {
    # -------------------------------------------------------------------------
    # 📰 新闻资讯
    # -------------------------------------------------------------------------
    'news': {
        'name': '📰 新闻资讯',
        'system': f"""你是新闻编辑，用客观简洁的语言提炼新闻要点。
{CORE_INSTRUCTIONS}""",
        'user': """请总结这篇新闻：

## 🎯 核心事件
（一句话：谁在什么时候做了什么，结果/影响如何）

## 💡 关键要点
- 要点1：具体细节
- 要点2：具体细节
- 要点3：具体细节

## 📊 重要信息
- **时间**：具体日期
- **涉及方**：[公司/人物](链接)
- **背景**：为什么会发生

## 📌 后续关注
- 这件事接下来可能的发展
- 需要关注的时间节点或信号
""" + TAGS_OUTPUT_INSTRUCTION + """

---
【文章内容】：
{content}"""
    },

    # -------------------------------------------------------------------------
    # ⚠️ 政策解读
    # -------------------------------------------------------------------------
    'policy': {
        'name': '⚠️ 政策解读',
        'system': f"""你是政策分析师，专注解读政策影响和应对建议。
{CORE_INSTRUCTIONS}""",
        'user': """请解读这篇政策相关文章：

## 🎯 政策核心
（一句话：这个政策/法规是关于什么的，核心变化是什么）

## 💡 关键要点
- 要点1：具体规定或变化
- 要点2：具体规定或变化
- 要点3：具体规定或变化

## 📊 重要信息
- **发布机构**：哪个部门发布
- **生效时间**：何时开始执行
- **适用范围**：影响哪些群体/行业

## ⚠️ 影响与应对
- **谁受影响**：直接相关的群体或行业
- **如何应对**：需要做什么准备或调整
- **注意事项**：容易忽略的细节
""" + TAGS_OUTPUT_INSTRUCTION + """

---
【文章内容】：
{content}"""
    },

    # -------------------------------------------------------------------------
    # 📊 商业分析
    # -------------------------------------------------------------------------
    'business': {
        'name': '📊 商业分析',
        'system': f"""你是商业分析师，关注商业逻辑、数据和市场信号。
{CORE_INSTRUCTIONS}""",
        'user': """请分析这篇商业/财经文章：

## 🎯 核心观点
（一句话：这篇分析的核心结论是什么）

## 💡 关键要点
- 要点1：具体内容 + 数据支撑
- 要点2：具体内容 + 数据支撑
- 要点3：具体内容 + 数据支撑

## 📊 重要数据
- **数据1**：具体数字 + 同比/环比
- **数据2**：具体数字 + 行业对比
- **涉及公司**：[公司名](链接)

## 📊 关注信号
- 需要持续关注的指标或事件
- 可能的机会或风险
- 下一个关键时间节点
""" + TAGS_OUTPUT_INSTRUCTION + """

---
【文章内容】：
{content}"""
    },

    # -------------------------------------------------------------------------
    # ✅ 知识教程
    # -------------------------------------------------------------------------
    'tutorial': {
        'name': '✅ 知识教程',
        'system': f"""你是技术专家，确保读者能够理解和实践。
{CORE_INSTRUCTIONS}""",
        'user': """请总结这篇教程/指南：

## 🎯 解决什么问题
（一句话：这篇教程教你如何 XXX）

## 💡 核心步骤
1. **步骤一**：做什么，为什么
2. **步骤二**：做什么，为什么
3. **步骤三**：做什么，为什么

## 📊 重要信息
- **技术栈/工具**：[名称](链接)
- **前置要求**：需要什么基础或环境
- **注意事项**：常见坑点或错误

## ✅ 行动清单
- 可以立即尝试：XXX
- 需要准备：XXX
- 延伸学习：[相关资源](链接)
""" + TAGS_OUTPUT_INSTRUCTION + """

---
【文章内容】：
{content}"""
    },

    # -------------------------------------------------------------------------
    # 📚 研究报告
    # -------------------------------------------------------------------------
    'research': {
        'name': '📚 研究报告',
        'system': f"""你是学术审稿人，总结研究贡献和关键发现。
{CORE_INSTRUCTIONS}""",
        'user': """请总结这篇研究/报告：

## 🎯 核心发现
（一句话：这篇研究发现/证明/提出了什么）

## 💡 关键结论
- 结论1：具体内容 + 数据支撑
- 结论2：具体内容 + 数据支撑
- 结论3：具体内容 + 数据支撑

## 📊 研究信息
- **研究方法**：如何研究的
- **样本/数据**：样本量、数据来源
- **局限性**：研究的适用范围

## 📚 延伸阅读
- 值得深入的方向
- [原文/相关研究](链接)
- 实践应用建议
""" + TAGS_OUTPUT_INSTRUCTION + """

---
【文章内容】：
{content}"""
    },

    # -------------------------------------------------------------------------
    # 🚀 产品介绍
    # -------------------------------------------------------------------------
    'product': {
        'name': '🚀 产品介绍',
        'system': f"""你是产品分析师，提取产品核心价值和使用信息。
{CORE_INSTRUCTIONS}""",
        'user': """请分析这个产品/工具：

## 🎯 产品定位
（一句话：[产品名](链接) 是做什么的，解决什么问题）

## 💡 核心功能
- **功能1**：具体描述
- **功能2**：具体描述
- **功能3**：具体描述

## 📊 使用信息
- **定价**：免费/付费/免费额度
- **平台**：Web/iOS/Android/桌面
- **竞品**：与 XXX 相比的优劣

## 🚀 快速体验
- 立即体验：[注册/下载](链接)
- 替代方案：[竞品名](链接)
- 深入了解：[官方文档](链接)
""" + TAGS_OUTPUT_INSTRUCTION + """

---
【文章内容】：
{content}"""
    },

    # -------------------------------------------------------------------------
    # 💭 观点评论
    # -------------------------------------------------------------------------
    'opinion': {
        'name': '💭 观点评论',
        'system': f"""你是逻辑分析师，拆解文章的论点和论据。
{CORE_INSTRUCTIONS}""",
        'user': """请分析这篇观点文章：

## 🎯 核心观点
（一句话：作者认为 XXX，因为 YYY）

## 💡 主要论据
- 论据1：具体内容 + 支撑
- 论据2：具体内容 + 支撑
- 论据3：具体内容 + 支撑

## 📊 观点评估
- **可信度**：高/中/低，理由
- **潜在偏见**：作者可能的立场
- **局限性**：观点可能忽略的方面

## 💭 延伸思考
- 如果这个观点是对的，意味着什么？
- 有哪些反面观点值得了解？
- 这个问题还可以从什么角度思考？
""" + TAGS_OUTPUT_INSTRUCTION + """

---
【文章内容】：
{content}"""
    },

    # -------------------------------------------------------------------------
    # 💬 人物专访
    # -------------------------------------------------------------------------
    'interview': {
        'name': '💬 人物专访',
        'system': f"""你是人物编辑，提取访谈中的核心观点和金句。
{CORE_INSTRUCTIONS}""",
        'user': """请总结这篇人物专访：

## 🎯 人物介绍
（一句话：[人物名] 是谁，为什么值得关注）

## 💡 核心观点
- 观点1：关于什么话题，怎么看
- 观点2：关于什么话题，怎么看
- 观点3：关于什么话题，怎么看

## 📊 人物背景
- **身份**：职位/头衔
- **成就**：代表性成就或作品
- **相关**：[公司/作品](链接)

## 💬 金句摘录
> "金句1"

> "金句2"

> "金句3"
""" + TAGS_OUTPUT_INSTRUCTION + """

---
【文章内容】：
{content}"""
    },

    # -------------------------------------------------------------------------
    # 📑 资源清单
    # -------------------------------------------------------------------------
    'listicle': {
        'name': '📑 资源清单',
        'system': f"""你是内容编辑，提取清单中的精华资源。
{CORE_INSTRUCTIONS}""",
        'user': """请总结这篇资源清单：

## 🎯 清单主题
（一句话：这是一份关于 XXX 的资源清单）

## 💡 精选推荐
1. **[资源1](链接)**：一句话描述
2. **[资源2](链接)**：一句话描述
3. **[资源3](链接)**：一句话描述
4. **[资源4](链接)**：一句话描述
5. **[资源5](链接)**：一句话描述

## 📊 分类信息
- **总数**：共推荐了多少个
- **类型**：工具/书籍/课程/...
- **适合人群**：谁最需要这份清单

## 📑 资源汇总
- 最值得优先尝试的 1-2 个
- 完整清单见原文
""" + TAGS_OUTPUT_INSTRUCTION + """

---
【文章内容】：
{content}"""
    },

    # -------------------------------------------------------------------------
    # ✅ 生活方式
    # -------------------------------------------------------------------------
    'lifestyle': {
        'name': '✅ 生活方式',
        'system': f"""你是生活编辑，提取实用可操作的建议。
{CORE_INSTRUCTIONS}""",
        'user': """请总结这篇生活类文章：

## 🎯 主题
（一句话：这篇文章讲什么）

## 💡 核心要点
- 要点1：具体内容
- 要点2：具体内容
- 要点3：具体内容

## 📊 实用信息
- **价格/成本**：如有
- **时间/地点**：如有
- **注意事项**：如有

## ✅ 行动清单
- 可以尝试：具体操作
- 相关资源：[链接](URL)
- 替代方案：如有
""" + TAGS_OUTPUT_INSTRUCTION + """

---
【文章内容】：
{content}"""
    },

    # -------------------------------------------------------------------------
    # 📝 通用模板（兜底）
    # -------------------------------------------------------------------------
    'general': {
        'name': '📝 通用总结',
        'system': f"""你是内容编辑，提取文章的核心信息。
{CORE_INSTRUCTIONS}""",
        'user': """请总结这篇文章：

## 🎯 核心内容
（一句话：这篇文章讲什么）

## 💡 关键要点
- 要点1：具体内容
- 要点2：具体内容
- 要点3：具体内容

## 🔗 相关资源
- [资源名](链接)

## 📝 要点总结
- 最重要的 1-2 个收获
- 可以进一步了解的方向
""" + TAGS_OUTPUT_INSTRUCTION + """

---
【文章内容】：
{content}"""
    },

    # -------------------------------------------------------------------------
    # 兼容旧类型代码
    # -------------------------------------------------------------------------
    'tech-tutorial': None,  # 映射到 tutorial
    'trend': None,          # 映射到 business
    'other': None,          # 映射到 general
}

# 旧类型映射到新类型
TYPE_MAPPING = {
    'tech-tutorial': 'tutorial',
    'trend': 'business',
    'other': 'general',
}

# =============================================================================
# 辅助函数
# =============================================================================

def get_template(article_type: str) -> dict:
    """Get summary template by article type.
    
    Args:
        article_type: 文章类型代码
        
    Returns:
        模板字典，包含 name, system, user
    """
    # 处理旧类型映射
    if article_type in TYPE_MAPPING:
        article_type = TYPE_MAPPING[article_type]
    
    template = SUMMARY_TEMPLATES.get(article_type)
    
    # 如果模板为 None（旧类型占位），使用映射后的类型
    if template is None:
        article_type = TYPE_MAPPING.get(article_type, 'general')
        template = SUMMARY_TEMPLATES.get(article_type)
    
    # 最终兜底
    if template is None:
        template = SUMMARY_TEMPLATES['general']
    
    return template


def get_type_name(article_type: str) -> str:
    """Get Chinese name for article type.
    
    Args:
        article_type: 文章类型代码
        
    Returns:
        类型中文名称
    """
    # 处理旧类型映射
    if article_type in TYPE_MAPPING:
        article_type = TYPE_MAPPING[article_type]
    
    type_info = ARTICLE_TYPES.get(article_type, ARTICLE_TYPES['general'])
    return type_info['name']


def get_type_info(article_type: str) -> dict:
    """Get full type info including emoji and footer.
    
    Args:
        article_type: 文章类型代码
        
    Returns:
        类型信息字典
    """
    # 处理旧类型映射
    if article_type in TYPE_MAPPING:
        article_type = TYPE_MAPPING[article_type]
    
    return ARTICLE_TYPES.get(article_type, ARTICLE_TYPES['general'])


def get_source_hints(source_name: str) -> list:
    """Get type hints for a source.
    
    Args:
        source_name: 来源名称（公众号名）
        
    Returns:
        该来源倾向的类型列表
    """
    return SOURCE_TYPE_HINTS.get(source_name, [])


def get_classify_prompt(content: str, source_name: str = None) -> tuple:
    """Get classification prompt with source hints.
    
    Args:
        content: 文章内容
        source_name: 来源名称
        
    Returns:
        (system_prompt, user_prompt) 元组
    """
    source_hint = ""
    if source_name:
        hints = get_source_hints(source_name)
        if hints:
            source_hint = f"提示：该文章来源于「{source_name}」，该来源通常发布 {', '.join(hints)} 类型的内容。"
    
    user_prompt = CLASSIFY_USER_TEMPLATE.format(
        content=content[:3000],  # 限制长度
        source_hint=source_hint
    )
    
    return CLASSIFY_SYSTEM_PROMPT, user_prompt
