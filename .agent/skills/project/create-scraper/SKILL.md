---
name: create-scraper
description: 创建自定义新闻源爬虫
---

# 创建新闻源爬虫

## 概述
本 Skill 指导如何为新的新闻网站创建自定义爬虫 Provider，并提供**5个生产环境验证的成功案例**作为参考。

## 🎯 快速开始

### 决策流程

```mermaid
flowchart TD
    Start[新网站] --> Q0{有 RSS/Atom?}
    
    Q0 -->|是| RSS[使用内置 RSS 源]
    Q0 -->|否| Q1{数据格式?}
    
    Q1 -->|JSON API| Q2{JSON 结构?}
    Q1 -->|HTML 页面| Q3{是否动态加载?}
    
    Q2 -->|简单平铺| E1[sina_tech_roll.py]
    Q2 -->|多频道/分类| E2[wallstreetcn_flash.py]
    Q2 -->|深度嵌套| E3[nba_schedule_recursive.py]
    
    Q3 -->|静态 HTML| E4[aibase_news.py]
    Q3 -->|JS 渲染| E5[cls_depth_scraperapi.py]
    
    E1 & E2 & E3 & E4 & E5 --> Action[复制案例并修改]
```

### 成功案例库

| 案例脚本 | 适用场景 | 条目数 | 关键技术 |
|---------|---------|--------|----------|
| [wallstreetcn_flash.py](examples/wallstreetcn_flash.py) | 多频道 API | 167+ | 轮询、去重、排序 |
| [sina_tech_roll.py](examples/sina_tech_roll.py) | 简单 JSON API | 100+ | 参数请求、时间戳 |
| [aibase_news.py](examples/aibase_news.py) | 静态 HTML | 24+ | BS4 + Regex |
| [cls_depth_scraperapi.py](examples/cls_depth_scraperapi.py) | ⚠️ 动态 JS 渲染 | 30+ | ScraperAPI |
| [nba_schedule_recursive.py](examples/nba_schedule_recursive.py) | 嵌套 JSON | 311+ | 递归遍历 |

📖 **详细说明**: 查看 [examples/README.md](examples/README.md)

---

## 📝 创建步骤

### 1. 优先检查 RSS (Priority Check) 🌟

**永远优先使用原生 RSS！** 脚本仅作为最后的备选方案。

**如何发现 RSS**：
1.  **查看页面源码**：搜索 `application/rss+xml` 或 `application/atom+xml`。
    ```html
    <link rel="alternate" type="application/rss+xml" title="Qborfy" href="/atom.xml">
    ```
2.  **尝试常见后缀**：
    *   `/feed`
    *   `/rss`
    *   `/atom.xml`
    *   `/rss.xml`

**如果有 RSS**：直接在 Admin 后台添加 **RSS订阅源**，**不需要写任何代码**！

### 2. 分析目标网站 (No RSS)

**检查清单**：
- [ ] 确保**没有** RSS Feed
- [ ] 查看网络请求（Chrome DevTools → Network）
- [ ] 确定数据源：JSON API / HTML / 动态JS
- [ ] 记录所需字段：标题、URL、时间
- [ ] 检查是否需要登录或特殊请求头

### 3. 选择并复制案例

根据上面的决策流程图，选择最接近的案例脚本：

```bash
# 复制到剪贴板
cat .agent/skills/project/create-scraper/examples/sina_tech_roll.py
```

### 3. 编写爬虫代码

在 **Admin 后台 → 自定义源管理** 中创建，核心接口：

```python
def fetch(config, context):
    """
    Args:
        config (dict): 配置参数
        context (dict): 上下文 {
            'now': datetime,
            'use_scraperapi': bool,
            'platform_id': str,
            ...
        }
    
    Returns:
        list: [
            {
                "title": "标题",
                "url": "链接",
                "time": "2026-01-15 10:00",  # 可选
                "rank": 1,                    # 可选
                "published_at": 1705284000    # 可选(Unix时间戳)
            }
        ]
    """
    # 你的代码
    return items
```

### 4. 测试爬虫

在 Admin 后台点击 **"测试运行"** 验证输出：
- ✅ 返回列表格式
- ✅ 每个条目包含 `title` 和 `url`
- ✅ 时间格式正确
- ✅ 无异常错误

### 5. 清理测试脚本 ⚠️

> [!IMPORTANT]
> **测试完成后，务必删除项目根目录下的临时脚本！**

#### 方法一：自动检测并清理（推荐）

```bash
# 运行清理脚本，自动检测并提示删除
./scripts/cleanup_temp_scripts.sh
```

脚本会检测以下文件：
- `debug_*.py` - 调试脚本
- `scrape_*.py` - 临时爬虫脚本  
- `test_*.py` - 测试脚本

#### 方法二：手动清理

```bash
# 检查临时脚本
ls -la *.py | grep -E "debug_|scrape_|test_"

# 删除临时脚本  
rm debug_*.py scrape_*.py test_*.py
```

