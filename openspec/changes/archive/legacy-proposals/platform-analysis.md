# 多平台发布 - 平台分析报告

> 基于 Wechatsync 支持的 21 个平台，分析每个平台的实现复杂度、用户价值和优先级

## 概述

Wechatsync 支持 21 个内容发布平台，本文档分析每个平台的：
- **用户价值**：对 HotNews 用户的实际价值
- **实现复杂度**：API 复杂度、签名算法、图片上传等
- **稳定性**：API 变更频率、反爬措施
- **优先级**：综合评估后的实现优先级

---

## 平台分类

### 第一梯队：核心平台（P0 - 必须支持）

| 平台 | 用户价值 | 实现复杂度 | 当前状态 |
|------|----------|------------|----------|
| 微信公众号 | ⭐⭐⭐⭐⭐ | 中等 | ✅ 已实现 |
| 知乎 | ⭐⭐⭐⭐⭐ | 中等 | ✅ 已实现 (API) |
| 掘金 | ⭐⭐⭐⭐ | 高 | ✅ 已升级 API |
| CSDN | ⭐⭐⭐⭐ | 高 | ✅ 已升级 API |

### 第二梯队：重要平台（P1 - 建议支持）

| 平台 | 用户价值 | 实现复杂度 | 备注 |
|------|----------|------------|------|
| B站专栏 | ⭐⭐⭐⭐ | 中等 | 年轻用户群体 |
| 简书 | ⭐⭐⭐ | 低 | ✅ 已实现 API |
| 头条号 | ⭐⭐⭐⭐ | 高 | 复杂反爬 |
| 语雀 | ⭐⭐⭐ | 中等 | 技术文档 |

### 第三梯队：可选平台（P2 - 按需支持）

| 平台 | 用户价值 | 实现复杂度 | 备注 |
|------|----------|------------|------|
| SegmentFault | ⭐⭐⭐ | 低 | 技术社区 |
| 开源中国 | ⭐⭐ | 低 | 开源社区 |
| 51CTO | ⭐⭐ | 低 | IT 技术 |
| 慕课网 | ⭐⭐ | 低 | 教育平台 |

### 第四梯队：低优先级（P3 - 暂不考虑）

| 平台 | 用户价值 | 原因 |
|------|----------|------|
| 百家号 | ⭐⭐ | 复杂签名，收益低 |
| 大鱼号 | ⭐ | 用户少 |
| 一点资讯 | ⭐ | 用户少 |
| 搜狐号 | ⭐⭐ | 用户少 |
| 搜狐焦点 | ⭐ | 垂直领域 |
| 微博 | ⭐⭐ | 长文支持差 |
| 豆瓣 | ⭐⭐ | 用户群体不匹配 |
| 雪球 | ⭐⭐ | 金融垂直 |
| 人人都是产品经理 | ⭐⭐ | 垂直领域 |

---

## 详细分析

### 1. 微信公众号 (weixin) ✅ 已实现

**用户价值**: ⭐⭐⭐⭐⭐
- 最重要的内容分发渠道
- 用户基数最大
- 变现能力强

**实现方式**:
```javascript
// 1. 获取 token（从页面 HTML 解析）
const tokenMatch = html.match(/t:\s*["']([^"']+)["']/)

// 2. 上传图片到素材库
POST https://mp.weixin.qq.com/cgi-bin/filetransfer?action=upload_material

// 3. 创建草稿
POST https://mp.weixin.qq.com/cgi-bin/operate_appmsg?sub=create&type=77
```

**关键点**:
- 需要内联 CSS 样式（使用 juice 库）
- 图片必须上传到微信素材库
- 不支持外部链接
- LaTeX 公式需要转图片

**当前状态**: ✅ 已实现 DOM 注入方式，可升级为 API 方式

---

### 2. 知乎 (zhihu) ✅ 已实现 API

**用户价值**: ⭐⭐⭐⭐⭐
- 高质量内容社区
- SEO 效果好
- 专业用户群体

**实现方式**:
```javascript
// 1. 创建草稿
POST https://zhuanlan.zhihu.com/api/articles/drafts
Headers: { 'x-requested-with': 'fetch' }

// 2. 上传图片到知乎图床
POST https://api.zhihu.com/images
// 返回 OSS 上传凭证，需要 HMAC-SHA1 签名

// 3. 更新草稿内容
PATCH https://zhuanlan.zhihu.com/api/articles/{id}/draft
```

**关键点**:
- 需要 `x-requested-with: fetch` 请求头
- 图片上传需要 OSS 签名
- 图片需要用 `<figure>` 包裹

**当前状态**: ✅ 已实现纯 API 方式

---

### 3. 掘金 (juejin) 🔄 待升级

**用户价值**: ⭐⭐⭐⭐
- 技术开发者社区
- 活跃度高
- 技术内容首选

