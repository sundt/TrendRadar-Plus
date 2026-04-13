# 模型池迁移说明

## ✅ 迁移状态：已完成并验证

**部署时间**: 2026-01-19 17:16  
**验证时间**: 2026-01-19 17:18  
**状态**: ✅ 成功运行，模型池正常工作

### 验证结果
```sql
-- 数据库统计（截至 2026-01-19 17:18）
SELECT provider, COUNT(*) as total_entries, COUNT(DISTINCT model) as unique_models 
FROM rss_entry_ai_labels 
GROUP BY provider;

-- 结果：
-- dashscope  | 32,272 | 11  (旧系统)
-- model_pool |     15 |  1  (新系统，刚启动)
-- skip       |  5,624 |  1
```

### 运行日志示例
```
AI Rotation: Model 'qwen-flash-2025-07-28' failed: HTTP 403 (quota exhausted). Switching to next...
AI Rotation: Model 'qwen3-coder-flash-2025-07-28' failed: HTTP 403 (quota exhausted). Switching to next...
AI Rotation: Model 'qwen3-30b-a3b-thinking-2507' failed: HTTP 500 (internal error). Switching to next...
INFO: mb_ai.batch ok size=6 model=qwen3-30b-a3b-instruct-2507
```

**✅ 确认**: 系统正在自动轮换模型，当模型失败时会切换到下一个可用模型。

---

## 📊 变更概述

将 AI 打标签功能从固定使用 `qwen-plus` 模型迁移到使用**模型池自动轮换**。

### 变更前
```python
# 固定使用 qwen-plus
model = "qwen-plus"
provider = "dashscope"
```

### 变更后
```python
# 使用模型池，自动轮换免费模型
model = AIModelManager.call_chat_completion(...)  # 返回实际使用的模型名
provider = "model_pool"
```

## 🎯 优势

### 1. 成本节省
- **之前**: 固定使用 qwen-plus（付费模型）
- **现在**: 自动使用模型池中的免费模型（32 个可用）

### 2. 高可用性
- **自动轮换**: 当前模型失败时自动切换到下一个
- **优先级排序**: 按 priority 字段排序（1 最高，32 最低）
- **过期检测**: 自动跳过已过期的模型

### 3. 灵活性
- 可以在 Admin 后台动态添加/删除模型
- 可以调整模型优先级
- 可以临时禁用某个模型

## 📋 当前模型池配置

### 提供商（3 个）

| ID | 名称 | 类型 | API Key |
|----|------|------|---------|
| dashscope | Aliyun DashScope | OpenAI Compatible | $DASHSCOPE_API_KEY |
| deepseek | DeepSeek | OpenAI Compatible | $DEEPSEEK_API_KEY |
| openai | OpenAI Official | OpenAI Compatible | $OPENAI_API_KEY |

### 模型列表（32 个，按优先级排序）

| 优先级 | 模型名称 | 提供商 | 过期时间 | 状态 |
|--------|----------|--------|----------|------|
| 1 | qwen3-coder-480b-a35b-instruct | dashscope | 2026/01/18 | ✅ |
| 2 | qwen3-235b-a22b-instruct-2507 | dashscope | 2026/01/18 | ✅ |
| 3 | qwen3-coder-plus | dashscope | 2026/01/18 | ✅ |
| 4 | qwen3-235b-a22b-thinking-2507 | dashscope | 2026/01/20 | ✅ |
| 5 | qwen-flash-2025-07-28 | dashscope | 2026/01/25 | ✅ |
| 6 | qwen3-coder-flash-2025-07-28 | dashscope | 2026/01/25 | ✅ |
| 7 | qwen3-coder-30b-a3b-instruct | dashscope | 2026/01/25 | ✅ |
| 8 | qwen3-30b-a3b-thinking-2507 | dashscope | 2026/01/25 | ✅ |
| 9 | qwen3-30b-a3b-instruct-2507 | dashscope | 2026/01/25 | ✅ |
| 10 | qwen3-coder-flash | dashscope | 2026/01/25 | ✅ |
| ... | ... | ... | ... | ... |
| 30 | deepseek-v3.2 | dashscope | 2026/03/03 | ✅ |
| 31 | qwen3-vl-plus-2025-12-19 | dashscope | 2026/03/19 | ✅ |
| 32 | glm-4.7 | dashscope | 2026/03/25 | ✅ |

