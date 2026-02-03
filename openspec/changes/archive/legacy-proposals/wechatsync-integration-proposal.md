# Wechatsync 集成方案

> 分析 Wechatsync 的优秀实践，提出改进 HotNews Publisher 的方案

## 1. Wechatsync 架构分析

### 1.1 项目结构

```
Wechatsync/
├── packages/
│   ├── core/           # 核心库（平台适配器）
│   │   └── src/
│   │       ├── adapters/
│   │       │   ├── base.ts         # 基础适配器
│   │       │   ├── code-adapter.ts # 代码适配器（主要基类）
│   │       │   └── platforms/      # 22 个平台适配器
│   │       ├── lib/                # 工具库
│   │       └── runtime/            # 运行时抽象
│   ├── extension/      # Chrome 扩展
│   └── mcp-server/     # MCP 服务器（AI 集成）
```

### 1.2 核心设计理念

1. **纯 API 方式**：所有适配器在 Service Worker 中运行，不依赖 DOM 操作
2. **运行时抽象**：通过 `RuntimeInterface` 抽象浏览器 API，支持扩展和 Node.js 环境
3. **Header 规则**：使用 `declarativeNetRequest` 动态修改请求头，绕过 CORS 限制
4. **统一图片处理**：基类提供图片上传、处理的通用逻辑

### 1.3 支持的平台（22 个）

| 平台 | 特点 |
|------|------|
| 知乎 | OSS 上传 + Header 规则 |
| 掘金 | ImageX 上传 + AWS4 签名 |
| CSDN | 华为云 OBS + HMAC-SHA256 签名 |
| 微信公众号 | 素材库上传 + 内联样式 |
| 百家号 | 复杂的 API 签名 |
| 头条号 | 多步骤发布流程 |
| 简书 | 简单的 API |
| 掘金、B站、少数派... | 各有特色 |

## 2. 与当前实现的对比

### 2.1 当前 HotNews Publisher 实现

| 方面 | 当前实现 | 问题 |
|------|----------|------|
| 脚本注入 | `chrome.scripting.executeScript` | 在 isolated world 执行，无法访问页面状态 |
| 内容填充 | ClipboardEvent paste | 依赖页面编辑器支持，不稳定 |
| 图片处理 | 无 | 图片 URL 可能无法在目标平台显示 |
| 错误处理 | 简单 | 无法获取详细错误信息 |

### 2.2 Wechatsync 实现

| 方面 | Wechatsync 实现 | 优势 |
|------|-----------------|------|
| API 调用 | 直接调用平台 API | 稳定、可控 |
| 内容处理 | 服务端处理 | 不依赖页面状态 |
| 图片处理 | 上传到平台图床 | 图片永久有效 |
| 错误处理 | 详细的错误码映射 | 用户友好 |

## 3. 改进方案

### 3.1 方案一：直接集成 Wechatsync Core（推荐）

**优点**：
- 复用成熟的适配器代码
- 支持 22 个平台
- 持续维护更新

**实现步骤**：
1. 将 `@wechatsync/core` 作为依赖引入
2. 创建 RuntimeInterface 的浏览器实现
3. 在 background.js 中初始化适配器
4. 修改 publish-bridge.js 调用适配器

**代码示例**：
```javascript
// background/publish/wechatsync-runtime.js
export class BrowserRuntime {
  type = 'extension'
  
  async fetch(url, options) {
    return fetch(url, { ...options, credentials: 'include' })
  }
  
  headerRules = {
    async add(rule) {
      const ruleId = Date.now()
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: [{
          id: ruleId,
          priority: 1,
          action: {
            type: 'modifyHeaders',
            requestHeaders: Object.entries(rule.headers).map(([k, v]) => ({
              header: k, operation: 'set', value: v
            }))
          },
          condition: { urlFilter: rule.urlFilter }
        }]
      })
      return String(ruleId)
    },
    async remove(ruleId) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [Number(ruleId)]
      })
    }
  }
  
  // ... storage, session, cookies
}
```

### 3.2 方案二：参考实现，重写适配器

**优点**：
- 完全控制代码
- 可以针对 HotNews 场景优化

**实现步骤**：
1. 参考 Wechatsync 的适配器实现
2. 重写知乎、掘金、CSDN、微信适配器
3. 使用纯 API 方式，不依赖 DOM

**关键改进点**：

#### 知乎适配器
```javascript
// 1. 创建草稿
const draft = await fetch('https://zhuanlan.zhihu.com/api/articles/drafts', {
  method: 'POST',
  credentials: 'include',
  headers: { 'x-requested-with': 'fetch' },
  body: JSON.stringify({ title, content: '', delta_time: 0 })
})

// 2. 上传图片到知乎图床
const imageUrl = await uploadToZhihu(imageBlob)

// 3. 更新草稿内容
await fetch(`https://zhuanlan.zhihu.com/api/articles/${draftId}/draft`, {
  method: 'PATCH',
  body: JSON.stringify({ title, content: processedHtml })
})
```

#### 掘金适配器
```javascript
// 1. 获取 CSRF Token
const token = await getCsrfToken()

