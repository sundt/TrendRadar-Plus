# 多平台发布系统 - 技术设计文档

> 基于 multi-platform-publisher-spec.md 方案的技术实现设计

---

## 一、系统组件

### 1.1 组件总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        HotNews 后端                              │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │  Draft API    │  │  Import API   │  │  Upload API   │       │
│  │  草稿管理     │  │  内容导入     │  │  图片上传     │       │
│  └───────────────┘  └───────────────┘  └───────────────┘       │
│  ┌───────────────┐  ┌───────────────┐                          │
│  │  Polish API   │  │  History API  │                          │
│  │  AI 润色      │  │  发布历史     │                          │
│  └───────────────┘  └───────────────┘                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        HotNews 前端                              │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │  Editor Page  │  │  Drafts Page  │  │  Publish UI   │       │
│  │  编辑器页面   │  │  草稿列表     │  │  发布组件     │       │
│  └───────────────┘  └───────────────┘  └───────────────┘       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     hotnews-summarizer 插件                      │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │ Publish Bridge│  │  Platform     │  │  Login Check  │       │
│  │ 网页通信桥    │  │  Adapters     │  │  登录检测     │       │
│  └───────────────┘  └───────────────┘  └───────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 目录结构设计

**HotNews 后端新增：**
```
hotnews/
├── hotnews/
│   └── web/
│       ├── api/
│       │   └── publisher/           # 新增
│       │       ├── __init__.py
│       │       ├── drafts.py        # 草稿 CRUD
│       │       ├── import_content.py # 内容导入
│       │       ├── upload.py        # 图片上传
│       │       ├── polish.py        # AI 润色
│       │       └── history.py       # 发布历史
│       ├── models/
│       │   └── publisher.py         # 新增：数据模型
│       └── static/
│           └── write/               # 新增：编辑器前端
│               ├── index.html
│               ├── editor.js
│               ├── editor.css
│               └── lib/             # Tiptap 等依赖
```

**HotNews 前端新增：**
```
hotnews/
└── hotnews/
    └── web/
        └── static/
            └── js/
                └── publisher/       # 新增
                    ├── draft-button.js   # 「转草稿」按钮组件
                    └── member-check.js   # 会员权限检查
```

**插件新增：**
```
hotnews-summarizer/
├── publish/                    # 新增
│   ├── bridge.js              # 网页通信桥
│   ├── manager.js             # 发布流程管理
│   ├── login-checker.js       # 登录状态检测
│   └── adapters/              # 平台适配器
│       ├── index.js
│       ├── zhihu.js
│       ├── juejin.js
│       ├── csdn.js
│       └── weixin.js
└── content/
    └── publish-bridge.js      # 注入到 hot.uihash.com
```

---

## 二、数据库设计

### 2.1 新增表

```sql
-- 草稿表
CREATE TABLE IF NOT EXISTS drafts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    digest TEXT DEFAULT '',
    cover_url TEXT DEFAULT '',
    html_content TEXT NOT NULL DEFAULT '',
    markdown_content TEXT DEFAULT '',
    import_type TEXT DEFAULT 'manual',
    import_source_id TEXT DEFAULT '',
    import_source_url TEXT DEFAULT '',
    status TEXT DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_drafts_user_id ON drafts(user_id);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);
CREATE INDEX IF NOT EXISTS idx_drafts_updated_at ON drafts(updated_at DESC);

-- 发布历史表
CREATE TABLE IF NOT EXISTS publish_history (
    id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    status TEXT NOT NULL,
    platform_url TEXT DEFAULT '',
    error_message TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_publish_history_draft_id ON publish_history(draft_id);
CREATE INDEX IF NOT EXISTS idx_publish_history_user_id ON publish_history(user_id);

-- 临时图片表（可选，用于追踪临时文件）
CREATE TABLE IF NOT EXISTS temp_images (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    original_name TEXT,
    file_size INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_temp_images_expires_at ON temp_images(expires_at);
```

### 2.2 迁移脚本

```python
# hotnews/hotnews/web/migrations/add_publisher_tables.py

def upgrade(db):
    """创建发布系统相关表"""
    db.executescript('''
        -- drafts table
        CREATE TABLE IF NOT EXISTS drafts (...);
        -- publish_history table  
        CREATE TABLE IF NOT EXISTS publish_history (...);
        -- temp_images table
        CREATE TABLE IF NOT EXISTS temp_images (...);
    ''')

def downgrade(db):
    """回滚"""
    db.executescript('''
        DROP TABLE IF EXISTS temp_images;
        DROP TABLE IF EXISTS publish_history;
        DROP TABLE IF EXISTS drafts;
    ''')
```

---

## 三、API 设计详细

### 3.1 草稿 API

