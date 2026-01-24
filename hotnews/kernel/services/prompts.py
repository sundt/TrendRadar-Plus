# coding=utf-8
"""
AI Prompts Library

Contains article classification and summary templates.
Migrated from hotnews-summarizer plugin.
"""

# 预定义标签列表（用于总结时生成标签）
# 内容分类标签 - 基于 AI_TAGGING_SYSTEM.md 的完整标签体系
# 分为：大类(category)、主题(topic)、属性(attribute)

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
    "ai_ml",          # AI/机器学习
    "llm",            # 大语言模型
    "dev_tools",      # 开发工具
    "programming",    # 编程语言
    "database",       # 数据库
    "cloud",          # 云计算
    "cybersecurity",  # 网络安全
    "hardware",       # 硬件/芯片
    "mobile",         # 移动开发
    "web3",           # Web3/区块链
    "gaming",         # 游戏
    "robotics",       # 机器人
    "iot",            # 物联网
    "vr_ar",          # VR/AR
    "opensource",     # 开源项目
    
    # 财经类主题
    "stock",          # 股票
    "crypto",         # 加密货币
    "macro",          # 宏观经济
    "banking",        # 银行
    "insurance",      # 保险
    "real_estate",    # 房地产
    "personal_fin",   # 个人理财
    "earnings",       # 财报/业绩
    "ipo",            # IPO/上市
    "fund",           # 基金/投资
    
    # 商业类主题
    "startup",        # 创业/融资
    "ecommerce",      # 电商
    "marketing",      # 营销
    "hr",             # 人力资源
    "management",     # 企业管理
    "merger",         # 并购/重组
    "layoff",         # 裁员/调整
    
    # 生活类主题
    "food",           # 美食
    "travel",         # 旅行
    "fashion",        # 时尚
    "home",           # 家居
    "parenting",      # 育儿
    "pets",           # 宠物
    "automotive",     # 汽车
    
    # 娱乐类主题
    "movies",         # 电影
    "music",          # 音乐
    "tv_shows",       # 电视剧
    "celebrity",      # 明星
    "anime",          # 动漫
    "books",          # 书籍
]

# 属性标签 (10个) - 内容特征，可多选
ATTRIBUTE_TAGS_LIST = [
    "free_deal",      # 免费/优惠（薅羊毛、免费资源、折扣活动）
    "tutorial",       # 教程/实践（动手教程、代码实战）
    "deep_dive",      # 深度分析（长文、研报、深度解读）
    "breaking",       # 快讯/速报（突发新闻、即时消息）
    "official",       # 官方发布（官方公告、新品发布）
    "opinion",        # 观点/评论（专栏、评论文章）
    "interview",      # 访谈（人物访谈、对话）
    "tool_rec",       # 工具推荐（软件、服务推荐）
    "career",         # 职业/求职（求职、招聘、职业发展）
    "event",          # 活动/会议（大会、展会、活动）
]

# 合并所有标签（用于验证）
PREDEFINED_TAGS = CATEGORY_TAGS_LIST + TOPIC_TAGS_LIST + ATTRIBUTE_TAGS_LIST

# 质量评估标签（10 个，互斥，每篇文章最多 1 个）
QUALITY_TAGS = {
    # 负面标签（警示类）
    "ad": {"name": "广告", "color": "#ef4444", "desc": "纯广告、促销、购买链接、优惠码"},
    "sponsored": {"name": "软文", "color": "#dc2626", "desc": "品牌植入、恰饭、利益相关但不明说"},
    "clickbait": {"name": "标题党", "color": "#f97316", "desc": "标题夸张、内容空洞、货不对板"},
    "pr": {"name": "公关稿", "color": "#ea580c", "desc": "企业通稿、官方口吻、无独立观点"},
    "outdated": {"name": "过时", "color": "#9ca3af", "desc": "旧闻翻炒、信息过期、炒冷饭"},
    "low_quality": {"name": "水文", "color": "#6b7280", "desc": "内容浅薄、拼凑搬运、AI 生成痕迹重"},
    # 正面标签（推荐类）
    "gem": {"name": "精华", "color": "#22c55e", "desc": "深度分析、原创见解、数据详实、值得收藏"},
    "breaking": {"name": "突发", "color": "#3b82f6", "desc": "重大新闻、突发事件、第一手报道"},
    "exclusive": {"name": "独家", "color": "#a855f7", "desc": "独家报道、内幕消息、稀缺信息源"},
    "practical": {"name": "实用", "color": "#06b6d4", "desc": "可操作、有干货、教程类、工具推荐"},
}