// 2. 上传图片到 ImageX
const imageUrl = await uploadToImageX(imageBlob)

// 3. 创建草稿（Markdown 格式）
await fetch('https://api.juejin.cn/content_api/v1/article_draft/create', {
  method: 'POST',
  headers: { 'x-secsdk-csrf-token': token },
  body: JSON.stringify({ title, mark_content: markdown })
})
```

### 3.3 方案三：混合方案

**策略**：
- 优先使用 API 方式（知乎、掘金、CSDN、微信）
- 降级使用 DOM 注入（其他平台）

## 4. 实施计划

### Phase 1: 核心平台 API 化（1-2 周）

| 任务 | 优先级 | 预估 |
|------|--------|------|
| 添加 declarativeNetRequest 权限 | P0 | 0.5h |
| 实现 Header 规则管理 | P0 | 2h |
| 重写知乎适配器（API 方式） | P0 | 4h |
| 重写掘金适配器（API 方式） | P0 | 4h |
| 重写 CSDN 适配器（API 方式） | P1 | 4h |
| 优化微信适配器 | P1 | 2h |

### Phase 2: 图片处理优化（1 周）

| 任务 | 优先级 | 预估 |
|------|--------|------|
| 实现图片上传到各平台图床 | P0 | 4h |
| 处理 data URI 图片 | P0 | 2h |
| 添加上传进度回调 | P1 | 2h |

### Phase 3: 扩展平台支持（可选）

| 任务 | 优先级 | 预估 |
|------|--------|------|
| 添加简书适配器 | P2 | 3h |
| 添加头条号适配器 | P2 | 4h |
| 添加 B 站专栏适配器 | P2 | 3h |

## 5. 技术细节

### 5.1 manifest.json 权限更新

```json
{
  "permissions": [
    "storage",
    "activeTab",
    "sidePanel",
    "tabs",
    "cookies",
    "contextMenus",
    "scripting",
    "declarativeNetRequest"  // 新增
  ],
  "host_permissions": [
    "<all_urls>"
  ]
}
```

### 5.2 Header 规则示例

```javascript
// 知乎 API 需要 x-requested-with 头
await chrome.declarativeNetRequest.updateDynamicRules({
  addRules: [{
    id: 1,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'x-requested-with', operation: 'set', value: 'fetch' }
      ]
    },
    condition: {
      urlFilter: '*://zhuanlan.zhihu.com/api/*',
      resourceTypes: ['xmlhttprequest']
    }
  }]
})
```

### 5.3 图片上传流程

```
用户文章
    │
    ▼
提取图片 URL
    │
    ├─ 已是平台图床 URL → 跳过
    │
    ├─ 外部 URL → 下载 → 上传到平台图床
    │
    └─ data URI → 转 Blob → 上传到平台图床
    │
    ▼
替换文章中的图片 URL
    │
    ▼
发布到平台
```

## 6. 风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| 平台 API 变更 | 适配器失效 | 参考 Wechatsync 更新，保持同步 |
| 签名算法变化 | 请求失败 | 抓包分析，更新签名逻辑 |
| 图片上传限制 | 图片丢失 | 降级使用原 URL，提示用户 |
| CORS 限制 | 请求被拦截 | 使用 declarativeNetRequest |

## 7. 结论

**推荐方案**：方案二（参考实现，重写适配器）

**理由**：
1. 完全控制代码，便于调试和维护
2. 可以针对 HotNews 场景优化
3. 避免引入额外依赖
4. Wechatsync 的代码质量高，可以直接参考

**下一步**：
1. 更新 manifest.json 添加 declarativeNetRequest 权限
2. 实现 Header 规则管理模块
3. 重写知乎适配器作为示例
4. 逐步迁移其他平台

---

## 附录：Wechatsync 关键代码参考

### A. 知乎图片上传

```typescript
// 1. 计算图片 hash
const imageHash = md5(arrayBuffer)

// 2. 请求上传凭证
const tokenData = await fetch('https://api.zhihu.com/images', {
  method: 'POST',
  body: JSON.stringify({ image_hash: imageHash, source: 'article' })
})

// 3. 上传到 OSS（需要 HMAC-SHA1 签名）
await ossUpload(endpoint, objectKey, blob, token)
```

### B. 掘金 CSRF Token

```typescript
const response = await fetch('https://api.juejin.cn/user_api/v1/sys/token', {
  method: 'HEAD',
  headers: {
    'x-secsdk-csrf-request': '1',
    'x-secsdk-csrf-version': '1.2.10'
  }
})
const wareToken = response.headers.get('x-ware-csrf-token')
// Token 格式: "0,{actual_token},86370000,success,{session_id}"
const csrfToken = wareToken.split(',')[1]
```

### C. CSDN API 签名

```typescript
const signStr = `POST\n*/*\n\napplication/json\n\nx-ca-key:${API_KEY}\nx-ca-nonce:${nonce}\n${apiPath}`
const signature = await hmacSha256(signStr, API_SECRET)
```