```python
# POST /api/publisher/drafts
# 创建草稿
Request:
{
    "title": "文章标题",
    "digest": "摘要",
    "cover_url": "https://...",
    "html_content": "<p>正文</p>",
    "markdown_content": "正文",
    "import_type": "manual",  # manual|news|summary|collection|url|upload
    "import_source_id": "",
    "import_source_url": ""
}
Response:
{
    "ok": true,
    "data": {
        "id": "uuid",
        "created_at": "2026-02-02T10:00:00Z"
    }
}

# GET /api/publisher/drafts
# 获取草稿列表
Query: page=1, page_size=20, status=draft
Response:
{
    "ok": true,
    "data": {
        "items": [...],
        "total": 100,
        "page": 1,
        "page_size": 20
    }
}

# GET /api/publisher/drafts/{draft_id}
# 获取单个草稿

# PUT /api/publisher/drafts/{draft_id}
# 更新草稿

# DELETE /api/publisher/drafts/{draft_id}
# 删除草稿
```

### 3.2 内容导入 API

```python
# GET /api/publisher/import/news/{news_id}
# 从新闻导入
Response:
{
    "ok": true,
    "data": {
        "title": "新闻标题",
        "content": "<p>新闻内容</p>",
        "cover_url": "https://...",
        "source_url": "https://原文链接"
    }
}

# POST /api/publisher/import/url
# 从 URL 导入（后端代理抓取）
Request: { "url": "https://example.com/article" }

# POST /api/publisher/import/upload
# 上传文档导入
Request: multipart/form-data, file=xxx.pdf
```

### 3.3 图片上传 API

```python
# POST /api/publisher/upload/image
Request: multipart/form-data
    file: 图片文件
    type: cover|content
Response:
{
    "ok": true,
    "data": {
        "temp_id": "uuid",
        "url": "/api/publisher/image/uuid",
        "width": 800,
        "height": 600,
        "expires_at": "2026-02-09T10:00:00Z"
    }
}

# GET /api/publisher/image/{temp_id}
# 获取临时图片

# DELETE /api/publisher/upload/cleanup
# 清理过期图片（定时任务调用）
```


---

## 四、前端设计

### 4.1 编辑器页面结构

```html
<!-- /write/index.html -->
<!DOCTYPE html>
<html>
<head>
    <title>编辑文章 - HotNews</title>
    <link rel="stylesheet" href="editor.css">
</head>
<body>
    <div id="app">
        <!-- 顶部工具栏 -->
        <header class="editor-header">
            <input type="text" id="title" placeholder="请输入标题" maxlength="64">
            <div class="header-actions">
                <span class="save-status">已保存</span>
                <button id="btn-drafts">草稿箱</button>
                <button id="btn-publish" class="primary">发布</button>
            </div>
        </header>
        
        <!-- 封面上传 -->
        <div class="cover-upload">
            <div id="cover-preview"></div>
            <button id="btn-upload-cover">上传封面</button>
        </div>
        
        <!-- 摘要 -->
        <textarea id="digest" placeholder="请输入摘要（选填）" maxlength="200"></textarea>
        
        <!-- Tiptap 编辑器 -->
        <div id="editor"></div>
        
        <!-- 发布弹窗 -->
        <div id="publish-modal" class="modal hidden">
            <div class="modal-content">
                <h3>选择发布平台</h3>
                <div class="platform-list">
                    <label><input type="checkbox" value="zhihu"> 知乎专栏</label>
                    <label><input type="checkbox" value="juejin"> 掘金</label>
                    <label><input type="checkbox" value="csdn"> CSDN</label>
                    <label><input type="checkbox" value="weixin"> 微信公众号</label>
                </div>
                <div class="modal-actions">
                    <button id="btn-cancel">取消</button>
                    <button id="btn-confirm-publish" class="primary">确认发布</button>
                </div>
            </div>
        </div>
    </div>
    
    <script type="module" src="editor.js"></script>
</body>
</html>
```

### 4.2 编辑器核心逻辑

```javascript
// editor.js 核心结构
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'

class ArticleEditor {
    constructor() {
        this.draftId = null;
        this.editor = null;
        this.autoSaveTimer = null;
        this.isDirty = false;
    }
    
    async init() {
        // 1. 检查登录和会员状态
        await this.checkAuth();
        
        // 2. 初始化 Tiptap 编辑器
        this.initEditor();
        
        // 3. 加载草稿（如果有）
        await this.loadDraft();
        
        // 4. 启动自动保存
        this.startAutoSave();
        
        // 5. 绑定事件
        this.bindEvents();
    }
    
    async checkAuth() {
        const user = await fetch('/api/user/me').then(r => r.json());
        if (!user.ok) {
            window.location.href = '/login?redirect=/write';
            return;
        }
        if (!user.data.is_member) {
            window.location.href = '/membership?from=write';
            return;
        }
    }
    
    initEditor() {
        this.editor = new Editor({
            element: document.querySelector('#editor'),
            extensions: [StarterKit, Image],
            content: '',
            onUpdate: () => {
                this.isDirty = true;
                this.saveToLocal();
            }
        });
    }
    
    startAutoSave() {
        this.autoSaveTimer = setInterval(() => {
            if (this.isDirty) {
                this.saveDraft();
            }
        }, 30000); // 30秒
    }
    
    saveToLocal() {
        // localStorage 备份
        const backup = {
            draftId: this.draftId,
            title: document.querySelector('#title').value,
            content: this.editor.getHTML(),
            savedAt: Date.now()
        };
        localStorage.setItem('hotnews_draft_backup', JSON.stringify(backup));
    }
    
    async saveDraft() {
        const data = {
            title: document.querySelector('#title').value,
            digest: document.querySelector('#digest').value,
            html_content: this.editor.getHTML(),
            cover_url: this.coverUrl || ''
        };
        
        if (this.draftId) {
            await fetch(`/api/publisher/drafts/${this.draftId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } else {
            const res = await fetch('/api/publisher/drafts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            this.draftId = result.data.id;
            history.replaceState(null, '', `/write/${this.draftId}`);
        }
        
        this.isDirty = false;
        this.updateSaveStatus('已保存');
    }
    
    async publish() {
        // 显示平台选择弹窗
        document.querySelector('#publish-modal').classList.remove('hidden');
    }
    
    async confirmPublish(platforms) {
        // 通过 postMessage 与插件通信
        const articleData = {
            title: document.querySelector('#title').value,
            digest: document.querySelector('#digest').value,
            cover: { url: this.coverUrl },
            htmlContent: this.editor.getHTML()
        };
        
        window.postMessage({
            type: 'HOTNEWS_PUBLISH',
            action: 'publish',
            payload: { platforms, data: articleData }
        }, '*');
    }
}

