# 我的标签容器未找到错误修复

## 问题描述

用户点击"我的标签"时，浏览器控制台出现错误：

```
index.js?v=d5426db75fc27f8353010070e0bc8851:297 [MyTags] Container #myTagsGrid not found!
```

## 根本原因

### 问题分析

1. **初始页面加载**：`page_rendering.py` 中的 `_inject_my_tags_category()` 函数会在渲染 HTML 时注入 `my-tags` 分类
2. **AJAX 刷新**：当前端调用 `/api/news` 端点刷新数据时，该端点**没有**注入 `my-tags` 分类
3. **容器丢失**：AJAX 刷新后，`my-tags` 分类从数据中消失，导致 `#myTagsGrid` 容器不会被渲染
4. **错误触发**：用户点击"我的标签"时，`my-tags.js` 尝试查找 `#myTagsGrid` 容器，但容器不存在，报错

### 代码位置

**问题代码**：`hotnews/web/server.py` 第 2452 行

```python
@app.get("/api/news")
async def api_news(...):
    # ... 获取数据 ...
    
    # ✅ 注入了 explore 分类
    try:
        cats = data.get("categories") if isinstance(data, dict) else None
        if isinstance(cats, dict) and "explore" not in cats:
            explore = {...}
            data["categories"] = {"explore": explore, **cats}
    except Exception:
        pass

    # ❌ 没有注入 my-tags 分类！
    
    try:
        data = _inject_rss_subscription_news_into_data(request=request, data=data)
    except Exception:
        pass

    return UnicodeJSONResponse(content=data)
```

## 解决方案

在 `/api/news` 端点中添加 `my-tags` 分类注入逻辑：

```python
@app.get("/api/news")
async def api_news(...):
    # ... 获取数据 ...
    
    # 注入 explore 分类
    try:
        cats = data.get("categories") if isinstance(data, dict) else None
        if isinstance(cats, dict) and "explore" not in cats:
            explore = {...}
            data["categories"] = {"explore": explore, **cats}
    except Exception:
        pass

    # ✅ 注入 my-tags 分类（必须在 RSS 注入之前）
    try:
        from .page_rendering import _inject_my_tags_category
        data = _inject_my_tags_category(data)
    except Exception:
        pass

    try:
        data = _inject_rss_subscription_news_into_data(request=request, data=data)
    except Exception:
        pass

    return UnicodeJSONResponse(content=data)
```

### 为什么要在 RSS 注入之前？

`_inject_my_tags_category()` 会将 `my-tags` 插入到分类字典的**最前面**：

```python
data["categories"] = {"my-tags": my_tags, **cats}
```

如果在 RSS 注入之后调用，可能会影响分类顺序。

## 修复文件

- `hotnews/web/server.py` - 添加 `my-tags` 分类注入

## 测试验证

### 验证步骤

1. 打开网站，点击"我的标签"
2. 打开浏览器开发者工具（F12）
3. 查看 Console，应该**没有**错误信息
4. 点击页面上的"刷新数据"按钮（触发 AJAX 刷新）
5. 再次点击"我的标签"，应该正常工作

### 预期结果

- ✅ 没有 `Container #myTagsGrid not found!` 错误
- ✅ "我的标签"功能正常
- ✅ AJAX 刷新后，"我的标签"仍然可用

## 相关代码

### 分类注入函数

**文件**：`hotnews/web/page_rendering.py`

```python
def _inject_my_tags_category(data: Dict[str, Any]) -> Dict[str, Any]:
    """Inject 'my-tags' as the first category (requires auth, loaded dynamically)."""
    try:
        cats = data.get("categories") if isinstance(data, dict) else None
        if not isinstance(cats, dict):
            return data
        if "my-tags" in cats:
            return data

        my_tags = {
            "id": "my-tags",
            "name": "我的标签",
            "icon": "🏷️",
            "platforms": {},
            "news_count": 0,
            "filtered_count": 0,
            "is_new": False,
            "requires_auth": True,
            "is_dynamic": True,
        }
        # Insert at the beginning
        data["categories"] = {"my-tags": my_tags, **cats}
        return data
    except Exception:
        return data
```

### 容器查找逻辑

**文件**：`hotnews/web/static/js/src/my-tags.js`

```javascript
async function loadMyTags(force = false) {
    // ...
    
    const container = document.getElementById('myTagsGrid');
    if (!container) {
        console.error('[MyTags] Container #myTagsGrid not found!');
        return;
    }
    
    // ...
}
```

### HTML 模板

**文件**：`hotnews/web/templates/viewer.html`

```html
{% for cat_id, category in data.categories.items() %}
    <div class="tab-pane" id="tab-{{ cat_id }}">
        {% if cat_id == 'my-tags' %}
        <div class="platform-grid" id="myTagsGrid">
            <!-- 我的标签内容 -->
        </div>
        {% endif %}
    </div>
{% endfor %}
```

## 技术细节

### 数据流

1. **初始加载**：
   - `render_viewer()` → `_inject_my_tags_category()` → HTML 包含 `my-tags`
   - 用户看到"我的标签"栏目

2. **AJAX 刷新**（修复前）：
   - `refreshViewerData()` → `/api/news` → **没有** `my-tags`
   - 前端重新渲染，`my-tags` 消失
   - 用户点击"我的标签" → 容器不存在 → 报错

3. **AJAX 刷新**（修复后）：
   - `refreshViewerData()` → `/api/news` → `_inject_my_tags_category()` → **有** `my-tags`
   - 前端重新渲染，`my-tags` 保留
   - 用户点击"我的标签" → 容器存在 → 正常工作

### 为什么初始加载没问题？

初始页面加载时，`render_viewer()` 函数会调用 `_inject_my_tags_category()`：

```python
# hotnews/web/page_rendering.py
async def render_viewer(request: Request):
    # ...
    data = _inject_explore_category(data)
    data = _inject_my_tags_category(data)  # ✅ 初始加载时注入
    # ...
```

但 AJAX 刷新时，前端调用的是 `/api/news` 端点，该端点之前没有注入 `my-tags`。

## 部署

```bash
npm run build:js
git add -A
git commit -m "fix: inject my-tags category in /api/news endpoint"
git push
./deploy-fast.sh
```

## 相关问题

- [微信浏览器兼容性修复](wechat-browser-compatibility.md) - 微信浏览器中"我的标签"点击无反应
- [我的标签白屏调试](my-tags-white-screen-debug.md) - "我的标签"显示白屏问题

## 日期

- 修复日期：2026-01-20
- 部署版本：b8c790b
