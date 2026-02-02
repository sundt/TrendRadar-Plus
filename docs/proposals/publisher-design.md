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