// 启动
const editor = new ArticleEditor();
editor.init();
```

---

## 五、插件设计

### 5.1 通信桥接

```javascript
// publish/bridge.js
// 注入到 hot.uihash.com 的 content script

class PublishBridge {
    constructor() {
        this.init();
    }
    
    init() {
        // 监听网页消息
        window.addEventListener('message', this.handleMessage.bind(this));
        
        // 通知网页插件已就绪
        window.postMessage({
            type: 'HOTNEWS_PUBLISH_RESPONSE',
            action: 'ready',
            success: true,
            data: { version: chrome.runtime.getManifest().version }
        }, '*');
    }
    
    async handleMessage(event) {
        if (event.data?.type !== 'HOTNEWS_PUBLISH') return;
        
        const { action, payload } = event.data;
        
        switch (action) {
            case 'check_installed':
                this.respondInstalled();
                break;
            case 'check_login':
                await this.checkPlatformLogin(payload.platforms);
                break;
            case 'publish':
                await this.startPublish(payload);
                break;
        }
    }
    
    respondInstalled() {
        window.postMessage({
            type: 'HOTNEWS_PUBLISH_RESPONSE',
            action: 'check_installed',
            success: true,
            data: { 
                installed: true, 
                version: chrome.runtime.getManifest().version 
            }
        }, '*');
    }
    
    async checkPlatformLogin(platforms) {
        const response = await chrome.runtime.sendMessage({
            type: 'CHECK_PLATFORM_LOGIN',
            platforms
        });
        
        window.postMessage({
            type: 'HOTNEWS_PUBLISH_RESPONSE',
            action: 'check_login',
            success: true,
            data: response
        }, '*');
    }
    
    async startPublish(payload) {
        const response = await chrome.runtime.sendMessage({
            type: 'PUBLISH_ARTICLE',
            payload
        });
        
        window.postMessage({
            type: 'HOTNEWS_PUBLISH_RESPONSE',
            action: 'publish',
            ...response
        }, '*');
    }
}

new PublishBridge();
```

### 5.2 发布管理器

```javascript
// publish/manager.js
// Background script 中的发布管理

class PublishManager {
    constructor() {
        this.adapters = {};
        this.loadAdapters();
    }
    
    loadAdapters() {
        this.adapters = {
            zhihu: new ZhihuAdapter(),
            juejin: new JuejinAdapter(),
            csdn: new CSDNAdapter(),
            weixin: new WeixinAdapter()
        };
    }
    
    async checkLogin(platforms) {
        const results = [];
        for (const platform of platforms) {
            const adapter = this.adapters[platform];
            if (adapter) {
                const status = await adapter.checkLogin();
                results.push({ platform, ...status });
            }
        }
        return results;
    }
    
    async publish(platforms, articleData) {
        const results = [];
        
        for (const platform of platforms) {
            const adapter = this.adapters[platform];
            if (!adapter) {
                results.push({
                    platform,
                    status: 'failed',
                    error: { code: 'UNSUPPORTED', message: '不支持的平台' }
                });
                continue;
            }
            
            try {
                // 创建标签页
                const tab = await chrome.tabs.create({ 
                    url: adapter.editUrl,
                    active: false 
                });
                
                // 等待页面加载
                await this.waitForTabLoad(tab.id);
                
                // 注入并执行
                const result = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: adapter.inject,
                    args: [articleData]
                });
                
                results.push({
                    platform,
                    status: 'success',
                    tabId: tab.id
                });
                
            } catch (error) {
                results.push({
                    platform,
                    status: 'failed',
                    error: { 
                        code: 'INJECT_ERROR', 
                        message: error.message,
                        retryable: true 
                    }
                });
            }
        }
        
        return { success: true, data: { results } };
    }
    
    waitForTabLoad(tabId) {
        return new Promise((resolve) => {
            chrome.tabs.onUpdated.addListener(function listener(id, info) {
                if (id === tabId && info.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve();
                }
            });
        });
    }
}
```

### 5.3 平台适配器示例（知乎）

```javascript
// publish/adapters/zhihu.js

