# 多平台内容发布系统 - 完整方案

> 项目代号：HotNews Publisher
> 版本：v1.0
> 日期：2026-02-02

---

## 一、产品愿景

将 HotNews 从「新闻聚合阅读」升级为「内容创作平台」，形成完整闭环：

```
发现资讯 → 学习整理 → 再次分享
    │          │          │
 热榜/RSS   AI总结/收藏  编辑器/发布
```

### 1.1 核心理念

编辑器是一个**通用的内容创作工具**，不仅服务于 HotNews，还支持多种内容来源：

```
内容来源                              编辑器                    发布
───────────────────────────────────────────────────────────────────
• HotNews 新闻/收藏/总结  ─┐
• 任意网页（插件抓取）     ─┼──→  编辑器  ──→  多平台发布
• 上传文档（PDF/Word/MD）  ─┤      润色
• 直接手写                 ─┘
```

### 1.2 设计原则

- **来源多样化**：HotNews 内容是"一等公民"，但不是唯一来源
- **入口独立**：`/write` 作为独立入口，不强调 HotNews 归属
- **无缝集成**：HotNews 内各处可一键跳转编辑器
- **会员专属**：编辑器和发布功能仅对 HotNews 会员用户开放

---

## 二、用户故事

### 2.1 核心用户画像

| 角色 | 描述 | 核心诉求 |
|------|------|----------|
| 内容创作者 | 自媒体运营、独立博主 | 一次编辑，多平台分发，节省时间 |
| 知识工作者 | 技术人员、研究者 | 将阅读笔记快速发布到技术社区 |
| 营销人员 | 品牌运营、市场推广 | 统一管理多平台内容，提高效率 |

### 2.2 用户故事列表

**P0 - 必须实现**

| ID | 用户故事 | 验收标准 |
|----|----------|----------|
| US-01 | 作为创作者，我想在网页编辑器中撰写文章 | 支持富文本编辑、图片上传、封面设置 |
| US-02 | 作为创作者，我想一键发布到多个平台 | 选择平台后自动打开并填充内容 |
| US-03 | 作为创作者，我想保存草稿以便后续编辑 | 草稿自动保存，支持列表管理 |
| US-04 | 作为创作者，我想从 HotNews 一键创建草稿 | 点击按钮直接跳转编辑器并填充内容 |
| US-05 | 作为创作者，我想从任意网页创建草稿 | 通过插件抓取网页内容到编辑器 |
| US-06 | 作为创作者，我想上传文档创建草稿 | 支持 PDF/Word/Markdown 导入 |

**P1 - 应该实现**

| ID | 用户故事 | 验收标准 |
|----|----------|----------|
| US-07 | 作为创作者，我想使用 AI 润色文章 | 支持改写、扩写、缩写、翻译 |
| US-08 | 作为创作者，我想查看发布历史 | 记录每次发布的平台、时间、状态 |
| US-09 | 作为创作者，我想预览不同平台的排版效果 | 提供微信/知乎等平台预览 |

**P2 - 可以实现**

| ID | 用户故事 | 验收标准 |
|----|----------|----------|
| US-10 | 作为创作者，我想定时发布文章 | 设置发布时间，到时自动触发 |
| US-11 | 作为创作者，我想管理多个平台账号 | 显示各平台登录状态 |
| US-12 | 作为创作者，我想使用文章模板 | 提供常用模板，支持自定义 |

---

## 三、系统架构

