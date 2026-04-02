# switch-ai-model

---
name: switch-ai-model
description: 切换 Hotnews 项目的 AI 模型。先对目标模型发起 API 测试，测试通过后更新本地和服务器的 docker/.env 中的 DASHSCOPE_MODEL，重启容器并验证生效。
---

## 使用方式

用户说类似：「把模型换成 xxx」、「改成 xxx 测一下」时触发本 skill。

## 架构说明（重要）

项目已统一为**单一环境变量**控制所有 AI 调用：

- **`DASHSCOPE_MODEL`** 是唯一的模型控制变量，所有调用链均读取它：
  - `AIModelManager.call_chat_completion()` → 新闻打标签、RSS 分类
  - `favorites_api`、`summary_api`、`topic_api` → 用户内容摘要、话题生成
  - `custom_source_admin` → 爬虫 AI 检测
- `HOTNEWS_MB_AI_MODEL`、`HOTNEWS_SCRAPER_AI_MODEL` 已**不再使用**，无需更新

换模型只需改 **`DASHSCOPE_MODEL`** 一处。

## 执行步骤

### Step 1：从用户输入中提取目标模型名

- 直接使用用户提供的模型字符串，例如 `qwen-flash-character`
- API Key 从本地 `docker/.env` 读取：`DASHSCOPE_API_KEY`
- Endpoint 固定为：`https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`

### Step 2：测试目标模型（必须先测试，通过后才能更换）

运行以下 Python 测试脚本，**同时测试两个场景**：

```python
import requests, json, time

api_key = '<从.env读取的DASHSCOPE_API_KEY>'
model = '<目标模型名>'
endpoint = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
headers = {'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'}

# 测试1：基础对话（超时30s）
print('=== 测试1：基础对话 ===')
start = time.time()
payload = {
    'model': model,
    'messages': [
        {'role': 'system', 'content': '你是专业新闻分类助手。'},
        {'role': 'user', 'content': '你好，简单介绍一下你自己。'}
    ],
    'temperature': 0
}
resp = requests.post(endpoint, json=payload, headers=headers, timeout=30)
elapsed = time.time() - start
if resp.status_code == 200:
    data = resp.json()
    print(f'✅ 成功！耗时: {elapsed:.1f}s  实际模型: {data.get("model", model)}')
    print(f'回复: {data["choices"][0]["message"]["content"][:150]}')
else:
    print(f'❌ 失败({elapsed:.1f}s): {resp.status_code} {resp.text[:300]}')
    exit(1)

# 测试2：分类JSON任务（超时30s）
print()
print('=== 测试2：分类JSON任务 ===')
start = time.time()
payload2 = {
    'model': model,
    'messages': [
        {'role': 'system', 'content': '你是新闻分类助手，只输出JSON，不要其他内容。'},
        {'role': 'user', 'content': '对以下新闻打标签，输出JSON数组，每条含label字段：[{"title":"OpenAI发布GPT-5"},{"title":"A股今日大涨3%"},{"title":"苹果发布新款iPhone"}]'}
    ],
    'temperature': 0
}
resp2 = requests.post(endpoint, json=payload2, headers=headers, timeout=30)
elapsed = time.time() - start
if resp2.status_code == 200:
    data2 = resp2.json()
    content2 = data2['choices'][0]['message']['content']
    print(f'✅ 成功！耗时: {elapsed:.1f}s')
    print(f'回复: {content2}')
else:
    print(f'❌ 失败({elapsed:.1f}s): {resp2.status_code} {resp2.text[:300]}')
    exit(1)
```

**判断标准：**
- 两项测试均返回 HTTP 200 → ✅ 通过，继续 Step 3
- 任意一项失败或超时 → ❌ 停止，告知用户测试失败原因，**不更新任何配置**

### Step 3：更新本地 docker/.env（测试通过后执行）

只需更新 **一个变量**（使用 multi_replace_file_content 工具）：

```
文件路径：/Users/sun/Downloads/project/hotnews/docker/.env

DASHSCOPE_MODEL=<新模型名>
```

### Step 4：SSH 同步到生产服务器

SSH 连接信息从本地根目录 `.env` 读取（`/Users/sun/Downloads/project/hotnews/.env`）：
- `HOTNEWS_SSH_HOST`
- `HOTNEWS_SSH_USER`
- `HOTNEWS_SSH_PORT`
- `HOTNEWS_REMOTE_ROOT`（服务器项目目录，默认 `/root/hotnews`）

```bash
ssh -p <PORT> <USER>@<HOST> "
sed -i 's/DASHSCOPE_MODEL=.*/DASHSCOPE_MODEL=<新模型名>/' <REMOTE_ROOT>/docker/.env
echo '=== 验证 ==='
grep 'DASHSCOPE_MODEL' <REMOTE_ROOT>/docker/.env
"
```

### Step 5：重启服务器 hotnews 容器

```bash
ssh -p <PORT> <USER>@<HOST> "cd <REMOTE_ROOT>/docker && docker compose -f docker-compose-build.yml up -d --force-recreate hotnews && echo '✅ 容器已重启'"
```

### Step 6：验证生效

等待约 10 秒后检查日志，确认使用了新模型：

```bash
ssh -p <PORT> <USER>@<HOST> "docker logs hotnews --tail=30 2>&1 | grep -i 'model=' | tail -10"
```

预期看到类似：`AI call: model=<新模型名>`

### Step 7：输出结果汇总

| 步骤 | 状态 |
|------|------|
| 模型测试（基础对话） | ✅/❌ + 耗时 |
| 模型测试（分类JSON） | ✅/❌ + 耗时 |
| 本地 .env 更新（DASHSCOPE_MODEL） | ✅/❌ |
| 服务器 .env 同步 | ✅/❌ |
| hotnews 容器重启 | ✅/❌ |
| 日志验证 | ✅/❌ |

## 注意事项

- **必须先测试，再更换**，两项测试均通过才执行更新
- 若测试失败，不更改任何文件，直接告知用户原因
- 测试超时说明模型可能有 CoT（思维链），不适合分类等批量任务
- 只需改 `DASHSCOPE_MODEL` 一个变量，服务器重启后所有调用链自动生效
- 服务器 SSH 信息从项目根目录 `.env` 读取，不要硬编码