class ZhihuAdapter {
    name = 'zhihu';
    displayName = '知乎专栏';
    editUrl = 'https://zhuanlan.zhihu.com/write';
    
    async checkLogin() {
        const cookie = await chrome.cookies.get({
            url: 'https://www.zhihu.com',
            name: 'z_c0'
        });
        return {
            isLoggedIn: !!cookie,
            platform: this.name
        };
    }
    
    // 注入函数（在目标页面执行）
    inject(articleData) {
        return new Promise(async (resolve, reject) => {
            try {
                // 等待编辑器加载
                const titleInput = await waitForElement('textarea[placeholder*="标题"]');
                const editor = await waitForElement('.public-DraftEditor-content');
                
                // 填充标题
                titleInput.value = articleData.title;
                titleInput.dispatchEvent(new Event('input', { bubbles: true }));
                
                // 填充正文（模拟粘贴）
                editor.focus();
                const pasteEvent = new ClipboardEvent('paste', {
                    bubbles: true,
                    clipboardData: new DataTransfer()
                });
                pasteEvent.clipboardData.setData('text/html', articleData.htmlContent);
                editor.dispatchEvent(pasteEvent);
                
                resolve({ success: true });
            } catch (error) {
                reject(error);
            }
        });
        
        function waitForElement(selector, timeout = 10000) {
            return new Promise((resolve, reject) => {
                const el = document.querySelector(selector);
                if (el) return resolve(el);
                
                const observer = new MutationObserver(() => {
                    const el = document.querySelector(selector);
                    if (el) {
                        observer.disconnect();
                        resolve(el);
                    }
                });
                
                observer.observe(document.body, { childList: true, subtree: true });
                
                setTimeout(() => {
                    observer.disconnect();
                    reject(new Error(`Element ${selector} not found`));
                }, timeout);
            });
        }
    }
}
```

---

## 六、安全设计

### 6.1 权限验证

```python
# 装饰器：验证会员权限
def require_member(func):
    @wraps(func)
    async def wrapper(request, *args, **kwargs):
        user = await get_current_user(request)
        if not user:
            raise HTTPException(401, "未登录")
        if not user.is_member:
            raise HTTPException(403, "需要会员权限")
        return await func(request, *args, **kwargs)
    return wrapper

# 使用
@router.post("/drafts")
@require_member
async def create_draft(request: Request, data: DraftCreate):
    ...
```

### 6.2 数据隔离

```python
# 确保用户只能访问自己的草稿
async def get_draft(draft_id: str, user_id: str):
    draft = await db.get_draft(draft_id)
    if not draft:
        raise HTTPException(404, "草稿不存在")
    if draft.user_id != user_id:
        raise HTTPException(403, "无权访问")
    return draft
```

### 6.3 图片上传安全

```python
# 图片上传限制
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB

async def upload_image(file: UploadFile, user_id: str):
    # 检查文件类型
    ext = file.filename.split('.')[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, "不支持的图片格式")
    
    # 检查文件大小
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, "图片大小不能超过 5MB")
    
    # 生成安全的文件名
    temp_id = str(uuid.uuid4())
    safe_filename = f"{temp_id}.{ext}"
    
    # 保存文件
    ...
```


---

## 七、遗漏细节补充

### 7.1 边界情况处理

#### 标题/摘要限制
```python
# 字符限制常量
TITLE_MAX_LENGTH = 64
DIGEST_MAX_LENGTH = 200
CONTENT_MAX_LENGTH = 100000  # 约 10 万字

# 验证
def validate_draft(data: DraftCreate):
    if len(data.title) > TITLE_MAX_LENGTH:
        raise HTTPException(400, f"标题不能超过 {TITLE_MAX_LENGTH} 字")
    if data.digest and len(data.digest) > DIGEST_MAX_LENGTH:
        raise HTTPException(400, f"摘要不能超过 {DIGEST_MAX_LENGTH} 字")
    if len(data.html_content) > CONTENT_MAX_LENGTH:
        raise HTTPException(400, "内容过长")
```

#### 并发编辑冲突
```python
# 使用乐观锁
class Draft:
    version: int  # 版本号

async def update_draft(draft_id: str, data: DraftUpdate, expected_version: int):
    result = await db.execute(
        "UPDATE drafts SET ... WHERE id = ? AND version = ?",
        [draft_id, expected_version]
    )
    if result.rowcount == 0:
        raise HTTPException(409, "草稿已被修改，请刷新后重试")
```

#### 图片 URL 失效处理
```javascript
// 编辑器中图片加载失败处理
editor.on('imageLoadError', (src) => {
    // 显示占位图
    return '/static/images/image-broken.png';
});
```

### 7.2 平台特殊限制

| 平台 | 标题限制 | 内容限制 | 图片限制 | 特殊要求 |
|------|----------|----------|----------|----------|
| 微信公众号 | 64 字 | 2 万字 | 10MB/张 | 封面必填 |
| 知乎 | 100 字 | 无限制 | 5MB/张 | - |
| 掘金 | 80 字 | 无限制 | 5MB/张 | 需选分类 |
| CSDN | 100 字 | 无限制 | 5MB/张 | - |

```javascript
// 发布前校验
function validateForPlatform(platform, article) {
    const limits = PLATFORM_LIMITS[platform];
    const errors = [];
    
    if (article.title.length > limits.titleMax) {
        errors.push(`${platform} 标题不能超过 ${limits.titleMax} 字`);
    }
    if (limits.coverRequired && !article.cover) {
        errors.push(`${platform} 需要设置封面`);
    }
    
    return errors;
}
```

### 7.3 网络异常处理

```javascript
// API 请求封装
async function apiRequest(url, options, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, {
                ...options,
                signal: AbortSignal.timeout(30000)  // 30秒超时
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            if (i === retries - 1) throw error;
            await sleep(1000 * (i + 1));  // 递增延迟
        }
    }
}