### 3.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                         用户浏览器                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  hot.uihash.com/write                        │   │
│  │  ┌─────────────────────────────────────────────────────────┐│   │
│  │  │                  Tiptap 富文本编辑器                      ││   │
│  │  │  - 标题、正文、摘要、封面                                 ││   │
│  │  │  - 图片上传 (OSS)                                        ││   │
│  │  │  - 草稿自动保存                                          ││   │
│  │  │  - AI 润色 (复用现有能力)                                 ││   │
│  │  └─────────────────────────────────────────────────────────┘│   │
│  │                                                              │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │   │
│  │  │ 微信公众号 │ │   知乎   │ │   掘金   │ │  CSDN   │ ...   │   │
│  │  │    ☑️    │ │    ☑️    │ │    ☐    │ │    ☐    │       │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │   │
│  │                                                              │   │
│  │              [ 🚀 一键发布到选中平台 ]                        │   │
│  └──────────────────────────────┬───────────────────────────────┘   │
│                                 │                                    │
│                                 ▼ postMessage                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              hotnews-summarizer 浏览器插件                    │   │
│  │  ┌─────────────────────────────────────────────────────────┐│   │
│  │  │                   Background Service                     ││   │
│  │  │  - 接收发布指令                                          ││   │
│  │  │  - 创建平台标签页                                        ││   │
│  │  │  - 注入 Content Script                                   ││   │
│  │  │  - 汇报发布状态                                          ││   │
│  │  └─────────────────────────────────────────────────────────┘│   │
│  │                                                              │   │
│  │  ┌─────────────────────────────────────────────────────────┐│   │
│  │  │              Content Scripts (各平台适配器)               ││   │
│  │  │  - weixin.js   → mp.weixin.qq.com                       ││   │
│  │  │  - zhihu.js    → zhuanlan.zhihu.com                     ││   │
│  │  │  - juejin.js   → juejin.cn                              ││   │
│  │  │  - csdn.js     → mp.csdn.net                            ││   │
│  │  └─────────────────────────────────────────────────────────┘│   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼ API
┌─────────────────────────────────────────────────────────────────────┐
│                        HotNews 后端服务                              │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                      FastAPI Server                          │   │
│  │  - POST /api/drafts          草稿 CRUD                       │   │
│  │  - POST /api/publish/history 发布历史                        │   │
│  │  - POST /api/ai/polish       AI 润色                         │   │
│  │  - POST /api/upload/image    图片上传                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                 │                                    │
│                                 ▼                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                      SQLite / PostgreSQL                     │   │
│  │  - drafts 表                                                 │   │
│  │  - publish_history 表                                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```


### 3.2 技术选型

| 层级 | 技术 | 理由 |
|------|------|------|
| 编辑器 | Tiptap | 现代化、可扩展、支持 Markdown 快捷键 |
| 前端框架 | 原生 JS + Tailwind | 与现有 HotNews 前端保持一致 |
| 后端 | FastAPI | 现有架构，无需额外学习成本 |
| 数据库 | SQLite | 轻量，与现有架构一致 |
| 图片存储 | 阿里云 OSS / 本地 | 可配置，支持多种存储方式 |
| 插件 | Chrome Extension MV3 | 现有 hotnews-summarizer 基础 |

### 3.3 数据流

```
1. 编辑阶段
   用户编辑 → 自动保存草稿 → 后端存储
            ↘ 同时保存到 localStorage（离线备份）

2. 发布阶段
   用户点击发布 → 网页发送 postMessage → 插件接收
   → 检测目标平台登录状态 → 未登录则提示
   → 插件创建平台标签页 → 注入 Content Script
   → Content Script 填充内容 → 用户确认发布

3. 状态同步
   Content Script 完成 → 发送消息给 Background
   → Background 通知网页 → 网页更新发布状态

4. 错误处理
   发布失败 → 记录错误 → 提供重试选项
   → 支持单平台重试或全部重试
```

### 3.4 用户认证

```
┌─────────────────────────────────────────────────────────────┐
│                      认证流程                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  用户访问 /write                                            │
│     ↓                                                       │
│  检查 HotNews 登录状态                                       │
│     ├── 未登录 → 跳转登录页                                  │
│     └── 已登录 → 检查会员状态                                │
│         ├── 非会员 → 显示会员引导页                          │
│         └── 会员 → 进入编辑器                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘

权限说明：
├── 游客：不可访问编辑器，看不到「转草稿」按钮
├── 普通用户：不可访问编辑器，看不到「转草稿」按钮
└── 会员用户：完整功能访问，显示所有入口按钮

UI 显示策略（第一期）：
├── 非会员：隐藏所有「转草稿」相关按钮
└── 会员：显示按钮，正常使用
    （后期可切换为：非会员显示按钮，点击后引导升级）
```

---

## 四、功能模块详细设计

### 4.1 编辑器模块

#### 4.1.1 页面路由

```
/write                        → 新建空白文章
/write/:draftId               → 编辑已有草稿
/write?source=news&id=123     → 从 HotNews 新闻导入
/write?source=summary&id=456  → 从 AI 总结导入
/write?source=collection&id=789 → 从收藏导入
/write?url=https://xxx.com    → 从任意 URL 导入
/drafts                       → 草稿列表
```

#### 4.1.2 编辑器功能

```
基础功能：
├── 标题输入 (必填，限制 64 字符)
├── 摘要输入 (选填，限制 200 字符)
├── 封面上传 (支持裁剪，推荐 900x500)
└── 正文编辑
    ├── 富文本工具栏
    │   ├── 标题 (H1-H4)
    │   ├── 加粗、斜体、下划线、删除线
    │   ├── 有序列表、无序列表
    │   ├── 引用块、代码块
    │   ├── 链接、图片
    │   └── 撤销、重做
    ├── Markdown 快捷键支持
    └── 图片拖拽上传

高级功能：
├── AI 润色
│   ├── 改写 (换种说法)
│   ├── 扩写 (增加细节)
│   ├── 缩写 (精简内容)
│   └── 翻译 (中英互译)
├── 草稿自动保存 (每 30 秒)
├── 离线草稿备份 (localStorage)
└── 版本历史 (P2)

平台支持：
├── 桌面端：完整功能（编辑 + 发布）
└── 移动端：暂不支持，显示引导提示
    └─ "请在电脑上使用编辑器以获得最佳体验"
