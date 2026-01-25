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
    'tech': {'name': '技术解读', 'emoji': '🤖', 'footer': '快速上手', 'footer_emoji': '🛠️'},  # V5 新增
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
    "36氪": ["news", "business", "product", "tech"],
    "虎嗅": ["opinion", "business", "tech"],
    "极客公园": ["product", "interview", "tech"],
    "少数派": ["tutorial", "product", "listicle", "tech"],
    "爱范儿": ["product", "news", "tech"],
    "机器之心": ["news", "research", "tech"],
    "量子位": ["news", "research", "tech"],
    "InfoQ": ["tech", "news", "interview"],
    "CSDN": ["tech", "news"],
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
3. business: 涉及公司、财务、投资、行业的分析性内容（非技术类）
4. tech: AI/开发/技术类内容，包括：AI产品发布、技术原理解读、开发工具、编程教程、开源项目、技术趋势分析
5. tutorial: 非技术类的教程，教你"怎么做"的内容，有步骤或方法
6. research: 有研究方法、数据分析、学术引用的内容
7. product: 非技术类产品/工具/服务的功能介绍
8. opinion: 作者表达主观看法，有论点论据
9. interview: 以对话形式呈现，聚焦某个人物
10. listicle: 列举多个资源/工具/推荐的盘点类内容
11. lifestyle: 关于生活、消费、健康、娱乐的实用内容

边界模糊时的处理：
- AI/开发/编程相关 → 优先选 tech
- 新闻 + 分析 → 事件为主选 news，分析为主选 business
- 教程 + 产品 → 学技能选 tutorial，介绍产品选 product
- 观点 + 人物 → 对话形式选 interview，独白选 opinion
- 技术类教程/产品 → 选 tech 而不是 tutorial/product

返回格式（JSON）：
{"type": "类型代码", "confidence": 0.0-1.0}