// 离线检测
window.addEventListener('offline', () => {
    showToast('网络已断开，草稿将保存到本地');
});

window.addEventListener('online', () => {
    showToast('网络已恢复，正在同步草稿...');
    syncLocalDrafts();
});
```

### 7.4 XSS 防护

```python
import bleach

# 允许的 HTML 标签
ALLOWED_TAGS = [
    'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'em', 'u', 's', 'blockquote', 'code', 'pre',
    'ul', 'ol', 'li', 'a', 'img', 'table', 'tr', 'td', 'th'
]

ALLOWED_ATTRIBUTES = {
    'a': ['href', 'title'],
    'img': ['src', 'alt', 'width', 'height'],
    '*': ['class']
}

def sanitize_html(html_content: str) -> str:
    return bleach.clean(
        html_content,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        strip=True
    )
```

### 7.5 日志记录

```python
import logging

logger = logging.getLogger('publisher')

# 关键操作日志
async def create_draft(user_id: str, data: DraftCreate):
    draft = await db.create_draft(user_id, data)
    logger.info(f"Draft created: user={user_id}, draft_id={draft.id}")
    return draft

async def publish_to_platform(user_id: str, draft_id: str, platform: str):
    logger.info(f"Publish started: user={user_id}, draft={draft_id}, platform={platform}")
    try:
        result = await do_publish(...)
        logger.info(f"Publish success: draft={draft_id}, platform={platform}")
    except Exception as e:
        logger.error(f"Publish failed: draft={draft_id}, platform={platform}, error={e}")
        raise
```


---

## 八、自动化测试方案

### 8.1 测试分层

```
┌─────────────────────────────────────────────────────────────┐
│                      测试金字塔                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                    ┌─────────┐                              │
│                    │  E2E    │  ← 少量，关键流程            │
│                    │ (10%)   │                              │
│                 ┌──┴─────────┴──┐                           │
│                 │   集成测试    │  ← API 接口测试           │
│                 │    (30%)     │                            │
│              ┌──┴───────────────┴──┐                        │
│              │      单元测试       │  ← 核心逻辑            │
│              │       (60%)        │                         │
│              └─────────────────────┘                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 后端测试（pytest）

#### 目录结构
```
tests/
├── unit/                    # 单元测试
│   └── publisher/
│       ├── test_draft_service.py
│       ├── test_import_service.py
│       ├── test_upload_service.py
│       └── test_sanitize.py
├── integration/             # 集成测试
│   └── publisher/
│       ├── test_draft_api.py
│       ├── test_import_api.py
│       └── test_upload_api.py
└── conftest.py              # 测试配置和 fixtures
```

#### conftest.py
```python
import pytest
from fastapi.testclient import TestClient
from hotnews.web.app import app
from hotnews.web.models.publisher import init_publisher_tables

@pytest.fixture
def client():
    """测试客户端"""
    return TestClient(app)

@pytest.fixture
def test_db(tmp_path):
    """临时测试数据库"""
    db_path = tmp_path / "test.db"
    init_publisher_tables(str(db_path))
    yield db_path

@pytest.fixture
def mock_member_user(mocker):
    """模拟会员用户"""
    mocker.patch('hotnews.web.api.publisher.get_current_user', return_value={
        'id': 'test_user_123',
        'is_member': True
    })

@pytest.fixture
def mock_non_member_user(mocker):
    """模拟非会员用户"""
    mocker.patch('hotnews.web.api.publisher.get_current_user', return_value={
        'id': 'test_user_456',
        'is_member': False
    })
```