**实现方式**:
```javascript
// 1. 获取 CSRF Token
HEAD https://api.juejin.cn/user_api/v1/sys/token
Headers: { 'x-secsdk-csrf-request': '1' }
// Token 在响应头 x-ware-csrf-token 中

// 2. 上传图片到 ImageX（字节跳动图床）
// 需要 AWS4 签名算法
GET https://api.juejin.cn/imagex/v2/gen_token  // 获取临时凭证
GET https://imagex.bytedanceapi.com/?Action=ApplyImageUpload  // 申请上传
PUT https://{uploadHost}/{storeUri}  // 上传到 TOS
POST https://imagex.bytedanceapi.com/?Action=CommitImageUpload  // 提交

// 3. 创建草稿（Markdown 格式）
POST https://api.juejin.cn/content_api/v1/article_draft/create
Headers: { 'x-secsdk-csrf-token': token }
Body: { title, mark_content: markdown, edit_type: 10 }
```

**关键点**:
- CSRF Token 格式: `"0,{token},86370000,success,{session}"`
- 图片上传需要 AWS4 签名（复杂）
- 内容使用 Markdown 格式
- 需要 CRC32 校验

**当前状态**: 🔄 DOM 注入方式，建议升级为 API

---

### 4. CSDN 🔄 待升级

**用户价值**: ⭐⭐⭐⭐
- 老牌技术社区
- SEO 效果好
- 用户基数大

