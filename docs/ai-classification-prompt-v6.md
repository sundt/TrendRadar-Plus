# AI 分类 Prompt 优化记录（V6）

## 变更日期

2026-02-23

## 变更文件

`hotnews/kernel/scheduler/rss_scheduler.py` → `_mb_ai_prompt_text()` 函数

## 问题

原 prompt（V5）的保留规则为：

> "保留规则：当内容与科技/AI相关且有价值时 action=include，否则 exclude。"

这导致 AI 分类虽然能正确识别文章所属领域（category 字段准确），但 action 判断一刀切地以"是否科技/AI 相关"为标准。结果：

- `tech` 分类正常，优质文章被 include
- `business`、`health`、`science`、`entertainment` 等分类的优质文章因"与科技无关"被大量 exclude
- 例：一篇专业的医药行业分析（health）、一篇深度商业竞争报道（business），都被标为 exclude

这使得系统虽然积累了大量多领域的 AI 分类数据，但只有 tech 相关的 include 数据可用，无法支撑新栏目扩展。

## 各分类受影响程度（变更前数据）

通过抽样验证，以下分类的优质文章在旧 prompt 下被错误排除：

| 分类 | 日均 include | 被排除的优质文章占比 | 典型被排除案例 |
|------|------------|-------------------|-------------|
| business | 115 | 高 | "日本松下怎么被中国电池企业干趴下的" |
| health | 48 | 高 | "斯坦福团队开发通用鼻喷疫苗" |
| entertainment | 44 | 高 | "Assassin's Creed Shadows roadmap" |
| lifestyle | 33 | 高 | "选对国家，为何是普通人出海最重要的一步" |
| science | 63 | 中 | 部分沾"科技"边的被 include，纯科学的被排除 |
| education | 29 | 中 | 编程教程被 include，非技术教育被排除 |

## 变更内容

将保留规则从"科技/AI 相关性"改为"按分类判断内容质量"：

```
旧规则（1行）：
  保留规则：当内容与科技/AI相关且有价值时action=include，否则exclude。

新规则（按分类细化）：
  保留规则（action=include/exclude）：根据文章所属分类判断是否有阅读价值。
  • tech: AI/开发/技术相关且有深度或实用价值 → include
  • finance: 有具体数据、分析或投资参考价值的财经内容 → include；纯行情播报 → exclude
  • business: 涉及企业战略、行业趋势、创业深度分析 → include；企业软文/PR稿 → exclude
  • science: 有科学依据、前沿研究或科普价值 → include；伪科学/标题党 → exclude
  • health: 专业医疗资讯、研究进展、实用健康知识 → include；养生鸡汤/营销 → exclude
  • entertainment: 游戏/影视/文娱的实质性内容 → include；纯八卦/水文 → exclude
  • education: 有实际学习价值的教程、分析或职业发展内容 → include；广告/招生软文 → exclude
  • lifestyle: 有实用价值的生活资讯、消费趋势、文化深度 → include；纯广告/鸡汤 → exclude
  • sports: 赛事报道、深度分析 → include；纯比分/水文 → exclude
  • other: 不属于以上分类或无实质内容 → exclude
  通用排除：标题党、营销软文、无实质信息、重复内容一律 exclude。
```

同时更新了示例，增加非 tech 分类的 include 示例（health、business），以及 exclude 示例（营销软文）。

## 验证结果

通过 `/api/rss/ai-classification/test` 接口测试 10 篇文章：

| 文章标题 | 分类 | 旧结果 | 新结果 | 判断 |
|---------|------|--------|--------|------|
| 日本松下 vs 中国电池企业 | business | exclude | include(82) | ✅ 深度行业分析 |
| Stanford nasal spray vaccine | health | exclude | include(85) | ✅ 专业医疗研究 |
| OpenAI launches GPT-5 | tech | include | include(96) | ✅ 不变 |
| 减重巨头激战365亿新药王 | health | exclude | include(88) | ✅ 有数据的医药分析 |
| Assassins Creed roadmap | entertainment | exclude | include(87) | ✅ 游戏实质内容 |
| A股三大指数收涨 | finance | exclude | exclude(20) | ✅ 纯行情播报，正确排除 |
| 豆瓣年度读书榜单 | education | exclude | exclude(35) | ⚠️ 仅凭标题判断，有争议 |
| 全球畅销百万经典你错过了吗 | education | exclude | exclude(10) | ✅ 营销软文，正确排除 |
| 深圳全媒体运营师报名 | education | exclude | exclude(25) | ✅ 招生软文，正确排除 |
| 选对国家是出海最重要的一步 | lifestyle | exclude | include(78) | ✅ 有实用价值的分析 |

结论：tech 分类行为不变，其他分类的优质文章能被正确 include，低质量内容仍被排除。

## 附带修复

修复了 `morning_brief_routes.py` 中两处错误的导入路径：

```python
# 旧（错误）
from hotnews.web.rss_scheduler import mb_ai_test_classification
from hotnews.web.rss_scheduler import mb_ai_get_classification_stats

# 新（正确）
from hotnews.kernel.scheduler.rss_scheduler import mb_ai_test_classification
from hotnews.kernel.scheduler.rss_scheduler import mb_ai_get_classification_stats
```

## 后续注意事项

1. `_MB_AI_ALLOWED_CATEGORIES = {"AI_MODEL", "DEV_INFRA", "HARDWARE_PRO"}` 是"每日AI早报"栏目的严格过滤白名单，仅用于该栏目。新增其他分类栏目时，应直接按 `category` 字段查询，不经过此白名单。

2. 新 prompt 上线后，新标注的文章会使用新规则。历史数据（已标注的文章）不受影响，仍保持旧的 action 值。如需回填，可考虑对近期 exclude 的非 tech 文章重新标注。

3. 预计 include 文章总量会增加（各非 tech 分类的优质文章不再被排除），需观察对缓存和存储的影响。