```

### 4.2 内容导入模块

#### 4.2.1 支持的导入来源

| 来源 | 入口 | 实现方式 |
|------|------|----------|
| HotNews 新闻 | 新闻详情页「转为草稿」按钮 | 后端 API 获取内容 |
| HotNews 收藏 | 收藏列表「转为草稿」按钮 | 后端 API 获取内容 |
| AI 总结 | 总结结果「转为草稿」按钮 | 后端 API 获取内容 |
| 任意网页 | 插件右键菜单 / 侧边栏按钮 | 插件抓取 + 跳转 |
| 上传文档 | 编辑器页面上传按钮 | 后端解析文档 |
| 手动输入 | 直接访问 /write | 空白编辑器 |

#### 4.2.2 HotNews 内一键导入

**入口显示规则：仅会员可见**

**新闻列表页（hover 显示）：**
```
┌─────────────────────────────────────────┐
│  � 热榜                                 │
│  ─────────────────────────────────────  │
│  • 新闻标题 1           [✏️]  ← 会员可见 │
│  • 新闻标题 2           [✏️]             │
│  • 新闻标题 3           [✏️]             │
└─────────────────────────────────────────┘
         点击后跳转 → /write?source=news&id=123
```

**收藏列表页：**
```
┌─────────────────────────────────────────┐
│  ⭐ 我的收藏                             │
│  ─────────────────────────────────────  │
│  • 新闻标题 1        [查看] [✏️ 转草稿]  │  ← 会员可见
│  • 新闻标题 2        [查看] [✏️ 转草稿]  │
└─────────────────────────────────────────┘
```

**AI 总结结果（插件侧边栏）：**
```
┌─────────────────────────────────────────┐
│  🤖 AI 总结                              │
│  ─────────────────────────────────────  │
│  ## 核心观点                            │
│  ...                                    │
│                                         │
│  [📋 复制] [✏️ 转为草稿] [🔄 重新生成]   │  ← 会员可见
└─────────────────────────────────────────┘
```

#### 4.2.3 从任意网页导入（插件）

**方式一：右键菜单**
```
用户在任意网页 → 右键 → "发送到 HotNews 编辑器"
→ 插件抓取页面内容
→ 打开 hot.uihash.com/write?url=xxx
→ 编辑器自动填充
```

**方式二：插件侧边栏**
```
用户在任意网页 → 打开插件侧边栏 → 点击「转为草稿」
→ 抓取当前页面内容
→ 跳转编辑器
```

**抓取内容包括：**
- 标题（页面 title 或 h1）
- 正文（智能提取主体内容）
- 封面图（og:image 或第一张大图）
- 原文链接

#### 4.2.4 文档上传导入

**支持格式：**
| 格式 | 解析方式 | 说明 |
|------|----------|------|
| Markdown (.md) | 直接解析 | 保留格式 |
| PDF (.pdf) | PyPDF2 / pdfplumber | 提取文本，图片可选 |
| Word (.docx) | python-docx | 保留基本格式 |
| 纯文本 (.txt) | 直接读取 | 无格式 |

**上传流程：**
```
┌─────────────────────────────────────────┐
│  ✏️ 新建文章                             │
│  ─────────────────────────────────────  │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  📄 拖拽文件到此处上传            │   │
│  │     或 点击选择文件              │   │
│  │                                 │   │
│  │  支持: PDF, Word, Markdown, TXT │   │
│  └─────────────────────────────────┘   │
│                                         │
│  或者直接开始写作 ↓                      │
│  ─────────────────────────────────────  │
│  标题: [                            ]   │
└─────────────────────────────────────────┘
```

#### 4.2.5 导入数据结构

```typescript
interface ImportSource {
  type: 'news' | 'summary' | 'collection' | 'url' | 'upload' | 'manual';
  source_id?: string;      // HotNews 内容 ID
  source_url?: string;     // 原文 URL
  source_title?: string;   // 原文标题
}

