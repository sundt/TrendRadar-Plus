# 主题可见性 Bug 全面分析报告

## 问题描述

**严重程度**: 🔴 P0 - 严重安全/隐私问题

**现象**: 其他用户登录后，能看到你创建的主题栏目

---

## 🔴 根本原因分析

### 问题 1: Nginx 缓存配置

```nginx
# /etc/nginx/conf.d/hot.uihash.com.conf
location = / {
    proxy_cache app_cache;
    proxy_cache_valid 200 30s;
    proxy_ignore_headers Cache-Control;  # ⚠️ 忽略后端的 no-cache 指令
}
```

### 问题 2: 阿里云 CDN 缓存

响应头显示有 CDN 层：
```
via: cache28.l2eu95-4[255,0], kunlun10.cn9041[281,0]
```

### 问题 3: 架构设计缺陷（根本原因）

**当前架构**: 主题数据在服务端渲染时注入到 HTML 中
- 用户 A 访问 → 服务端生成包含用户 A 主题的 HTML → 被 Nginx/CDN 缓存
- 用户 B 访问 → 命中缓存 → 看到用户 A 的主题

**无论如何配置缓存，只要主题数据在 HTML 中，就存在泄露风险**

---

## ✅ 推荐方案：前端动态加载主题（彻底解决）

### 核心思路

**不在服务端渲染时注入主题数据**，改为前端通过 AJAX 加载。

这样即使 HTML 页面被缓存，也不会包含任何用户的主题数据。

### 实现步骤

#### 1. 修改 `page_rendering.py` - 移除服务端主题注入

```python
# 注释掉或删除这行
# data = _inject_user_topics_as_categories(data, request)
```

#### 2. 修改 `topic-tracker.js` - 前端动态加载主题 tabs

```javascript
async function loadAndRenderTopicTabs() {
    // 检查用户是否登录
    if (!isUserLoggedIn()) return;
    
    try {
        const response = await fetch('/api/topics', { credentials: 'include' });
        const data = await response.json();
        
        if (data.ok && data.topics?.length > 0) {
            renderTopicTabs(data.topics);
        }
    } catch (e) {
        console.error('[TopicTracker] Failed to load topics:', e);
    }
}

function renderTopicTabs(topics) {
    const categoryTabs = document.querySelector('.category-tabs');
    if (!categoryTabs) return;
    
    // 找到 my-tags tab 的位置
    const myTagsTab = categoryTabs.querySelector('[data-category="my-tags"]');
    
    topics.forEach(topic => {
        const categoryId = `topic-${topic.id}`;
        
        // 检查是否已存在
        if (document.querySelector(`[data-category="${categoryId}"]`)) return;
        
        // 创建 tab
        const tab = document.createElement('div');
        tab.className = 'category-tab topic-tab';
        tab.dataset.category = categoryId;
        tab.draggable = false;
        tab.onclick = () => switchTab(categoryId);
        tab.innerHTML = `
            <span class="category-drag-handle" title="拖拽调整栏目顺序" draggable="true">☰</span>
            <div class="category-tab-icon">${topic.icon || '🏷️'}</div>
            <div class="category-tab-name">${topic.name}</div>
        `;
        
        // 插入到 my-tags 之前
        if (myTagsTab) {
            categoryTabs.insertBefore(tab, myTagsTab);
        } else {
            categoryTabs.appendChild(tab);
        }
        
        // 创建对应的 tab-pane
        createTopicTabPane(topic);
    });
}

function createTopicTabPane(topic) {
    const categoryId = `topic-${topic.id}`;
    const tabContent = document.querySelector('.tab-content');
    if (!tabContent) return;
    
    // 检查是否已存在
    if (document.getElementById(`tab-${categoryId}`)) return;
    
    const pane = document.createElement('div');
    pane.className = 'tab-pane';
    pane.id = `tab-${categoryId}`;
    pane.innerHTML = `
        <div class="topic-header">
            <div class="topic-title">
                <span class="topic-icon">${topic.icon || '🏷️'}</span>
                <span class="topic-name">${topic.name}</span>
            </div>
            <div class="topic-actions">
                <button class="topic-action-btn" onclick="TopicTracker.editTopic('${topic.id}')">✏️ 编辑</button>
                <button class="topic-action-btn danger" onclick="TopicTracker.deleteTopic('${topic.id}')">🗑️ 删除</button>
            </div>
        </div>
        <div class="cards-grid" id="topicCards-${topic.id}">
            <div class="topic-loading-state" style="text-align:center;padding:60px 20px;color:#6b7280;width:100%;">
                <div style="font-size:48px;margin-bottom:16px;">🔍</div>
                <div style="font-size:16px;">加载中...</div>
            </div>
        </div>
    `;
    
    tabContent.appendChild(pane);
}
```

#### 3. 修改 `viewer.html` - 移除服务端渲染的主题 tabs

模板中不再渲染 `is_topic` 的 category tabs，因为它们会由前端动态加载。

### 优点

1. **彻底解决缓存问题** - HTML 页面不包含任何用户特定数据，可以安全缓存
2. **性能提升** - 首页 HTML 更小，加载更快
3. **安全性** - 主题数据通过 API 获取，有完整的身份验证

### 缺点

1. **首屏体验** - 主题 tabs 会在页面加载后才出现（可通过骨架屏优化）
2. **代码改动** - 需要修改前后端代码

---

## 实现状态

### ✅ 已完成（2026-02-05）

1. **移除服务端主题注入** - `page_rendering.py` 中注释掉 `_inject_user_topics_as_categories`
2. **前端动态加载主题** - `topic-tracker.js` 添加 `loadAndRenderTopicTabs()` 函数
3. **用户登出时清除主题** - 监听 `authStateChanged` 事件
4. **骨架屏优化** - 加载主题时显示绿色骨架屏动画，提升用户体验
5. **已部署上线**

### 验证步骤

1. ✅ 部署代码：`./deploy-fast.sh`
2. 清除浏览器缓存
3. 用户 A 登录，创建主题
4. 用户 B 登录（不同浏览器/隐身模式），确认看不到用户 A 的主题
5. 用户 A 刷新页面，确认仍能看到自己的主题

---

## 备选方案：修复缓存配置

如果不想改架构，可以尝试修复缓存配置：

### 方案 A: 完全禁用首页缓存

修改 Nginx 配置：

```nginx
location = / {
    proxy_pass http://127.0.0.1:8090/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # 完全禁用缓存
    proxy_no_cache 1;
    proxy_cache_bypass 1;
    add_header X-Cache-Status "BYPASS";
}
```

### 方案 B: 按 Cookie 分别缓存

```nginx
location = / {
    proxy_pass http://127.0.0.1:8090/;
    # ...
    
    # 按 Cookie 分别缓存
    proxy_cache app_cache;
    proxy_cache_key "$scheme$request_method$host$request_uri$cookie_hotnews_session";
    proxy_cache_valid 200 30s;
    # 删除 proxy_ignore_headers Cache-Control
}
```

### 方案 C: 配置阿里云 CDN

1. 登录阿里云 CDN 控制台
2. 找到 hot.uihash.com 域名
3. 配置缓存规则：对 `/` 路径设置"不缓存"
4. 或配置"遵循源站 Cache-Control 头"

**⚠️ 注意**: 方案 A/B/C 都依赖正确配置，容易出错。推荐使用"前端动态加载"方案。
