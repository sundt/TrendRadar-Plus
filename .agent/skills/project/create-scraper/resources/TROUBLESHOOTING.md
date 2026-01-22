# 常见问题与故障排除 (Troubleshooting)

本文档汇总了开发自定义爬虫过程中的常见问题、解决方案及最佳实践，特别是针对 ScraperAPI 和特定站点的处理技巧。

## 1. ScraperAPI 相关问题

### 🔴 连接超时 / Connection Refused
**现象**：在使用 `scraperapi_get` 或直接请求 API 时，出现连接超时或被重置。
**原因**：国内网络环境（GFW）会阻断对 `http://api.scraperapi.com` 的明文访问。
**解决方案**：
*   **强制使用 HTTPS**：必须将请求地址设置为 `https://api.scraperapi.com`。
*   `DynamicPyProvider` 中的 `scraperapi_get` 辅助函数已内置此修复，请优先使用该函数而不是手动拼接 URL。

### 🟡 返回内容为空或 0 items (Blogspot 等)
**现象**：请求成功返回 200 OK，但页面内容为空，或者解析不到文章列表。
**原因**：
1.  **GDPR 弹窗**：目标网站（如 Blogspot）根据 IP 地理位置跳转到特定国家域名（如 `.fr`, `.jp`），并弹出必须点击同意的 GDPR 遮罩层，导致爬虫无法获取正文。
2.  **JS 渲染**：页面内容是动态加载的，纯 HTML 请求拿不到数据。
**解决方案**：
*   **启用 JS 渲染**：设置 `render=true`。
*   **强制美国节点**：设置 `country_code=us` 以规避 GDPR 弹窗。
*   **模拟桌面设备**：设置 `device_type=desktop`。

**代码示例**：
```python
resp = scraperapi_get(
    url,
    use_scraperapi=True,
    scraperapi_params={
        "render": "true",
        "country_code": "us",  # 关键：避免 GDPR 跳转
        "device_type": "desktop"
    }
)
```

## 2. DynamicPyProvider 沙箱环境问题

### 🔴 NameError: name 'globals' is not defined
**现象**：脚本中使用 `globals()` 获取变量时报错。
**原因**：为了安全，沙箱环境禁用了 `globals()` 等高风险内置函数。
**解决方案**：
*   严禁使用 `globals()`。
*   所需的所有上下文数据（如 `platform_id`, `use_scraperapi`）都已通过 `fetch(config, context)` 的参数传入。
*   需要使用的工具库（`requests`, `bs4` 等）已预先注入到全局命名空间，直接使用即可。

### 🟡 模块导入失败
**现象**：`ImportError: Security restricted...`
**原因**：沙箱环境使用了白名单机制，只允许导入安全的标准库。
**解决方案**：
*   仅使用白名单内的库：`requests`, `bs4`, `json`, `re`, `datetime`, `time`, `math`, `random`, `hashlib`, `base64`, `urllib`, `collections`, `typing`, `lxml`。
*   如需其他库，请联系管理员评估安全性。

## 3. 通用抓取问题

### 🟡 中文乱码
**现象**：抓取的标题或内容显示为乱码。
**解决方案**：
在获取 text 之前手动设定编码：
```python
resp = requests.get(url)
resp.encoding = 'utf-8'  # 或 'gbk', 或从 Content-Type 头解析
html = resp.text
```

### 🟡 403 Forbidden
**原因**：目标网站反爬虫拦截。
**解决方案**：
1.  添加 User-Agent 头（模拟浏览器）。
2.  开启 ScraperAPI 代理。