#### 单元测试示例
```python
# tests/unit/publisher/test_draft_service.py

import pytest
from hotnews.web.services.publisher import DraftService

class TestDraftService:
    
    def test_create_draft_success(self, test_db):
        service = DraftService(test_db)
        draft = service.create_draft(
            user_id='user_123',
            title='测试标题',
            html_content='<p>测试内容</p>'
        )
        assert draft.id is not None
        assert draft.title == '测试标题'
        assert draft.status == 'draft'
    
    def test_create_draft_title_too_long(self, test_db):
        service = DraftService(test_db)
        with pytest.raises(ValueError, match="标题不能超过"):
            service.create_draft(
                user_id='user_123',
                title='x' * 100,  # 超过 64 字
                html_content='<p>内容</p>'
            )
    
    def test_create_draft_empty_title(self, test_db):
        service = DraftService(test_db)
        with pytest.raises(ValueError, match="标题不能为空"):
            service.create_draft(
                user_id='user_123',
                title='',
                html_content='<p>内容</p>'
            )
    
    def test_update_draft_not_found(self, test_db):
        service = DraftService(test_db)
        with pytest.raises(ValueError, match="草稿不存在"):
            service.update_draft('non_existent_id', user_id='user_123', title='新标题')
    
    def test_update_draft_permission_denied(self, test_db):
        service = DraftService(test_db)
        draft = service.create_draft(user_id='user_123', title='标题', html_content='<p>内容</p>')
        with pytest.raises(PermissionError, match="无权访问"):
            service.update_draft(draft.id, user_id='other_user', title='新标题')
    
    def test_delete_draft_cascade_history(self, test_db):
        """删除草稿时级联删除发布历史"""
        service = DraftService(test_db)
        draft = service.create_draft(user_id='user_123', title='标题', html_content='<p>内容</p>')
        service.add_publish_history(draft.id, 'user_123', 'zhihu', 'success')
        
        service.delete_draft(draft.id, user_id='user_123')
        
        history = service.get_publish_history(draft.id)
        assert len(history) == 0


class TestSanitizeHtml:
    
    def test_remove_script_tag(self):
        from hotnews.web.services.publisher import sanitize_html
        html = '<p>Hello</p><script>alert("xss")</script>'
        result = sanitize_html(html)
        assert '<script>' not in result
        assert 'alert' not in result
    
    def test_remove_onclick(self):
        from hotnews.web.services.publisher import sanitize_html
        html = '<p onclick="alert(1)">Click me</p>'
        result = sanitize_html(html)
        assert 'onclick' not in result
    
    def test_allow_safe_tags(self):
        from hotnews.web.services.publisher import sanitize_html
        html = '<p><strong>Bold</strong> and <em>italic</em></p>'
        result = sanitize_html(html)
        assert '<strong>' in result
        assert '<em>' in result
```

#### 集成测试示例
```python
# tests/integration/publisher/test_draft_api.py

import pytest

class TestDraftAPI:
    
    def test_create_draft_success(self, client, mock_member_user):
        response = client.post('/api/publisher/drafts', json={
            'title': '测试文章',
            'html_content': '<p>这是内容</p>'
        })
        assert response.status_code == 200
        data = response.json()
        assert data['ok'] is True
        assert 'id' in data['data']
    
    def test_create_draft_unauthorized(self, client):
        """未登录不能创建草稿"""
        response = client.post('/api/publisher/drafts', json={
            'title': '测试',
            'html_content': '<p>内容</p>'
        })
        assert response.status_code == 401
    
    def test_create_draft_non_member(self, client, mock_non_member_user):
        """非会员不能创建草稿"""
        response = client.post('/api/publisher/drafts', json={
            'title': '测试',
            'html_content': '<p>内容</p>'
        })
        assert response.status_code == 403
    
    def test_get_drafts_list(self, client, mock_member_user):
        # 先创建几个草稿
        for i in range(3):
            client.post('/api/publisher/drafts', json={
                'title': f'草稿 {i}',
                'html_content': f'<p>内容 {i}</p>'
            })
        
        response = client.get('/api/publisher/drafts')
        assert response.status_code == 200
        data = response.json()
        assert data['ok'] is True
        assert len(data['data']['items']) == 3
    
    def test_get_drafts_pagination(self, client, mock_member_user):
        # 创建 25 个草稿
        for i in range(25):
            client.post('/api/publisher/drafts', json={
                'title': f'草稿 {i}',
                'html_content': f'<p>内容 {i}</p>'
            })
        
        # 第一页
        response = client.get('/api/publisher/drafts?page=1&page_size=10')
        data = response.json()
        assert len(data['data']['items']) == 10
        assert data['data']['total'] == 25
        
        # 第三页
        response = client.get('/api/publisher/drafts?page=3&page_size=10')
        data = response.json()
        assert len(data['data']['items']) == 5
    
    def test_update_draft(self, client, mock_member_user):
        # 创建
        create_resp = client.post('/api/publisher/drafts', json={
            'title': '原标题',
            'html_content': '<p>原内容</p>'
        })
        draft_id = create_resp.json()['data']['id']
        
        # 更新
        update_resp = client.put(f'/api/publisher/drafts/{draft_id}', json={
            'title': '新标题'
        })
        assert update_resp.status_code == 200
        
        # 验证
        get_resp = client.get(f'/api/publisher/drafts/{draft_id}')
        assert get_resp.json()['data']['title'] == '新标题'
    
    def test_delete_draft(self, client, mock_member_user):
        # 创建
        create_resp = client.post('/api/publisher/drafts', json={
            'title': '待删除',
            'html_content': '<p>内容</p>'
        })
        draft_id = create_resp.json()['data']['id']
        
        # 删除
        delete_resp = client.delete(f'/api/publisher/drafts/{draft_id}')
        assert delete_resp.status_code == 200
        
        # 验证已删除
        get_resp = client.get(f'/api/publisher/drafts/{draft_id}')
        assert get_resp.status_code == 404


class TestUploadAPI:
    
    def test_upload_image_success(self, client, mock_member_user, tmp_path):
        # 创建测试图片
        image_path = tmp_path / "test.png"
        image_path.write_bytes(b'\x89PNG\r\n\x1a\n' + b'\x00' * 100)
        
        with open(image_path, 'rb') as f:
            response = client.post(
                '/api/publisher/upload/image',
                files={'file': ('test.png', f, 'image/png')}
            )
        
        assert response.status_code == 200
        data = response.json()
        assert 'temp_id' in data['data']
        assert 'url' in data['data']
    
    def test_upload_invalid_type(self, client, mock_member_user, tmp_path):
        # 创建非图片文件
        file_path = tmp_path / "test.exe"
        file_path.write_bytes(b'MZ' + b'\x00' * 100)
        
        with open(file_path, 'rb') as f:
            response = client.post(
                '/api/publisher/upload/image',
                files={'file': ('test.exe', f, 'application/octet-stream')}
            )
        
        assert response.status_code == 400
        assert '不支持的图片格式' in response.json()['detail']
    
    def test_upload_too_large(self, client, mock_member_user, tmp_path):
        # 创建超大文件
        image_path = tmp_path / "large.png"
        image_path.write_bytes(b'\x89PNG\r\n\x1a\n' + b'\x00' * (6 * 1024 * 1024))  # 6MB
        
        with open(image_path, 'rb') as f:
            response = client.post(
                '/api/publisher/upload/image',
                files={'file': ('large.png', f, 'image/png')}
            )
        
        assert response.status_code == 400
        assert '大小不能超过' in response.json()['detail']
```