# 质量标签分类
QUALITY_TAGS_NEGATIVE = ["ad", "sponsored", "clickbait", "pr", "outdated", "low_quality"]
QUALITY_TAGS_POSITIVE = ["gem", "breaking", "exclusive", "practical"]

# 标签输出指令（附加到总结模板末尾，但不显示给用户）
# AI 会在总结末尾输出标签，后端解析后存储，前端不显示这部分
TAGS_OUTPUT_INSTRUCTION = """

---
[TAGS_START]
**质量评估**: 
**内容分类**: 
[TAGS_END]"""

# 给 AI 的标签生成指令（放在 system prompt 中）
TAGS_SYSTEM_INSTRUCTION = """
在总结末尾，请在 [TAGS_START] 和 [TAGS_END] 之间输出标签：

**质量评估**（从以下选择 0-1 个，大部分文章无需标记，只标记特征明显的）：
- 负面警示：ad(广告), sponsored(软文), clickbait(标题党), pr(公关稿), outdated(过时), low_quality(水文)
- 正面推荐：gem(精华), breaking(突发), exclusive(独家), practical(实用)

**内容分类**（选择 1-2 个最精准的标签，优先选择细分主题标签）：

大类（必选1个）：
tech(科技), finance(财经), business(商业), politics(政治), world(国际), entertainment(娱乐), sports(体育), health(健康), science(科学), lifestyle(生活), education(教育), other(其他)

细分主题（选0-1个，尽量选择）：
- 科技：ai_ml(AI), llm(大模型), dev_tools(开发工具), programming(编程), database(数据库), cloud(云计算), cybersecurity(安全), hardware(硬件/芯片), mobile(移动), web3(区块链), gaming(游戏), robotics(机器人), iot(物联网), vr_ar(VR/AR), opensource(开源)
- 财经：stock(股票), crypto(加密货币), macro(宏观经济), banking(银行), insurance(保险), real_estate(房产), personal_fin(理财), earnings(财报/业绩), ipo(IPO/上市), fund(基金)
- 商业：startup(创业), ecommerce(电商), marketing(营销), hr(人力), management(管理), merger(并购), layoff(裁员)
- 生活：food(美食), travel(旅行), fashion(时尚), home(家居), parenting(育儿), pets(宠物), automotive(汽车)
- 娱乐：movies(电影), music(音乐), tv_shows(电视剧), celebrity(明星), anime(动漫), books(书籍)

属性标签（选0-1个）：
free_deal(免费/优惠), tutorial(教程), deep_dive(深度分析), breaking(快讯), official(官方发布), opinion(观点), interview(访谈), tool_rec(工具推荐), career(职业), event(活动)

标签选择原则：
1. 财报、业绩公告类文章必须标记 earnings
2. IPO、上市相关必须标记 ipo
3. 裁员、组织调整必须标记 layoff
4. 并购、收购必须标记 merger
5. 优先选择细分主题标签，而非只选大类

格式示例：
[TAGS_START]
**质量评估**: gem
**内容分类**: finance, earnings
[TAGS_END]
"""

# 通用输出规范 - 拼接到所有模板末尾
CORE_INSTRUCTIONS = """
通用输出规范：
1. 结构化：必须使用 Markdown 标题、列表和加粗来组织信息。
2. 准确性：严禁编造原文不存在的细节。如果是推测，必须注明"可能"。
3. 语言：输出语言与原文保持一致，技术术语保留英文。
4. 深度：不要只做表面摘要，要挖掘底层的逻辑、意图和隐含价值。
5. 链接直达：文中涉及的产品、框架、工具，尽量附带官方链接（格式：[名称](URL)）。
6. 术语解释：对于生僻专业名词或缩写，请简短解释。
7. 表格规范：使用标准 Markdown 表格格式。
""" + TAGS_SYSTEM_INSTRUCTION

# 统一尾部 - 学习收获和行动清单
LEARNING_FOOTER = """

---

## 💡 学习收获
（读完这篇文章，读者能学到什么新知识、新视角或新技能？2-3 条）

## ✅ 行动清单
- 可以立即尝试或应用的事项
- 需要进一步了解或研究的内容
- 值得收藏的资源或工具（附链接）"""

# 统一尾部 - 不再包含标签输出（标签由后端单独处理）
LEARNING_FOOTER_WITH_TAGS = LEARNING_FOOTER + TAGS_OUTPUT_INSTRUCTION