**最佳实践**：
- ✅ 直接在 Admin 后台编写和测试，无需本地文件
- ✅ 如需本地测试，使用 `/tmp/` 目录
- ✅ 使用一致的命名前缀（如 `temp_`, `debug_`）便于清理

### 6. 配置分类

将新源分配到合适的栏目分类（如"科技"、"财经"等）

---

## 🛠️ DynamicPyProvider 沙箱环境

### 🛡️ 安全沙箱限制 (Security Sandbox)

为了系统安全，爬虫脚本在受限环境中执行。

#### ✅ 允许的模块 (Allowed Modules)
仅以下模块及其子模块允许被 `import`:
- `requests`, `urllib` (网络请求)
- `bs4`, `lxml`, `html` (网页解析)
- `json`, `re`, `encodings` (数据处理)
- `datetime`, `time` (时间处理)
- `math`, `random`, `hashlib`, `base64` (基础算法)
- `collections`, `typing` (数据结构)

#### 🚫 禁止的模块 (Prohibited)
出于安全考虑，以下操作将被拒绝（`ImportError`）：
- ❌ **系统操作**: `os`, `sys`, `subprocess`, `platform` (禁止访问文件系统或执行Shell命令)
- ❌ **元编程**: `inspect`, `implib`
- ❌ **危险内置函数**: `eval()`, `exec()`, `compile()` 已被从内置空间移除

#### ⚠️ 特殊说明
- `open()` 函数：为了方便简单的文件读写目前是**允许**的，但请勿用于访问非项目文件。
- 如果需要使用未列出的标准库，请联系管理员修改 whitelist。

### 特殊函数

#### `scraperapi_get()` - ScraperAPI 请求

用于绕过反爬虫和渲染 JavaScript：

```python
# 基础用法
resp = scraperapi_get(url, use_scraperapi=True)

# 渲染 JS（如 cls_depth 案例）
resp = scraperapi_get(
    url, 
    use_scraperapi=True,
    scraperapi_params={"render": "true", "country_code": "us"},
    timeout=60
)
```

**前提条件**：
1. Admin 后台开启"使用 ScraperAPI"
2. 设置环境变量 `SCRAPERAPI_KEY`

> [!TIP]
> **常见问题与故障排除**
> 遇到连接超时、Blogspot 抓取为空或 NameError 等问题？
> 请查阅：[常见问题与故障排除 (TROUBLESHOOTING.md)](resources/TROUBLESHOOTING.md)

---

## 💡 实战技巧

### 时间格式处理

```python
# Unix 时间戳 → 字符串
import time
time_str = time.strftime("%Y-%m-%d %H:%M", time.localtime(1705284000))
# "2026-01-15 10:00"

# 字符串 → datetime
from datetime import datetime
dt = datetime.strptime("2026-01-15 10:00", "%Y-%m-%d %H:%M")
```

### 去重处理

```python
seen_ids = set()
for item in items:
    item_id = item.get("id")
    if item_id in seen_ids:
        continue
    seen_ids.add(item_id)
    results.append(item)
```

### 错误诊断与容错 (Diagnosis)

代码出错时，后台通常会显示 "Script execution error"。为了知道具体原因，**必须**使用 `try-except` 包裹核心逻辑并打印错误。

```python
def fetch(config, context):
    try:
        # 你的核心逻辑
        # ...
        
        # 调试技巧：打印中间变量，Admin 日志或测试控制台会显示 print 的内容
        # print(f"Found tag: {title_tag}")
        
    except Exception as e:
        # 关键！打印完整的错误堆栈，方便排查
        import traceback
        print(f"❌ 抓取失败: {e}")
        print(traceback.format_exc()) 
        return []
```

### 常见错误处理

```python
try:
    resp = requests.get(url, headers=headers, timeout=10)
    resp.raise_for_status()  # 检查 HTTP 状态码
except Exception as e:
    print(f"请求失败: {e}") # 会直接显示在测试结果或日志中
    return []  # 返回空列表，避免整个任务崩溃
```

### 递归遍历嵌套 JSON

参考 `nba_schedule_recursive.py`：

```python
stack = [data]
while stack:
    cur = stack.pop()
    if isinstance(cur, dict):
        if "目标字段" in cur:  # 识别目标对象
            results.append(cur)
        else:
            stack.extend(cur.values())
    elif isinstance(cur, list):
        stack.extend(cur)
```

---

## ⚠️ 常见陷阱

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 返回空列表 | URL 或参数错误 | 在浏览器中验证 API 响应 |
| 时间格式不对 | 未转换为标准格式 | 使用 `strftime()` 统一格式 |
| 编码错误 | 中文乱码 | 设置 `resp.encoding = 'utf-8'` |
| 超时 | 网络慢或反爬虫 | 增加 `timeout`，考虑 ScraperAPI |
| JS 动态内容抓不到 | 需要浏览器渲染 | 使用 `scraperapi_get()` + render |

---

## 📚 参考信息

- [成功案例详解](examples/README.md) - 5 个生产案例的技术要点
- [DynamicPyProvider 源码](../../hotnews/kernel/providers/dynamic_py.py) - 沙箱实现细节
