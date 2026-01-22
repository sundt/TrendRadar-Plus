# 修复"我的标签"加载错误：Can't find variable: TR

## 🐛 问题描述

**错误信息**: `Can't find variable: TR`

**发生位置**: "我的标签"栏目加载时

**影响**: 导致"我的标签"栏目无法正常显示

---

## 🔍 问题原因

### 根本原因
`my-tags.js` 模块中使用了 `TR.formatNewsDate`，但没有正确导入 `formatNewsDate` 函数。

### 代码问题
```javascript
// ❌ 错误的代码
const dateStr = TR.formatNewsDate ? TR.formatNewsDate(item.published_at) : '';
```

**问题分析**:
1. `TR` 是全局对象，在模块化环境中可能未初始化
2. ES6 模块有独立的作用域，不能直接访问全局变量
3. 依赖全局对象不是最佳实践

---

## ✅ 修复方案

### 1. 添加正确的导入语句

**文件**: `hotnews/web/static/js/src/my-tags.js`

**修改前**:
```javascript
/**
 * My Tags Module
 */

const MY_TAGS_CATEGORY_ID = 'my-tags';
```

**修改后**:
```javascript
/**
 * My Tags Module
 */

import { formatNewsDate } from './core.js';

const MY_TAGS_CATEGORY_ID = 'my-tags';
```

### 2. 使用导入的函数

**修改前**:
```javascript
const dateStr = TR.formatNewsDate ? TR.formatNewsDate(item.published_at) : '';
```

**修改后**:
```javascript
const dateStr = formatNewsDate(item.published_at);
```

---

## 🔧 修复步骤

### 1. 修改源代码
```bash
# 编辑文件
vim hotnews/web/static/js/src/my-tags.js
```

### 2. 重新构建
```bash
npm run build:js
```

**构建输出**:
```
✅ hotnews/web/static/js/index.js                    129.3kb
✅ hotnews/web/static/js/subscription-ORFNDK42.js     21.1kb
✅ hotnews/web/static/js/explore-embedded-rss-O42CYAPX.js  18.5kb
✅ hotnews/web/static/js/rss-catalog-preview-parity-UKSK6GKS.js  17.8kb
✅ hotnews/web/static/js/platform-reorder-QQPKTQXB.js  11.7kb
✅ hotnews/web/static/js/chunk-NTAR7AIA.js            3.3kb
✅ hotnews/web/static/js/chunk-E3FXOX6T.js            403b
⚡ Done in 37ms
```

### 3. 部署到服务器
```bash
# 上传新的 JS 文件到服务器
scp hotnews/web/static/js/*.js user@server:/path/to/hotnews/web/static/js/

# 或使用 git
git add hotnews/web/static/js/
git commit -m "fix: 修复我的标签 TR 未定义错误"
git push
```

### 4. 清除浏览器缓存
- 强制刷新: `Ctrl+Shift+R` (Windows/Linux) 或 `Cmd+Shift+R` (Mac)
- 或清除浏览器缓存

---

## 🧪 验证修复

### 1. 浏览器控制台检查
打开浏览器开发者工具（F12），检查是否还有错误：
```
✅ 无 "Can't find variable: TR" 错误
✅ 无其他 JavaScript 错误
```

### 2. 功能测试
1. ✅ 访问"我的标签"栏目
2. ✅ 检查新闻列表正常显示
3. ✅ 检查日期格式为 `YYYY-MM-DD`
4. ✅ 检查无时间戳数字

### 3. 网络请求检查
在开发者工具的 Network 标签中：
```
✅ index.js 加载成功 (200 OK)
✅ chunk-*.js 加载成功 (200 OK)
✅ /api/user/preferences/my-tags-news 返回数据
```

---

## 📊 修复前后对比

### 修复前
```
❌ 错误: Can't find variable: TR
❌ "我的标签"栏目无法加载
❌ 控制台显示 JavaScript 错误
❌ 用户体验受影响
```

### 修复后
```
✅ 无 JavaScript 错误
✅ "我的标签"栏目正常加载
✅ 日期正确显示为 YYYY-MM-DD 格式
✅ 用户体验正常
```

---

## 💡 最佳实践

### 1. 使用 ES6 模块导入
```javascript
// ✅ 推荐：使用 import
import { formatNewsDate } from './core.js';

// ❌ 不推荐：依赖全局对象
const dateStr = TR.formatNewsDate(timestamp);
```

### 2. 避免依赖全局变量
- ES6 模块有独立作用域
- 全局变量可能未初始化
- 模块化代码更易维护

### 3. 构建后测试
```bash
# 构建
npm run build:js

# 本地测试
# 启动开发服务器并测试功能

# 部署前验证
# 确保所有功能正常
```

---

## 🔗 相关文档

- **日期显示修复**: `docs/fixes/date-display-fixes.md`
- **日期显示逻辑**: `docs/guides/news-date-display-logic.md`
- **前端构建指南**: `docs/ui/frontend-build-guide.md`

---

## 📝 总结

### 问题
- ❌ `my-tags.js` 使用了未导入的 `TR.formatNewsDate`
- ❌ 导致 "Can't find variable: TR" 错误

### 解决方案
- ✅ 添加 `import { formatNewsDate } from './core.js'`
- ✅ 直接使用 `formatNewsDate(timestamp)`
- ✅ 重新构建并部署

### 结果
- ✅ "我的标签"栏目正常加载
- ✅ 日期正确显示
- ✅ 无 JavaScript 错误

---

**修复时间**: 2026-01-19  
**状态**: ✅ 已完成  
**影响范围**: "我的标签"栏目