### 8.3 前端测试（Playwright E2E）

#### 测试文件
```
tests/e2e/
├── pages/
│   ├── editor.page.ts       # 编辑器页面对象
│   └── drafts.page.ts       # 草稿列表页面对象
├── publisher/
│   ├── editor.spec.ts       # 编辑器测试
│   ├── drafts.spec.ts       # 草稿列表测试
│   └── publish.spec.ts      # 发布流程测试
└── fixtures/
    └── test-data.ts         # 测试数据
```

#### Page Object
```typescript
// tests/e2e/pages/editor.page.ts

import { Page, Locator } from '@playwright/test';

export class EditorPage {
    readonly page: Page;
    readonly titleInput: Locator;
    readonly digestInput: Locator;
    readonly editor: Locator;
    readonly saveStatus: Locator;
    readonly publishButton: Locator;
    readonly platformModal: Locator;
    
    constructor(page: Page) {
        this.page = page;
        this.titleInput = page.locator('#title');
        this.digestInput = page.locator('#digest');
        this.editor = page.locator('#editor .ProseMirror');
        this.saveStatus = page.locator('.save-status');
        this.publishButton = page.locator('#btn-publish');
        this.platformModal = page.locator('#publish-modal');
    }
    
    async goto(draftId?: string) {
        const url = draftId ? `/write/${draftId}` : '/write';
        await this.page.goto(url);
        await this.page.waitForSelector('#editor');
    }
    
    async setTitle(title: string) {
        await this.titleInput.fill(title);
    }
    
    async setDigest(digest: string) {
        await this.digestInput.fill(digest);
    }
    
    async setContent(content: string) {
        await this.editor.click();
        await this.page.keyboard.type(content);
    }
    
    async waitForAutoSave() {
        await this.page.waitForFunction(
            () => document.querySelector('.save-status')?.textContent === '已保存',
            { timeout: 35000 }
        );
    }
    
    async clickPublish() {
        await this.publishButton.click();
        await this.platformModal.waitFor({ state: 'visible' });
    }
    
    async selectPlatforms(platforms: string[]) {
        for (const platform of platforms) {
            await this.page.locator(`input[value="${platform}"]`).check();
        }
    }
    
    async confirmPublish() {
        await this.page.locator('#btn-confirm-publish').click();
    }
}
```

