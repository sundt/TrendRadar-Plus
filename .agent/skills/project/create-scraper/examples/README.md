# 成功爬虫案例库

本目录包含从生产环境数据库中提取的**5个成功运行的爬虫脚本**，作为创建新爬虫时的参考。

## 📊 案例概览

| 脚本 | 类型 | 成功条目 | 关键技术 |
|------|------|----------|----------|
| [wallstreetcn_flash.py](./wallstreetcn_flash.py) | JSON API | 167+ | 多频道轮询、去重、排序 |
| [sina_tech_roll.py](./sina_tech_roll.py) | JSON API | 100+ | 带参数请求、时间戳转换 |
| [aibase_news.py](./aibase_news.py) | HTML 解析 | 24+ | BeautifulSoup + Regex |
| [cls_depth_scraperapi.py](./cls_depth_scraperapi.py) | 动态渲染 | 30+ | ⚠️ ScraperAPI JS 渲染 |
| [nba_schedule_recursive.py](./nba_schedule_recursive.py) | 嵌套 JSON | 311+ | 递归遍历、日期过滤 |

## 🎯 使用指南

### 1. 选择合适的模板

根据目标网站的数据源类型选择：

```
数据来源是 JSON API？
├─ 简单平铺结构 → sina_tech_roll.py
├─ 多个频道/分类 → wallstreetcn_flash.py
└─ 深度嵌套结构 → nba_schedule_recursive.py

数据来源是 HTML 页面？
├─ 静态 HTML → aibase_news.py
└─ JavaScript 动态渲染 → cls_depth_scraperapi.py
```

### 2. 复制并修改

1. 复制最接近的案例脚本
2. 修改 URL 和请求参数
3. 调整数据提取逻辑（CSS选择器、JSON 路径等）
4. 在 Admin 后台测试运行

### 3. 注意关键差异

#### ⚠️ ScraperAPI（cls_depth_scraperapi.py）

**何时使用**：目标网站使用 JavaScript 动态加载内容

**前提条件**：
- 在 Admin 后台开启"使用 ScraperAPI"
- 设置环境变量 `SCRAPERAPI_KEY`

**关键代码**：
```python
scraperapi_params = {"render": "true", "country_code": "us"}
resp = scraperapi_get(url, use_scraperapi, scraperapi_params=scraperapi_params, timeout=60)
```

#### 🔄 递归 JSON 解析（nba_schedule_recursive.py）

**何时使用**：API 返回深度嵌套的 JSON，不确定具体层级

**核心技巧**：
```python
stack = [data]
while stack:
    cur = stack.pop()
    if isinstance(cur, dict):
        if "目标字段" in cur:  # 识别目标对象
            matches.append(cur)
        else:
            stack.extend(cur.values())  # 继续递归
    elif isinstance(cur, list):
        stack.extend(cur)
```

## 📝 DynamicPyProvider 接口规范

所有脚本必须实现 `fetch(config, context)` 函数：

```python
def fetch(config, context):
    # config: 配置参数（dict）
    # context: 上下文信息（包含 use_scraperapi 等）
    
    # 返回新闻列表
    return [
        {
            "title": "标题",
            "url": "链接",
            "time": "2026-01-15 10:00",  # 可选
            "rank": 1,                    # 可选
            "published_at": 1705284000    # 可选，Unix时间戳
        }
    ]
```

## 🛠️ 沙箱环境可用模块

以下模块已预导入，可直接使用：
- `requests` - HTTP 请求
- `bs4` (BeautifulSoup) - HTML 解析
- `re` - 正则表达式
- `json` - JSON 处理
- `datetime` - 时间处理
- `time` - 时间工具
- `hashlib` - 哈希计算

## 💡 常见技巧

### 时间格式转换

```python
# Unix 时间戳 → 字符串
import time
time_str = time.strftime("%Y-%m-%d %H:%M", time.localtime(timestamp))

# 字符串 → datetime
from datetime import datetime
dt = datetime.strptime("2026-01-15 10:00", "%Y-%m-%d %H:%M")
```

### 去重处理

```python
seen = set()
for item in items:
    if item_id in seen:
        continue
    seen.add(item_id)
    # 处理 item
```

### 错误容错

```python
try:
    # 可能出错的代码
    resp = requests.get(url, timeout=10)
except Exception as e:
    print(f"Error: {e}")
    return []  # 返回空列表而不是崩溃
```