interface Draft {
  // ... 原有字段 ...
  import_source: ImportSource;  // 新增：记录内容来源
}
```

#### 4.1.3 数据结构

```typescript
interface Draft {
  id: string;              // UUID
  user_id: string;         // 用户 ID
  title: string;           // 标题
  digest: string;          // 摘要
  cover_url: string;       // 封面 URL
  html_content: string;    // HTML 内容
  markdown_content: string;// Markdown 内容
  source_type: string;     // 来源类型: manual | summary | collection
  source_id: string;       // 来源 ID (总结/收藏的 ID)
  status: string;          // draft | published
  created_at: datetime;
  updated_at: datetime;
}
```

### 4.3 发布模块

#### 4.2.1 支持平台 (第一期)

| 平台 | 优先级 | 注入方式 | 复杂度 |
|------|--------|----------|--------|
| 微信公众号 | P0 | API 调用 | 高 |
| 知乎专栏 | P0 | DOM 模拟 | 中 |
| 掘金 | P1 | DOM 模拟 | 中 |
| CSDN | P1 | DOM 模拟 | 低 |

#### 4.2.2 发布流程

```
┌─────────────────────────────────────────────────────────────┐
│                        发布流程                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 用户选择目标平台                                         │
│     ↓                                                       │
│  2. 检查插件是否安装                                         │
│     ├── 未安装 → 提示安装插件                                │
│     └── 已安装 → 继续                                        │
│     ↓                                                       │
│  3. 检测目标平台登录状态（预检）                              │
│     ├── 未登录 → 提示用户先登录该平台                        │
│     └── 已登录 → 继续                                        │
│     ↓                                                       │
│  4. 网页通过 postMessage 发送发布指令                        │
│     {                                                       │
│       type: 'PUBLISH_ARTICLE',                              │
│       platforms: ['weixin', 'zhihu'],                       │
│       data: { title, digest, cover, htmlContent, ... }      │
│     }                                                       │
│     ↓                                                       │
│  5. 插件 Background 接收指令                                 │
│     ↓                                                       │
│  6. 依次为每个平台：                                         │
│     a. 创建新标签页 (平台编辑页)                             │
│     b. 等待页面加载完成                                      │
│     c. 注入 Content Script                                  │
│     d. Content Script 执行填充                              │
│     e. 汇报状态给 Background                                │
│     ↓                                                       │
│  7. Background 汇总状态，通知网页                            │
│     ↓                                                       │
│  8. 网页显示发布结果                                         │
│     ├── 成功 → 记录发布历史                                  │
│     └── 失败 → 显示错误信息，提供重试选项                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 4.2.3 平台登录检测

```typescript
// 检测平台登录状态
interface PlatformLoginStatus {
  platform: string;
  isLoggedIn: boolean;
  username?: string;
  checkMethod: 'cookie' | 'api' | 'dom';
}

// 各平台检测方式
const platformChecks = {
  weixin: {
    // 检查 mp.weixin.qq.com 的登录 cookie
    checkMethod: 'cookie',
    cookieName: 'slave_sid',
    domain: 'mp.weixin.qq.com'
  },
  zhihu: {
    // 检查知乎登录状态
    checkMethod: 'cookie', 
    cookieName: 'z_c0',
    domain: '.zhihu.com'
  },
  juejin: {
    checkMethod: 'cookie',
    cookieName: 'sessionid',
    domain: '.juejin.cn'
  }
};

// 发布前预检
async function preCheckPlatforms(platforms: string[]): Promise<PlatformLoginStatus[]> {
  const results = [];
  for (const platform of platforms) {
    const status = await checkPlatformLogin(platform);
    results.push(status);
  }
  return results;
}
```

#### 4.2.4 错误处理与重试

```typescript
// 发布结果状态
interface PublishResult {
  platform: string;
  status: 'success' | 'failed' | 'partial';
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  retryCount: number;
  maxRetries: number;
}

// 错误类型
const ErrorTypes = {
  NOT_LOGGED_IN: { code: 'NOT_LOGGED_IN', retryable: false, message: '未登录该平台' },
  NETWORK_ERROR: { code: 'NETWORK_ERROR', retryable: true, message: '网络错误' },
  PLATFORM_ERROR: { code: 'PLATFORM_ERROR', retryable: true, message: '平台接口错误' },
  CONTENT_ERROR: { code: 'CONTENT_ERROR', retryable: false, message: '内容不符合平台规范' },
  TIMEOUT: { code: 'TIMEOUT', retryable: true, message: '操作超时' },
};

// 重试策略
const retryStrategy = {
  maxRetries: 3,
  retryDelay: 2000,  // 2秒后重试
  backoffMultiplier: 1.5,  // 指数退避
};

// 重试逻辑
async function retryPublish(platform: string, data: ArticleData, attempt: number = 1) {
  try {
    return await publishToPlatform(platform, data);
  } catch (error) {
    if (error.retryable && attempt < retryStrategy.maxRetries) {
      const delay = retryStrategy.retryDelay * Math.pow(retryStrategy.backoffMultiplier, attempt - 1);
      await sleep(delay);
      return retryPublish(platform, data, attempt + 1);
    }
    throw error;
  }
}
```

#### 4.2.5 发布结果 UI

```
┌─────────────────────────────────────────────────────────────┐
│                      发布结果                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ✅ 微信公众号    发布成功    [查看草稿]                      │
│  ✅ 知乎专栏      发布成功    [查看草稿]                      │
│  ❌ 掘金          发布失败    [重试] [查看错误]               │
│     └─ 错误：网络超时                                        │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  [全部重试失败项] [关闭]                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 4.2.6 平台适配器接口

```typescript
interface PlatformAdapter {
  name: string;           // 平台标识
  displayName: string;    // 显示名称
  icon: string;           // 图标
  editUrl: string;        // 编辑页 URL
  
  // 注入函数
  inject(data: ArticleData): Promise<InjectResult>;
}