**实现方式**:
```javascript
// 1. API 签名（HMAC-SHA256）
const API_KEY = '203803574'
const API_SECRET = '9znpamsyl2c7cdrr9sas0le9vbc3r6ba'
const signStr = `POST\n*/*\n\napplication/json\n\nx-ca-key:${API_KEY}\nx-ca-nonce:${nonce}\n${apiPath}`
const signature = hmacSha256(signStr, API_SECRET)

// 2. 上传图片到华为云 OBS
POST https://bizapi.csdn.net/resource-api/v1/image/direct/upload/signature
// 返回华为云上传凭证
POST https://csdn-img-blog.obs.cn-north-4.myhuaweicloud.com

// 3. 保存文章
POST https://bizapi.csdn.net/blog-console-api/v3/mdeditor/saveArticle
Headers: { 'x-ca-key', 'x-ca-nonce', 'x-ca-signature' }
```

**关键点**:
- 需要 HMAC-SHA256 签名
- 图片上传到华为云 OBS
- 内容支持 Markdown

**当前状态**: 🔄 DOM 注入方式，建议升级为 API

---

### 5. B站专栏 (bilibili) 📋 待实现

**用户价值**: ⭐⭐⭐⭐
- 年轻用户群体
- 视频+图文结合
- 活跃度高

**实现方式**:
```javascript
// 1. 获取 CSRF Token（从 cookie bili_jct）
const csrf = await getCookie('.bilibili.com', 'bili_jct')

// 2. 上传图片
POST https://api.bilibili.com/x/article/creative/article/upcover
FormData: { binary: blob, csrf }

// 3. 创建草稿
POST https://api.bilibili.com/x/article/creative/draft/addupdate
FormData: { tid: '4', title, content, csrf }
```

**关键点**:
- 需要 CSRF Token（从 cookie 获取）
- 图片上传简单
- 不支持外部链接

**实现难度**: 中等

---

### 6. 简书 (jianshu) 📋 待实现

**用户价值**: ⭐⭐⭐
- 写作社区
- 简洁易用
- 用户活跃

**实现方式**:
```javascript
// 1. 获取文集列表
GET https://www.jianshu.com/author/notebooks

// 2. 创建文章
POST https://www.jianshu.com/author/notes
Body: { notebook_id, title }

// 3. 上传图片到七牛云
GET https://www.jianshu.com/upload_images/token.json  // 获取凭证
POST {uploadUrl}  // 上传到七牛

// 4. 更新内容
PUT https://www.jianshu.com/author/notes/{id}
Body: { title, content }
```

**关键点**:
- API 简单直接
- 图片上传到七牛云
- 需要先获取文集 ID

**实现难度**: 低 ⭐

---

### 7. 头条号 (toutiao) 📋 待实现

**用户价值**: ⭐⭐⭐⭐
- 流量大
- 推荐算法强
- 变现能力强

**实现方式**:
```javascript
// 1. 获取 CSRF Token
HEAD https://mp.toutiao.com/ttwid/check/
Headers: { 'x-secsdk-csrf-request': '1' }

// 2. 上传图片
POST https://mp.toutiao.com/spice/image
Headers: { 'x-secsdk-csrf-token': token }

// 3. 发布文章（需要在页面上下文执行）
// 头条有复杂的反爬机制（msToken, a_bogus）
// 必须通过 content script 在 MAIN world 执行 fetch
```

**关键点**:
- 复杂的反爬机制
- 需要在页面上下文执行请求
- 图片需要特殊格式包裹

**实现难度**: 高 ⭐⭐⭐⭐

---

### 8. 语雀 (yuque) 📋 待实现

**用户价值**: ⭐⭐⭐
- 技术文档平台
- 阿里系产品
- 团队协作

**实现方式**:
```javascript
// 1. 获取 CSRF Token（从 cookie yuque_ctoken）
const csrfToken = await getCookie('.yuque.com', 'yuque_ctoken')

// 2. 获取知识库 ID
GET https://www.yuque.com/api/mine/common_used

// 3. 创建文档
POST https://www.yuque.com/api/docs
Body: { title, type: 'Doc', format: 'lake', book_id }

// 4. 转换内容格式（Markdown -> Lake）
POST https://www.yuque.com/api/docs/convert
Body: { from: 'markdown', to: 'lake', content }

// 5. 保存内容
PUT https://www.yuque.com/api/docs/{id}/content
```

**关键点**:
- 使用 Lake 格式（语雀专有）
- 需要内容格式转换
- CSRF Token 从 cookie 获取

**实现难度**: 中等 ⭐⭐

---

### 9. SegmentFault (思否) 📋 待实现

**用户价值**: ⭐⭐⭐
- 技术问答社区
- 开发者群体
- 中文 Stack Overflow

**实现方式**:
```javascript
// 1. 获取 Session Token（从页面解析）
const tokenMatch = html.match(/serverData":\s*\{\s*"Token"\s*:\s*"([^"]+)"/)

// 2. 上传图片
POST https://segmentfault.com/gateway/image
Headers: { token }

// 3. 创建草稿
POST https://segmentfault.com/gateway/draft
Headers: { token }
Body: { title, text: markdown, type: 'article' }
```

**关键点**:
- API 简单
- 使用 Markdown 格式
- Token 从页面解析

**实现难度**: 低 ⭐

---

### 10. 开源中国 (oschina) 📋 待实现

**用户价值**: ⭐⭐
- 开源社区
- 技术资讯
- 国内开源生态

**实现难度**: 低

---

### 11. 51CTO 📋 待实现

**用户价值**: ⭐⭐
- IT 技术社区
- 企业用户

**实现难度**: 低

---

### 12. 慕课网 (imooc) 📋 待实现

**用户价值**: ⭐⭐
- 在线教育
- 技术教程

**实现难度**: 低

---

## 实现优先级排序

### Phase 1: 核心平台 API 化（1-2 周）✅ 已完成

| 任务 | 平台 | 复杂度 | 状态 |
|------|------|--------|------|
| 1.1 | 掘金 API 升级 | 高 | ✅ 完成 |
| 1.2 | CSDN API 升级 | 高 | ✅ 完成 |
| 1.3 | 微信 API 升级 | 中 | ✅ 已有 |

### Phase 2: 重要平台实现（1-2 周）🔄 进行中

| 任务 | 平台 | 复杂度 | 状态 |
|------|------|--------|------|
| 2.1 | B站专栏 | 中 | 📋 待实现 |
| 2.2 | 简书 | 低 | ✅ 完成 |
| 2.3 | 语雀 | 中 | 📋 待实现 |

### Phase 3: 可选平台（按需）

| 任务 | 平台 | 复杂度 | 预估工时 |
|------|------|--------|----------|
| 3.1 | SegmentFault | 低 | 2h |
| 3.2 | 开源中国 | 低 | 2h |
| 3.3 | 51CTO | 低 | 2h |
| 3.4 | 头条号 | 高 | 8h |

---

## 技术要点总结

### 1. 通用模式

```javascript
// 所有平台的基本流程
async publish(article) {
  // 1. 设置 Header 规则（绕过 CORS）
  await this.setupHeaderRules()
  
  try {
    // 2. 检查登录状态
    const auth = await this.checkAuth()
    
    // 3. 处理图片（上传到平台图床）
    content = await this.processImages(content, this.uploadImage)
    
    // 4. 创建草稿
    const result = await this.createDraft(article)
    
    return result
  } finally {
    // 5. 清除 Header 规则
    await this.clearHeaderRules()
  }
}
```

### 2. 签名算法

| 平台 | 签名算法 | 复杂度 |
|------|----------|--------|
| 知乎 | HMAC-SHA1 (OSS) | 中 |
| 掘金 | AWS4 (ImageX) | 高 |
| CSDN | HMAC-SHA256 | 中 |
| 其他 | 无/简单 Token | 低 |

### 3. 图片上传

| 平台 | 图床 | 方式 |
|------|------|------|
| 知乎 | 阿里云 OSS | 签名上传 |
| 掘金 | 字节 ImageX | AWS4 签名 |
| CSDN | 华为云 OBS | 签名上传 |
| 微信 | 素材库 | FormData |
| 简书 | 七牛云 | Token 上传 |
| B站 | 自有 CDN | FormData |

---

## 建议

1. **优先完成 Phase 1**：将核心平台升级为 API 方式，提高稳定性
2. **简书优先**：实现简单，可快速增加平台支持
3. **头条号延后**：反爬复杂，投入产出比低
4. **低优先级平台按需实现**：根据用户反馈决定

---

## 更新日志

- 2026-02-03: 初始版本，分析 21 个平台