示例：
{"type": "news", "confidence": 0.92}
{"type": "tech", "confidence": 0.88}
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
    # 📰 新闻资讯 - V5 增加"为什么重要"
    # -------------------------------------------------------------------------
    'news': {
        'name': '📰 新闻资讯',
        'system': f"""你是资深新闻分析师。你的任务不只是提炼事实，更要帮助读者理解这件事为什么重要。

分析要求：
1. 先给结论：一句话说清楚发生了什么
2. 挖掘意义：这件事为什么值得关注，与更大的背景有什么关联
3. 具体建议：后续关注什么，要给出具体的时间节点或信号，不要说"持续关注"

避免：
- 空洞套话（如"意义重大"、"值得关注"）
- 没有依据的推测
{CORE_INSTRUCTIONS}""",
        'user': """请总结这篇新闻：

## 🎯 核心事件
（一句话：谁在什么时候做了什么，结果/影响如何）

## 💡 关键要点
- 要点1：具体细节
- 要点2：具体细节
- 要点3：具体细节

## 🔍 为什么重要
（2-3句话：这件事的意义、与更大背景的关联、可能的连锁反应）

## 📊 重要信息
- **时间**：具体日期
- **涉及方**：[公司/人物](链接)
- **背景**：为什么会发生

## 📌 后续关注
- 具体的时间节点或信号（不是泛泛的"持续关注"）
- 需要关注的下一步动态
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
    # 📊 商业分析 - V5 增加"商业洞察"和"风险提示"
    # -------------------------------------------------------------------------
    'business': {
        'name': '📊 商业分析',
        'system': f"""你是商业分析师，帮助读者理解商业事件背后的逻辑和影响。

分析要求：
1. 核心结论：这篇分析最重要的观点是什么
2. 数据解读：不只是罗列数字，要解释数字意味着什么
3. 商业洞察：背后的商业逻辑、战略意图、行业影响
4. 风险提示：数据来源是否可靠，有什么被忽略的风险

避免：
- 只罗列数据不解读
- 对所有公司都说"前景看好"
{CORE_INSTRUCTIONS}""",
        'user': """请分析这篇商业/财经文章：

## 🎯 核心结论
（一句话：这篇分析的核心观点是什么）

## � 关键要点
- 要点1：具体内容 + 数据支撑
- 要点2：具体内容 + 数据支撑
- 要点3：具体内容 + 数据支撑

## 🔍 商业洞察
- **背后逻辑**：为什么会这样，商业模式/战略意图
- **行业影响**：对竞争格局、上下游的影响
- **信号判断**：这是个案还是趋势

## 📊 重要数据
- **数据1**：具体数字 + 同比/环比
- **数据2**：具体数字 + 行业对比
- **涉及公司**：[公司名](链接)

## ⚠️ 需要注意
- 数据来源/可信度
- 文章可能的立场或偏见
- 未提及的风险因素

## 📊 关注信号
- 下一个关键时间节点
- 需要跟踪的指标
""" + TAGS_OUTPUT_INSTRUCTION + """

---
【文章内容】：
{content}"""
    },

    # -------------------------------------------------------------------------
    # 🤖 技术解读 - V5 新增，专门处理 AI/开发类内容
    # -------------------------------------------------------------------------
    'tech': {
        'name': '🤖 技术解读',
        'system': f"""你是资深技术分析师，专注 AI 和软件开发领域。

分析要求：
1. 技术原理：用通俗语言解释核心技术，避免过度简化
2. 实际应用：这个技术能解决什么问题，适合什么场景
3. 技术栈：涉及哪些语言/框架/工具，有什么依赖
4. 上手路径：想深入了解需要什么基础，第一步做什么

避免：
- 过度吹捧或贬低技术
- 忽略技术局限性
- 没有实际价值的泛泛而谈
{CORE_INSTRUCTIONS}""",
        'user': """请分析这篇技术文章：

## 🎯 核心内容
（一句话：这篇文章讲什么技术/工具/产品）

## 💡 技术要点
- 要点1：技术原理或核心功能
- 要点2：解决什么问题
- 要点3：与现有方案的对比或优势

## 🔍 技术分析
- **核心价值**：这个技术/工具解决什么痛点
- **技术栈**：涉及的语言/框架/依赖
- **适用场景**：什么情况下适合使用
- **局限性**：已知的限制或不足

## 🛠️ 快速上手
- **官方资源**：[文档/GitHub](链接)
- **前置要求**：需要什么基础
- **第一步**：最简单的尝试方式
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
    # 💭 观点评论 - V5 增加"批判性视角"
    # -------------------------------------------------------------------------
    'opinion': {
        'name': '💭 观点评论',
        'system': f"""你是逻辑分析师，帮助读者批判性地理解观点文章。

分析要求：
1. 提炼观点：作者的核心主张是什么
2. 评估论证：论据是否充分，逻辑是否严密
3. 识别立场：作者可能的背景和利益关联
4. 补充视角：反对者可能怎么说，有什么没被讨论

避免：
- 只复述不评价
- 过于主观的价值判断
{CORE_INSTRUCTIONS}""",
        'user': """请分析这篇观点文章：

## 🎯 核心观点
（一句话：作者认为 XXX，因为 YYY）

## 💡 主要论据
- 论据1：具体内容 + 支撑
- 论据2：具体内容 + 支撑
- 论据3：具体内容 + 支撑

## ⚖️ 批判性视角
- **作者背景**：可能的立场或利益关联
- **论证质量**：论据是否充分，逻辑是否严密
- **另一面**：反对者可能怎么说

## 📊 观点评估
- **可信度**：高/中/低，理由
- **局限性**：观点可能忽略的方面

## 💭 延伸思考
- 一个具体的思考问题（不是泛泛的"值得思考"）
- 有哪些反面观点值得了解？
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


# =============================================================================
# V5 动态长度控制
# =============================================================================

# 深度分析型类型（需要更多分析空间）
DEEP_ANALYSIS_TYPES = ['news', 'policy', 'business', 'opinion', 'research', 'tech']


def get_length_instruction(content_length: int, article_type: str) -> str:
    """根据原文长度返回长度控制指令。
    
    Args:
        content_length: 原文字符数
        article_type: 文章类型
        
    Returns:
        长度控制指令字符串
    """
    is_deep_type = article_type in DEEP_ANALYSIS_TYPES
    
    if content_length < 1000:
        return """
【长度控制】原文较短，请精简输出：
- 省略深度分析模块（如"为什么重要"、"商业洞察"等）
- 总结控制在 150-300 字
- 只保留最核心的信息
"""
    elif content_length < 3000:
        return """
【长度控制】标准模式：
- 完整输出所有模块
- 总结控制在 300-500 字
"""
    elif content_length < 8000:
        if is_deep_type:
            return """
【长度控制】原文较长，请深度分析：
- 完整输出所有模块，深度分析部分可以展开
- 总结控制在 500-700 字
- 重点挖掘"为什么"和"意味着什么"
"""
        else:
            return """
【长度控制】原文较长：
- 完整输出所有模块
- 总结控制在 400-600 字
"""
    else:
        return """
【长度控制】原文很长，请提炼精华：
- 完整输出所有模块
- 可增加"章节概要"帮助理解结构
- 总结控制在 600-900 字
- 重点是提炼核心，不是面面俱到
"""