interface ArticleData {
  title: string;
  digest: string;
  cover: { url: string; blob?: Blob };
  htmlContent: string;
  markdownContent: string;
  images: { url: string; blob?: Blob }[];
}

interface InjectResult {
  success: boolean;
  message: string;
  draftUrl?: string;  // 平台草稿 URL
}
```


### 4.4 网页与插件通信

#### 4.4.1 通信协议

```typescript
// 网页 → 插件 (通过 postMessage)
interface WebToExtensionMessage {
  type: 'HOTNEWS_PUBLISH';
  action: 'check_installed' | 'publish' | 'get_status';
  payload?: {
    platforms: string[];
    data: ArticleData;
  };
}

// 插件 → 网页 (通过 postMessage)
interface ExtensionToWebMessage {
  type: 'HOTNEWS_PUBLISH_RESPONSE';
  action: string;
  success: boolean;
  data?: {
    installed?: boolean;
    version?: string;
    results?: PlatformResult[];
  };
  error?: string;
}

interface PlatformResult {
  platform: string;
  status: 'pending' | 'injecting' | 'success' | 'failed';
  message?: string;
  draftUrl?: string;
}
```

#### 4.4.2 网页端代码示例

```javascript
// 检查插件是否安装
async function checkExtensionInstalled() {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 1000);
    
    window.addEventListener('message', function handler(event) {
      if (event.data?.type === 'HOTNEWS_PUBLISH_RESPONSE' && 
          event.data?.action === 'check_installed') {
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        resolve(event.data.data?.installed);
      }
    });
    
    window.postMessage({
      type: 'HOTNEWS_PUBLISH',
      action: 'check_installed'
    }, '*');
  });
}

// 发布文章
async function publishArticle(platforms, articleData) {
  const installed = await checkExtensionInstalled();
  if (!installed) {
    throw new Error('请先安装 HotNews 浏览器插件');
  }
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('发布超时'));
    }, 60000);
    
    window.addEventListener('message', function handler(event) {
      if (event.data?.type === 'HOTNEWS_PUBLISH_RESPONSE' && 
          event.data?.action === 'publish') {
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        if (event.data.success) {
          resolve(event.data.data.results);
        } else {
          reject(new Error(event.data.error));
        }
      }
    });
    
    window.postMessage({
      type: 'HOTNEWS_PUBLISH',
      action: 'publish',
      payload: { platforms, data: articleData }
    }, '*');
  });
}
```

#### 4.4.3 插件端代码示例

```javascript
// content-script: 监听网页消息
window.addEventListener('message', async (event) => {
  if (event.data?.type !== 'HOTNEWS_PUBLISH') return;
  
  const { action, payload } = event.data;
  
  if (action === 'check_installed') {
    window.postMessage({
      type: 'HOTNEWS_PUBLISH_RESPONSE',
      action: 'check_installed',
      success: true,
      data: { installed: true, version: chrome.runtime.getManifest().version }
    }, '*');
  }
  
  if (action === 'publish') {
    // 转发给 background
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
});
```

### 4.5 离线草稿备份

#### 4.5.1 备份策略

```typescript
// localStorage 备份结构
interface LocalDraftBackup {
  draftId: string;
  title: string;
  content: string;
  savedAt: number;  // timestamp
  syncedAt?: number;  // 上次同步到服务器的时间
  isDirty: boolean;  // 是否有未同步的修改
}

// 备份逻辑
const BACKUP_KEY_PREFIX = 'hotnews_draft_backup_';
const MAX_LOCAL_BACKUPS = 10;

function saveDraftToLocal(draft: Draft) {
  const backup: LocalDraftBackup = {
    draftId: draft.id,
    title: draft.title,
    content: draft.html_content,
    savedAt: Date.now(),
    isDirty: true
  };
  localStorage.setItem(BACKUP_KEY_PREFIX + draft.id, JSON.stringify(backup));
  cleanupOldBackups();
}

function cleanupOldBackups() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith(BACKUP_KEY_PREFIX));
  if (keys.length > MAX_LOCAL_BACKUPS) {
    // 按时间排序，删除最旧的
    const backups = keys.map(k => JSON.parse(localStorage.getItem(k)!))
      .sort((a, b) => b.savedAt - a.savedAt);
    backups.slice(MAX_LOCAL_BACKUPS).forEach(b => {
      localStorage.removeItem(BACKUP_KEY_PREFIX + b.draftId);
    });
  }
}
```

#### 4.5.2 恢复流程

```
┌─────────────────────────────────────────────────────────────┐
│                    离线草稿恢复                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  用户打开编辑器                                              │
│     ↓                                                       │
│  检查 localStorage 是否有未同步的草稿                        │
│     ├── 无 → 正常加载                                       │
│     └── 有 → 比较本地和服务器版本                            │
│         ├── 本地更新 → 提示用户选择                          │
│         │   "发现本地有未保存的修改，是否恢复？"              │
│         │   [恢复本地版本] [使用服务器版本]                  │
│         └── 服务器更新 → 使用服务器版本，清理本地            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 五、API 设计