**注意**: 所有模型都是免费的限时试用模型，会在过期时间后自动失效。

## 🔄 工作流程

### 模型选择逻辑

```
1. 从数据库加载模型池配置
   ↓
2. 过滤：
   - enabled = true
   - expires > 今天
   - provider 已启用
   ↓
3. 按 priority 排序（1 最高）
   ↓
4. 依次尝试调用
   ↓
5. 成功 → 返回结果 + 模型名
   失败 → 切换到下一个模型
   ↓
6. 所有模型都失败 → 抛出异常
```

### 示例流程

```
尝试 qwen3-coder-480b-a35b-instruct (priority=1)
  ↓ 失败（超时）
尝试 qwen3-235b-a22b-instruct-2507 (priority=2)
  ↓ 失败（限流）
尝试 qwen3-coder-plus (priority=3)
  ↓ 成功！
返回结果 + model="qwen3-coder-plus"
```

## 📝 代码变更

### 文件：`hotnews/kernel/scheduler/rss_scheduler.py`

#### 1. 函数注释更新
```python
def _mb_ai_call_qwen(items: List[Dict[str, str]]) -> List[Dict[str, Any]]:
    """Call AI Chat Completion API via AIModelManager with auto-rotation.
    
    Uses the model pool instead of fixed qwen-plus model.  # 新增说明
    Returns a list of outputs (same length/order), or raises.
    """
```

#### 2. Provider 标识更新
```python
# 之前
provider = "dashscope"

# 之后
provider = "model_pool"  # 表示使用模型池
```

#### 3. 模型名称记录
```python
# 调用 AI
outs, used_model_name = await asyncio.to_thread(_mb_ai_call_qwen, items_for_llm)

# 使用实际的模型名
if used_model_name and used_model_name != "unknown":
    model = used_model_name
```

## 🔍 验证方法

### 1. 查看数据库中记录的模型名

```sql
-- 查看最近使用的模型
SELECT 
    model, 
    provider,
    COUNT(*) as count,
    MAX(labeled_at) as last_used
FROM rss_entry_ai_labels
GROUP BY model, provider
ORDER BY last_used DESC
LIMIT 10;
```

### 2. 查看日志

```bash
# 查看容器日志
docker logs hotnews --tail 100 | grep "mb_ai"

# 应该看到类似：
# mb_ai.batch ok size=20 model=qwen3-coder-plus
```

### 3. 手动触发测试

```bash
# SSH 到服务器
ssh -p YOUR_SSH_PORT root@YOUR_SERVER_IP

# 运行一次 AI 标注
cd ~/hotnews
python3 -c "
import asyncio
from hotnews.kernel.scheduler.rss_scheduler import mb_ai_run_once
result = asyncio.run(mb_ai_run_once(batch_size=5))
print(result)
"

# 查看返回的 model 字段
```

## ⚙️ 配置说明

### 环境变量（保持不变）

```bash
# 启用 AI 标注
HOTNEWS_MB_AI_ENABLED=1

# API Keys（模型池会自动使用）
DASHSCOPE_API_KEY=your_key_here
DEEPSEEK_API_KEY=your_key_here  # 可选
OPENAI_API_KEY=your_key_here    # 可选

# 以下变量不再使用（但保留兼容性）
# HOTNEWS_MB_AI_MODEL=qwen-plus  # 不再需要，使用模型池
```

### 模型池管理

**查看模型池**:
```bash
curl http://YOUR_SERVER_IP/api/admin/ai/config
```