# 文章类型定义
ARTICLE_TYPES = {
    'news': '新闻资讯',
    'tech-tutorial': '技术教程',
    'product': '产品介绍',
    'opinion': '观点评论',
    'research': '研究论文',
    'business': '商业财经',
    'trend': '行业趋势',
    'lifestyle': '生活方式',
    'other': '其他',
}

# 分类提示词
CLASSIFY_SYSTEM_PROMPT = """你是一个文章分类专家。根据文章内容，判断其类型。只返回类型代码，不要其他内容。

可选类型代码：
- news: 新闻报道、时事资讯、事件报道
- tech-tutorial: 技术教程、编程指南、开发文档、How-to 文章
- product: 产品介绍、功能说明、发布公告
- opinion: 观点文章、评论、个人见解、深度分析
- research: 学术论文、研究报告、白皮书、科研成果
- business: 商业分析、财经资讯、创业内容、公司动态
- trend: 行业趋势分析、市场预测、技术趋势
- lifestyle: 生活方式、个人成长、健康养生
- other: 无法归类的内容"""

CLASSIFY_USER_TEMPLATE = """请分析以下文章属于哪种类型，只返回类型代码（如 news、tech-tutorial 等）：

{content}"""

# 各类型的专业模板
SUMMARY_TEMPLATES = {
    'news': {
        'name': '📰 新闻速览',
        'system': f"""你是新闻编辑，用客观简洁的语言提炼新闻要点。
{CORE_INSTRUCTIONS}""",
        'user': """请提取这篇新闻的核心信息：

## 📌 核心事件
（一句话概括发生了什么）

## 📍 关键要素
- **时间**：
- **涉及方**：（公司/组织请附带官网链接）
- **起因**：
- **结果/影响**：

## 📊 关键数据
（文中提到的重要数字、比例）

## 💬 各方观点
（如有引用的观点或评论）
""" + LEARNING_FOOTER_WITH_TAGS + """

---
【文章内容】：
{content}"""
    },
    
    'tech-tutorial': {
        'name': '👨‍💻 技术实战指南',
        'system': f"""你是一位资深技术专家。目标是确保读者能够零摩擦复现。
{CORE_INSTRUCTIONS}""",
        'user': """请对这篇技术文章进行深度拆解：

## 🎯 目标与场景
- **核心目标**：一句话概括本文要解决的技术痛点
- **涉及技术栈**：列出核心语言、库或框架，附带官方链接

## 📋 依赖与环境
- **核心工具**：列出文中使用的工具/库，标注版本
- **环境要求**：OS、语言版本等

## 🪜 核心步骤
1. **[阶段一]** ...
2. **[阶段二]** ...

## 💻 关键代码
（提取核心代码片段，解释为什么这样写）

## ⚠️ 避坑指南
（潜在错误、性能瓶颈或安全风险）
""" + LEARNING_FOOTER_WITH_TAGS + """

---
【文章内容】：
{content}"""
    },
    
    'product': {
        'name': '🚀 产品分析',
        'system': f"""你是产品分析师，专注提取产品的核心价值和功能特点。
{CORE_INSTRUCTIONS}""",
        'user': """请分析这个产品/功能介绍：

## 🎯 产品概览
- **产品名称**：[名称](官网链接)
- **一句话定位**：它是做什么的？解决什么问题？
- **目标用户**：谁最需要它？

## 🆚 差异化定位
- 与同类产品相比，核心优势是什么？
- 竞争对手是谁？

## ✨ 核心功能
（列出文中提到的主要功能点）

## 🛠️ 技术规格
- **平台/环境**：
- **技术栈**：
- **定价模式**：

## ⚠️ 局限性
（文中提及的限制或不足）
""" + LEARNING_FOOTER_WITH_TAGS + """

---
【文章内容】：
{content}"""
    },
    
    'opinion': {
        'name': '⚖️ 观点分析',
        'system': f"""你是一位逻辑严密的分析师。任务是拆解文章的论点和论据。
{CORE_INSTRUCTIONS}""",
        'user': """请对这篇观点文章进行分析：

## 🎯 核心论点
（作者试图让我们相信什么？一句话概括）

## 📝 主要论据
1. 
2. 
3. 

## 🔍 逻辑检验
- **事实依据**：数据是否可靠？来源是否权威？
- **逻辑链条**：论证过程是否严密？
- **潜在偏见**：作者是否有特定立场？

## 💡 核心洞见
（文中最有价值的观点或发现）

## ⚠️ 值得商榷
（可能存在的问题或不同看法）
""" + LEARNING_FOOTER_WITH_TAGS + """

---
【文章内容】：
{content}"""
    },
    
    'research': {
        'name': '📚 学术研读',
        'system': f"""你是一位严谨的学术审稿人。请总结论文并评估其研究质量。
{CORE_INSTRUCTIONS}""",
        'user': """请对这篇论文/研究进行结构化研读：

## 🎯 核心贡献
（用 100 字内概括本文最核心的创新点）

## 🔬 研究问题
- **现状/痛点**：现有研究有什么不足？
- **本文假设**：作者基于什么假设？

## 📊 方法与数据
- **研究方法**：
- **数据来源**：
- **样本规模**：

## 📈 关键结论
1. 结论 + 支撑数据
2. 结论 + 支撑数据

## 💡 局限与展望
- **局限性**：
- **未来方向**：
""" + LEARNING_FOOTER_WITH_TAGS + """

---
【文章内容】：
{content}"""
    },
    
    'business': {
        'name': '💼 商业情报',
        'system': f"""你是一位战略顾问。关注商业逻辑、利益链条和市场信号。
{CORE_INSTRUCTIONS}""",
        'user': """请生成一份商业情报简报：

## 📌 核心事件
（发生了什么？涉及哪些公司/机构？附带官网链接）

## ⛓️ 影响分析
- **短期影响**：直接受益方/受损方
- **长期趋势**：是否标志着行业拐点？

## 📊 关键数据
（核心财务数据、增长率或市场份额）

## 🗣️ 潜台词解读
（官方声明背后可能隐藏的真实意图）

## 📖 术语解释
（解释文中的商业术语或缩写）
""" + LEARNING_FOOTER_WITH_TAGS + """

---
【文章内容】：
{content}"""
    },
    
    'trend': {
        'name': '📈 趋势分析',
        'system': f"""你是行业分析师，专注提取趋势判断和预测依据。
{CORE_INSTRUCTIONS}""",
        'user': """请分析这篇趋势类文章：

## 🎯 核心趋势
（一句话概括主要趋势判断）

## 📊 支撑数据
（文中提到的关键数据，注明来源和时间）

## 🔍 已发生的变化
（文中提到的当前市场/技术变化）

## 🔮 未来预测
（作者明确提出的预测或判断）

## 💡 驱动因素
（推动这一趋势的核心因素）

## 🚀 机会与建议
（文中提到的机会或应对建议）
""" + LEARNING_FOOTER_WITH_TAGS + """

---
【文章内容】：
{content}"""
    },
    
    'lifestyle': {
        'name': '🌟 生活建议',
        'system': f"""你是生活类内容编辑，提取实用可验证的建议。
{CORE_INSTRUCTIONS}""",
        'user': """请提取这篇文章的实用内容：

## 🎯 主题
（这篇文章在讲什么）

## ✨ 核心要点
（最有价值或最有趣的内容）

## 📝 实用建议
1. 
2. 
3. 

## 🔗 相关资源
（文中提到的资源、地点、产品或工具）

## 💡 关键信息
（价格、时间、地点等具体信息）
""" + LEARNING_FOOTER_WITH_TAGS + """

---
【文章内容】：
{content}"""
    },
    
    'other': {
        'name': '📝 知识萃取',
        'system': f"""你是一位学习教练，提取文中可行动的知识。
{CORE_INSTRUCTIONS}""",
        'user': """请提取文中的核心知识：

## 🎯 核心问题与结论
- 文章解决的具体问题是什么？
- 关键结论（1-3 条）

## 🛠️ 工具/资源
（文中提到的产品或工具，附带链接）

## 💡 关键洞见
（反常识的发现或重要观点）

## 📖 术语解释
（文中出现的专业术语简短说明）

## 🚀 行动建议
（读者可立即尝试的具体操作）
""" + LEARNING_FOOTER_WITH_TAGS + """

---
【文章内容】：
{content}"""
    },
}


def get_template(article_type: str) -> dict:
    """Get summary template by article type."""
    return SUMMARY_TEMPLATES.get(article_type, SUMMARY_TEMPLATES['other'])


def get_type_name(article_type: str) -> str:
    """Get Chinese name for article type."""
    return ARTICLE_TYPES.get(article_type, '其他')