### 5.1 草稿管理

```yaml
# 创建草稿（需要会员权限）
POST /api/drafts
Headers:
  Authorization: Bearer {token}
Request:
  title: string
  digest?: string
  cover_url?: string
  html_content: string
  markdown_content?: string
  source_type?: string
  source_id?: string
Response:
  id: string
  created_at: datetime
Error:
  401: 未登录
  403: 非会员用户

# 获取草稿列表
GET /api/drafts
Query:
  page: int = 1
  page_size: int = 20
  status?: string
Response:
  items: Draft[]
  total: int

# 获取单个草稿
GET /api/drafts/{draft_id}
Response: Draft

# 更新草稿
PUT /api/drafts/{draft_id}
Request: Partial<Draft>
Response: Draft

# 删除草稿
DELETE /api/drafts/{draft_id}
Response: { success: true }
```

### 5.2 内容导入

```yaml
# 从 HotNews 新闻导入
GET /api/import/news/{news_id}
Response:
  title: string
  content: string
  cover_url?: string
  source_url: string

# 从 AI 总结导入
GET /api/import/summary/{summary_id}
Response:
  title: string
  content: string
  source_url: string

# 从收藏导入
GET /api/import/collection/{collection_id}
Response:
  title: string
  content: string
  cover_url?: string
  source_url: string

# 从 URL 导入（后端代理抓取）
POST /api/import/url
Request:
  url: string
Response:
  title: string
  content: string
  cover_url?: string

# 上传文档导入
POST /api/import/upload
Request: multipart/form-data
  file: File
Response:
  title: string
  content: string
```

### 5.3 图片存储

#### 5.3.1 存储策略（混合方案）

**核心思路：不长期存储图片，发布时上传到目标平台**

```
用户上传图片
    │
    ▼
临时存储（草稿阶段）
    │
    ▼
发布时上传到目标平台图床
    │
    ├── 微信公众号 → 上传到微信素材库
    ├── 知乎 → 上传到知乎图床
    ├── 掘金 → 上传到掘金图床
    └── CSDN → 上传到 CSDN 图床
    │
    ▼
可选：清理临时文件
```

#### 5.3.2 存储方案对比

| 方案 | 成本 | 适用场景 |
|------|------|----------|
| 本地临时存储 | 免费 | 草稿周期短，发布后删除 |
| SQLite BLOB | 免费 | 图片少、体积小 |
| 阿里云 OSS | ~0.12元/GB/月 | 需要长期保存草稿 |
| 平台图床 | 免费 | 发布后的最终存储 |

#### 5.3.3 推荐配置

```
默认配置（零成本）：
├── 草稿图片 → 本地临时目录 /tmp/hotnews/uploads/
├── 保留时间 → 7 天自动清理
└── 发布后 → 图片已在平台图床，本地可删除

可选配置（长期保存）：
├── 草稿图片 → 阿里云 OSS
├── 费用预估 → 100张图 × 500KB ≈ 0.006元/月
└── 优势 → 草稿永久保存，换设备可继续编辑
```

#### 5.3.4 API 设计

```yaml
# 上传图片（临时存储）
POST /api/upload/image
Request: multipart/form-data
  file: File
  type?: 'cover' | 'content'
Response:
  temp_id: string      # 临时文件 ID
  url: string          # 临时访问 URL
  width: int
  height: int
  expires_at: datetime # 过期时间

# 清理过期图片（定时任务）
DELETE /api/upload/cleanup
Response:
  deleted_count: int
```

#### 5.3.5 发布时图片处理

```typescript
// 发布流程中的图片处理
async function processImagesForPlatform(
  htmlContent: string, 
  platform: string
): Promise<string> {
  // 1. 提取所有图片 URL
  const images = extractImages(htmlContent);
  
  // 2. 下载临时图片
  for (const img of images) {
    const blob = await fetch(img.tempUrl).then(r => r.blob());
    
    // 3. 上传到目标平台
    const platformUrl = await uploadToPlatform(blob, platform);
    
    // 4. 替换 URL
    htmlContent = htmlContent.replace(img.tempUrl, platformUrl);
  }
  
  return htmlContent;
}
```

### 5.4 发布历史

```yaml
# 记录发布
POST /api/publish/history
Request:
  draft_id: string
  platform: string
  status: 'success' | 'failed'
  platform_url?: string
  error_message?: string
Response:
  id: string

# 获取发布历史
GET /api/publish/history
Query:
  draft_id?: string
  page: int = 1
Response:
  items: PublishHistory[]
  total: int
```

### 5.5 AI 润色

```yaml
# AI 润色
POST /api/ai/polish
Request:
  content: string
  action: 'rewrite' | 'expand' | 'compress' | 'translate'
  target_lang?: string  # 翻译时使用
Response:
  result: string
  tokens_used: int
```