**更新模型优先级**:
```bash
curl -X POST http://YOUR_SERVER_IP/api/admin/ai/models \
  -H "Content-Type: application/json" \
  -d '[
    {"id": "gen_xxx", "priority": 1, "enabled": true},
    {"id": "gen_yyy", "priority": 2, "enabled": true}
  ]'
```

## 🎯 迁移步骤

### 1. 部署代码
```bash
# 提交代码
git add hotnews/kernel/scheduler/rss_scheduler.py
git commit -m "feat: migrate AI tagging to use model pool"
git push

# 快速部署
./deploy-fast.sh
```

### 2. 验证模型池配置
```bash
ssh -p YOUR_SSH_PORT root@YOUR_SERVER_IP
cd ~/hotnews
sqlite3 output/online.db "SELECT COUNT(*) FROM admin_kv WHERE key = 'ai_models'"
# 应该返回 1
```

### 3. 测试 AI 标注
```bash
# 手动触发一次
python3 -c "
import asyncio
from hotnews.kernel.scheduler.rss_scheduler import mb_ai_run_once
result = asyncio.run(mb_ai_run_once(batch_size=3))
print('Result:', result)
"
```

### 4. 观察日志
```bash
docker logs hotnews --tail 50 -f | grep "mb_ai"
```

## 📊 预期效果

### 成功标志

1. **日志显示不同的模型名**
   ```
   mb_ai.batch ok size=20 model=qwen3-coder-plus
   mb_ai.batch ok size=20 model=qwen-flash-2025-07-28
   ```

2. **数据库记录多样化**
   ```sql
   SELECT model, COUNT(*) FROM rss_entry_ai_labels 
   WHERE provider = 'model_pool' 
   GROUP BY model;
   
   -- 应该看到多个不同的模型名
   ```

3. **自动轮换工作**
   - 当某个模型失败时，自动切换到下一个
   - 日志中会有 "Switching to next..." 的警告

## 🐛 故障排查

### 问题 1: 所有模型都失败

**症状**: 
```
RuntimeError: All AI models failed
```

**原因**: 
- 所有模型都过期了
- API Key 无效
- 网络问题

**解决**:
```bash
# 检查模型池
sqlite3 output/online.db "SELECT name, expires, enabled FROM admin_kv WHERE key = 'ai_models'"

# 检查 API Key
echo $DASHSCOPE_API_KEY

# 手动测试 API
curl -X POST https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions \
  -H "Authorization: Bearer $DASHSCOPE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen-plus","messages":[{"role":"user","content":"test"}]}'
```

### 问题 2: 仍然使用 qwen-plus

**症状**: 
```sql
SELECT model FROM rss_entry_ai_labels ORDER BY labeled_at DESC LIMIT 1;
-- 返回: qwen-plus
```

**原因**: 
- 代码未部署
- 模型池为空，使用了 fallback

**解决**:
```bash
# 重新部署
./deploy-fast.sh

# 检查代码版本
ssh -p YOUR_SSH_PORT root@YOUR_SERVER_IP "cd ~/hotnews && git log -1 --oneline"
```

### 问题 3: 模型池为空

**症状**:
```
No DB-configured models found, utilizing legacy env implementation...
```

**原因**: 
- admin_kv 表中没有模型配置

**解决**:
```bash
# 初始化模型池
python3 hotnews/kernel/ai/init_db.py
```

## 📚 相关文档

- **AI_TAGGING_SYSTEM.md** - AI 打标签系统完整说明
- **TAG_SYSTEM_GUIDE.md** - 标签系统使用指南
- **hotnews/kernel/ai/manager.py** - AIModelManager 实现

---

**变更时间**: 2026-01-19  
**影响范围**: AI 自动打标签功能  
**向后兼容**: ✅ 是（保留 fallback 到环境变量）  
**需要重启**: ✅ 是（需要部署代码）
