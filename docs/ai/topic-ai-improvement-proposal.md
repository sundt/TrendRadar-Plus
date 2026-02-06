# 主题追踪 AI 改进方案

## 背景

通过对 4 个 AI 模型的对比测试，发现以下问题：

### 测试结果汇总

| 模型 | 公众号数量 | 公众号准确率 | RSS准确率 |
|------|-----------|-------------|----------|
| 混元 Thinking | 1-3个 | 100% | 0% |
| 混元 T1 | 3个 | 100% | 0% |
| 通义千问 Plus | 3-10个 | 90-100% | 0% |
| **通义千问 Max** | **10个** | **100%** | 0% |

### 核心问题

1. **RSS 源全部无效**：所有模型生成的 RSS URL 都是编造的，验证准确率 0%
2. **混元数量太少**：虽然准确率高，但只返回 1-3 个公众号
3. **微信号不可靠**：AI 返回的 wechat_id 基本都是编造的，不能用于验证

---

## 改进方案（已实现）

### 1. 模型选择：只用 Dashscope

```
优先级：qwen3-max > qwen-plus
```

理由：
- qwen3-max 数量最多（10个公众号）
- 准确率高（100%）
- 关键词更时效（如：十五五规划、营商环境7.0）
- 混元不再使用（数量太少）

### 2. RSS 源：从数据库匹配，不依赖 AI

```
新流程：
1. AI 只生成关键词和公众号推荐（不要求 RSS）
2. RSS 源从数据库已有的 rss_sources 表中匹配
3. 匹配逻辑：关键词 LIKE 匹配 RSS 源的 name 或 description
```

### 3. 公众号验证：只用名称搜索

```
旧流程：先用 wechat_id 搜索 → 失败再用名称搜索
新流程：直接用公众号名称搜索（跳过 wechat_id）
```

理由：AI 返回的 wechat_id 基本都是编造的，用名称搜索准确率更高

### 4. Prompt 优化：不再要求返回 RSS

```
旧 Prompt：
- 找 10-15 个公众号
- 找 3-5 个 RSS 源

新 Prompt：
- 只找 10-15 个公众号
- 不要求 RSS（从数据库匹配）
```

---

## 代码改动

### 修改的文件
- `hotnews/hotnews/web/api/topic_api.py`

### 主要改动

1. `_generate_keywords_with_ai`: 改为只用 qwen3-max/qwen-plus
2. `_search_and_extract_with_dashscope`: 优化 Prompt，只要公众号
3. `_match_rss_from_database`: 新增函数，从数据库匹配 RSS
4. `_validate_ai_sources`: 公众号验证只用名称搜索
5. `_is_name_similar`: 新增函数，检查名称相似度

---

## 预期效果

| 指标 | 改进前 | 改进后 |
|------|--------|--------|
| 公众号数量 | 3-5个 | 10个 |
| 公众号准确率 | 80-100% | 100% |
| RSS 准确率 | 0% | 从数据库匹配，预计 80%+ |
| 响应速度 | 较慢（混元 thinking） | 较快（qwen3-max） |

---

## 测试脚本

已创建测试脚本用于后续验证：

```bash
# 测试所有模型
python scripts/test_ai_models.py "深圳房价"

# 只测试指定模型
python scripts/test_ai_models.py "考研" --models qwen3-max,hunyuan-t1

# 跳过验证
python scripts/test_ai_models.py "人工智能" --skip-verify
```

---

## 附录：测试数据

### 「读书」主题
- qwen3-max: 10个公众号，100%准确率
- 混元: 3个公众号，100%准确率

### 「杭州发展」主题
- qwen3-max: 10个公众号，100%准确率（杭州发布、杭州发改、钱塘发布、临平发布等）
- 混元 Thinking: 1个公众号

### 「深圳房价」主题
- qwen3-max: 10个公众号，70%准确率（用名称搜索）
- 混元: 3个公众号，100%准确率