---

## 六、数据库设计

### 6.1 表结构

```sql
-- 草稿表
CREATE TABLE drafts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    digest TEXT,
    cover_url TEXT,
    html_content TEXT NOT NULL,
    markdown_content TEXT,
    -- 导入来源信息
    import_type TEXT DEFAULT 'manual',  -- manual | news | summary | collection | url | upload
    import_source_id TEXT,              -- HotNews 内容 ID
    import_source_url TEXT,             -- 原文 URL
    status TEXT DEFAULT 'draft',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_drafts_user_id ON drafts(user_id);
CREATE INDEX idx_drafts_status ON drafts(status);
CREATE INDEX idx_drafts_import_type ON drafts(import_type);
CREATE INDEX idx_drafts_updated_at ON drafts(updated_at DESC);

-- 发布历史表
CREATE TABLE publish_history (
    id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    status TEXT NOT NULL,
    platform_url TEXT,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (draft_id) REFERENCES drafts(id)
);

CREATE INDEX idx_publish_history_draft_id ON publish_history(draft_id);
CREATE INDEX idx_publish_history_user_id ON publish_history(user_id);
```


---

## 七、部署方案

### 7.1 后端部署

#### 7.1.1 Docker 配置更新

```yaml
# docker/docker-compose-build.yml 新增配置
services:
  hotnews:
    # ... 现有配置 ...
    environment:
      # 新增环境变量
      - ENABLE_WRITE_MODULE=true
      # 图片存储配置
      - IMAGE_STORAGE_TYPE=local          # local | oss
      - IMAGE_TEMP_PATH=/tmp/hotnews/uploads
      - IMAGE_TEMP_EXPIRE_DAYS=7
      # OSS 配置（可选，长期存储时使用）
      - OSS_ACCESS_KEY=${OSS_ACCESS_KEY}
      - OSS_SECRET_KEY=${OSS_SECRET_KEY}
      - OSS_BUCKET=${OSS_BUCKET}
      - OSS_ENDPOINT=${OSS_ENDPOINT}
    volumes:
      # 临时上传目录（可选，也可用容器内 /tmp）
      - ./tmp/uploads:/tmp/hotnews/uploads
```

#### 7.1.2 Nginx 配置

```nginx
# 新增路由
location /write {
    alias /app/hotnews/web/static/write;
    try_files $uri $uri/ /write/index.html;
}

location /api/drafts {
    proxy_pass http://127.0.0.1:8080;
}

location /api/upload {
    proxy_pass http://127.0.0.1:8080;
    client_max_body_size 10M;
}

location /api/publish {
    proxy_pass http://127.0.0.1:8080;
}

location /api/ai/polish {
    proxy_pass http://127.0.0.1:8080;
}
```

#### 7.1.3 部署步骤

```bash
# 1. 更新代码
git pull origin main

# 2. 更新环境变量
vim docker/.env
# 添加 OSS 配置 (如果使用)

# 3. 重新构建
docker-compose -f docker/docker-compose-build.yml build

# 4. 重启服务
docker-compose -f docker/docker-compose-build.yml up -d

# 5. 数据库迁移
docker exec hotnews python -c "from hotnews.web.models import init_db; init_db()"
```

### 7.2 插件发布

#### 7.2.1 版本更新

```json
// manifest.json 更新
{
  "version": "1.4.0",
  "permissions": [
    "storage",
    "activeTab",
    "sidePanel",
    "tabs",
    "cookies",
    "scripting"  // 新增：用于动态注入脚本
  ],
  "content_scripts": [
    // ... 现有配置 ...
    {
      "matches": ["https://hot.uihash.com/*"],
      "js": ["content/publish-bridge.js"],
      "run_at": "document_start"
    }
  ]
}
```

#### 7.2.2 发布流程

```
1. 本地测试
   - 加载未打包扩展
   - 测试各平台发布功能
   - 测试网页通信

2. 打包
   npm run build
   # 生成 hotnews-summarizer-v1.4.0.zip

3. Chrome Web Store 提交
   - 更新版本说明
   - 提交审核
   - 等待 1-3 天

4. 自托管分发 (可选)
   - 上传到 hot.uihash.com/download/
   - 提供手动安装说明
```

### 7.3 环境配置

#### 7.3.1 环境变量

```bash
# docker/.env 新增

# 写作模块开关
ENABLE_WRITE_MODULE=true

# ========== 图片存储配置 ==========
# 存储方式: local（临时本地）| oss（长期云存储）
IMAGE_STORAGE_TYPE=local

# 本地临时存储配置
IMAGE_TEMP_PATH=/tmp/hotnews/uploads
IMAGE_TEMP_EXPIRE_DAYS=7    # 7天后自动清理

# OSS 配置（可选，IMAGE_STORAGE_TYPE=oss 时使用）
# OSS_ACCESS_KEY=your_access_key
# OSS_SECRET_KEY=your_secret_key
# OSS_BUCKET=hotnews-images
# OSS_ENDPOINT=oss-cn-hangzhou.aliyuncs.com
# OSS_CDN_DOMAIN=cdn.uihash.com

# AI 润色配置（复用现有）
AI_PROVIDER=deepseek
AI_API_KEY=your_api_key
```