#### E2E 测试示例
```typescript
// tests/e2e/publisher/editor.spec.ts

import { test, expect } from '@playwright/test';
import { EditorPage } from '../pages/editor.page';

test.describe('编辑器', () => {
    let editorPage: EditorPage;
    
    test.beforeEach(async ({ page }) => {
        // 模拟会员登录
        await page.goto('/login');
        await page.fill('#username', 'test_member');
        await page.fill('#password', 'password');
        await page.click('#btn-login');
        await page.waitForURL('/');
        
        editorPage = new EditorPage(page);
    });
    
    test('创建新草稿', async ({ page }) => {
        await editorPage.goto();
        
        await editorPage.setTitle('测试文章标题');
        await editorPage.setDigest('这是摘要');
        await editorPage.setContent('这是正文内容，用于测试编辑器功能。');
        
        // 等待自动保存
        await editorPage.waitForAutoSave();
        
        // 验证 URL 已更新为草稿 ID
        expect(page.url()).toMatch(/\/write\/[a-f0-9-]+/);
    });
    
    test('标题超长提示', async ({ page }) => {
        await editorPage.goto();
        
        const longTitle = 'x'.repeat(100);
        await editorPage.setTitle(longTitle);
        
        // 验证输入被截断或显示错误
        const titleValue = await editorPage.titleInput.inputValue();
        expect(titleValue.length).toBeLessThanOrEqual(64);
    });
    
    test('离线恢复提示', async ({ page, context }) => {
        await editorPage.goto();
        await editorPage.setTitle('离线测试');
        await editorPage.setContent('内容');
        
        // 模拟离线
        await context.setOffline(true);
        
        // 继续编辑
        await editorPage.setContent('更多内容');
        
        // 验证离线提示
        await expect(page.locator('.offline-notice')).toBeVisible();
        
        // 恢复在线
        await context.setOffline(false);
        
        // 验证同步提示
        await expect(page.locator('.sync-notice')).toBeVisible();
    });
    
    test('非会员访问重定向', async ({ page, context }) => {
        // 清除登录状态，模拟非会员
        await context.clearCookies();
        
        await page.goto('/write');
        
        // 应该重定向到登录或会员页
        await expect(page).toHaveURL(/\/(login|membership)/);
    });
});

test.describe('草稿列表', () => {
    test('显示草稿列表', async ({ page }) => {
        // 先创建几个草稿
        const editorPage = new EditorPage(page);
        for (let i = 0; i < 3; i++) {
            await editorPage.goto();
            await editorPage.setTitle(`草稿 ${i}`);
            await editorPage.setContent(`内容 ${i}`);
            await editorPage.waitForAutoSave();
        }
        
        // 访问草稿列表
        await page.goto('/drafts');
        
        // 验证显示 3 个草稿
        const items = page.locator('.draft-item');
        await expect(items).toHaveCount(3);
    });
    
    test('删除草稿', async ({ page }) => {
        // 创建草稿
        const editorPage = new EditorPage(page);
        await editorPage.goto();
        await editorPage.setTitle('待删除草稿');
        await editorPage.setContent('内容');
        await editorPage.waitForAutoSave();
        
        // 去列表页删除
        await page.goto('/drafts');
        await page.locator('.draft-item').first().locator('.btn-delete').click();
        await page.locator('.confirm-delete').click();
        
        // 验证已删除
        await expect(page.locator('.draft-item')).toHaveCount(0);
    });
});
```

### 8.4 插件测试

```javascript
// 插件测试使用 Jest + Puppeteer

// tests/publish/adapters.test.js

describe('平台适配器', () => {
    describe('知乎适配器', () => {
        test('检测登录状态 - 已登录', async () => {
            // Mock chrome.cookies.get
            chrome.cookies.get.mockResolvedValue({ value: 'xxx' });
            
            const adapter = new ZhihuAdapter();
            const status = await adapter.checkLogin();
            
            expect(status.isLoggedIn).toBe(true);
        });
        
        test('检测登录状态 - 未登录', async () => {
            chrome.cookies.get.mockResolvedValue(null);
            
            const adapter = new ZhihuAdapter();
            const status = await adapter.checkLogin();
            
            expect(status.isLoggedIn).toBe(false);
        });
    });
    
    describe('发布管理器', () => {
        test('发布到多个平台', async () => {
            const manager = new PublishManager();
            
            const results = await manager.publish(
                ['zhihu', 'juejin'],
                { title: '测试', htmlContent: '<p>内容</p>' }
            );
            
            expect(results.data.results).toHaveLength(2);
        });
        
        test('部分平台失败', async () => {
            const manager = new PublishManager();
            
            // Mock 知乎成功，掘金失败
            jest.spyOn(manager.adapters.zhihu, 'inject').mockResolvedValue({ success: true });
            jest.spyOn(manager.adapters.juejin, 'inject').mockRejectedValue(new Error('timeout'));
            
            const results = await manager.publish(
                ['zhihu', 'juejin'],
                { title: '测试', htmlContent: '<p>内容</p>' }
            );
            
            expect(results.data.results[0].status).toBe('success');
            expect(results.data.results[1].status).toBe('failed');
        });
    });
});
```

### 8.5 CI/CD 集成

```yaml
# .github/workflows/publisher-tests.yml

name: Publisher Tests

on:
  push:
    branches: [feature/publisher]
    paths:
      - 'hotnews/web/api/publisher/**'
      - 'hotnews/web/services/publisher/**'
      - 'hotnews/web/static/write/**'
      - 'tests/**'
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install pytest pytest-cov pytest-mock
      
      - name: Run unit tests
        run: |
          pytest tests/unit/publisher -v --cov=hotnews/web --cov-report=xml
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: coverage.xml

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: pip install -r requirements.txt
      
      - name: Run integration tests
        run: pytest tests/integration/publisher -v

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Install Playwright
        run: npx playwright install --with-deps
      
      - name: Start server
        run: |
          docker compose -f docker/docker-compose-build.yml up -d
          sleep 10
      
      - name: Run E2E tests
        run: npm run test:e2e -- --project=chromium
      
      - name: Upload report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
```

### 8.6 测试覆盖率目标

| 模块 | 目标覆盖率 | 说明 |
|------|------------|------|
| 草稿服务 | > 90% | 核心业务逻辑 |
| API 接口 | > 85% | 所有端点 |
| 权限验证 | 100% | 安全相关 |
| HTML 清理 | 100% | 安全相关 |
| 编辑器 UI | > 70% | E2E 覆盖关键流程 |
| 发布流程 | > 80% | E2E 覆盖主要平台 |
