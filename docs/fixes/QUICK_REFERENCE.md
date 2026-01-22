# 快速问题排查参考

## "我的标签"白屏问题

### 快速诊断

打开浏览器控制台 (F12)，切换到"我的标签"，查看输出：

**✅ 正常情况**:
```
[MyTags] Load complete!
```

**❌ 问题情况**:

| 错误信息 | 原因 | 解决方案 |
|---------|------|---------|
| `Container #myTagsGrid not found` | HTML模板问题 | 检查 viewer.html |
| `User not authenticated` | 未登录 | 重新登录 |
| `API returned error` | 后端错误 | 检查后端日志 |
| `Got tags from API: 0 tags` | 无数据 | 添加关注标签 |

### 快速修复命令

在浏览器控制台执行：

```javascript
// 清除缓存并重新加载
window.HotNews.myTags.clearCache();
window.HotNews.myTags.load(true);

// 查看当前缓存
localStorage.getItem('hotnews_my_tags_cache');
```

## 微信浏览器兼容性问题

### 问题

在微信内置浏览器中点击"我的标签"没有反应。

### 快速诊断

1. **在普通浏览器中测试** - 如果正常，说明是微信浏览器兼容性问题
2. **查看控制台日志** - 使用微信开发者工具查看日志

### 解决方案

已实现四层保障机制：
1. ✅ 标准事件监听（tr_tab_switched）
2. ✅ 页面加载检查
3. ✅ click + touchstart 事件
4. ✅ MutationObserver 监听 DOM 变化

### 验证修复

在微信中打开网站，点击"我的标签"，应该看到：
- 🔒 图标
- "请先登录"提示
- "立即登录"按钮

详细文档：[微信浏览器兼容性修复](./wechat-browser-compatibility.md)

## 界面新闻重复问题

### 问题

数据库中有两个"界面新闻"源导致重复：
- `rsssrc-0d3010858f36`: 界面新闻（全站）
- `rsssrc-2cffaf97770a`: 界面新闻-金融（金融频道）

### 统计数据

- 过去7天总记录: 817条
- 不重复标题: 546条
- 重复率: 33% (271条重复)

### 解决方案

**方案1: 禁用其中一个源**

```sql
-- 禁用金融频道源（保留全站源）
UPDATE rss_sources 
SET enabled = 0 
WHERE id = 'rsssrc-2cffaf97770a';
```

**方案2: 在代码中去重**

已在 `preferences_api.py` 中实现标题去重逻辑。

## 日期显示问题

### 问题1: 显示为时间戳

**已修复**: 使用 `formatNewsDate()` 函数

### 问题2: 日期超过当前时间

**已修复**: 添加日期范围验证 (2000-01-01 ~ 当前+7天)

## 前端构建

修改 JS 文件后必须重新构建：

```bash
# 一次性构建
npm run build:js

# 监听模式（开发时使用）
npm run build:js:watch
```

## 相关文档

- [我的标签白屏调试指南](./my-tags-white-screen-debug.md)
- [我的标签缓存机制](../guides/my-tags-cache.md)
- [日期显示修复](./date-display-fixes.md)
- [新闻日期显示逻辑](../guides/news-date-display-logic.md)