#### 7.3.2 图片清理定时任务

```python
# 添加到 crontab 或 supercronic
# 每天凌晨 3 点清理过期临时图片
0 3 * * * curl -X DELETE http://localhost:8080/api/upload/cleanup
```

---

## 八、开发计划

### 8.1 里程碑

| 阶段 | 时间 | 目标 | 交付物 |
|------|------|------|--------|
| M1 | 第 1-2 周 | 编辑器 MVP | 基础编辑器页面，草稿保存 |
| M2 | 第 3-4 周 | 发布功能 | 知乎、掘金适配器 |
| M3 | 第 5-6 周 | 微信公众号 | 微信适配器，图片上传 |
| M4 | 第 7-8 周 | 完善体验 | AI 润色，发布历史，优化 |

### 8.2 详细任务

#### M1: 编辑器 MVP (2 周)

```
Week 1:
├── [后端] 草稿 CRUD API
├── [后端] 图片上传 API (本地存储)
├── [后端] 内容导入 API (HotNews 新闻/收藏/总结)
├── [前端] 编辑器页面框架
└── [前端] Tiptap 集成

Week 2:
├── [前端] 草稿自动保存
├── [前端] 草稿列表页
├── [前端] 封面上传裁剪
├── [前端] HotNews 内「转为草稿」按钮
└── [测试] 编辑器功能测试
```

#### M2: 发布功能 (2 周)

```
Week 3:
├── [插件] 网页通信桥接
├── [插件] 发布流程框架
├── [插件] 知乎适配器
├── [插件] 「发送到编辑器」右键菜单
└── [前端] 平台选择 UI

Week 4:
├── [插件] 掘金适配器
├── [插件] CSDN 适配器
├── [后端] URL 导入 API（代理抓取）
├── [前端] 发布状态显示
└── [测试] 发布流程测试
```

#### M3: 微信公众号 + 文档导入 (2 周)

```
Week 5:
├── [插件] 微信适配器 (API 方式)
├── [插件] 图片上传到微信
├── [后端] 文档上传解析 (PDF/Word/MD)
└── [前端] 文档上传 UI

Week 6:
├── [插件] 微信封面设置
├── [插件] 微信摘要设置
├── [测试] 微信发布测试
└── [文档] 使用说明
```

#### M4: 完善体验 (2 周)

```
Week 7:
├── [后端] AI 润色 API
├── [前端] AI 润色 UI
├── [后端] 发布历史 API
└── [前端] 发布历史页

Week 8:
├── [优化] 性能优化
├── [优化] 错误处理
└── [发布] 插件提交审核
```

---

## 九、风险与应对

| 风险 | 可能性 | 影响 | 应对措施 |
|------|--------|------|----------|
| 平台改版导致适配器失效 | 高 | 中 | 模块化设计，快速修复；监控平台变化 |
| 微信 API 逆向被封 | 中 | 高 | 准备 DOM 模拟备选方案 |
| 插件审核被拒 | 低 | 中 | 提供自托管安装方式 |
| 图片跨域问题 | 中 | 中 | 后端代理下载，转存到 OSS |
| 用户账号安全顾虑 | 中 | 中 | 明确说明不存储账号信息 |
| 离线数据丢失 | 低 | 中 | localStorage 备份 + 定期同步提醒 |

---

## 十、成功指标

| 指标 | 目标 | 衡量方式 |
|------|------|----------|
| 编辑器使用率 | 100+ 草稿/月 | 数据库统计 |
| 发布成功率 | > 95% | 发布历史统计 |
| 用户留存 | > 30% 周留存 | 用户行为分析 |
| 平台覆盖 | 4+ 平台 | 适配器数量 |

---

## 十一、附录

### A. 参考项目

- [MultiPost-Extension](https://github.com/nicepkg/MultiPost-Extension) - 多平台发布插件
- [Tiptap](https://tiptap.dev) - 富文本编辑器
- [wechat-article-exporter](https://github.com/nicepkg/wechat-article-exporter) - 微信文章导出

### B. 相关文档

- `hotnews/docs/ai/AI_CONTEXT.md` - AI 能力说明
- `hotnews-summarizer/README.md` - 插件说明
- `_references/MultiPost-Extension/src/sync/` - 平台适配器参考

### C. 术语表

| 术语 | 说明 |
|------|------|
| Content Script | 注入到网页的脚本 |
| Background Service | 插件后台服务 |
| DOM 模拟 | 通过操作 DOM 元素模拟用户操作 |
| API 注入 | 直接调用平台后台 API |
