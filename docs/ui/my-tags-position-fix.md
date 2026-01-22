# "我的标签"栏目位置修复

## 问题描述

用户登录后，"我的标签"栏目显示在最后，而不是预期的最前面位置。

## 问题原因

### 1. 栏目顺序由 `categoryOrder` 决定

前端使用 `categoryOrder` 数组来决定栏目的显示顺序：
```javascript
const categoryOrder = merged.categoryOrder || Object.keys(serverCategories);
```

### 2. "我的标签"是动态注入的

后端在 `page_rendering.py` 中动态注入"我的标签"：
```python
def _inject_my_tags_category(data):
    my_tags = {"id": "my-tags", "name": "我的标签", ...}
    data["categories"] = {"my-tags": my_tags, **cats}  # 插入到最前面
    return data
```

### 3. 前端配置覆盖了顺序

当用户有保存的配置时，前端的 `applyCategoryConfigToData` 会使用用户的 `categoryOrder`，而这个顺序可能不包含"my-tags"（因为它是后来添加的）。

### 4. 新栏目被插入到最后

在 `getMergedCategoryConfig` 函数中，当发现新栏目时：
```javascript
serverOrder.forEach((catId, serverIndex) => {
    if (!merged.categoryOrder.includes(catId)) {
        // 插入到最后
        let insertIndex = merged.categoryOrder.length;
        merged.categoryOrder.splice(insertIndex, 0, catId);
    }
});
```

但"my-tags"不在 `serverOrder` 中（因为它是前端动态的），所以不会被这个逻辑处理。

## 解决方案

在 `getMergedCategoryConfig` 函数中添加特殊处理，确保"我的标签"始终在最前面：

```javascript
// Ensure 'my-tags' is at the front if it exists
try {
    const myTagsIndex = merged.categoryOrder.indexOf('my-tags');
    if (myTagsIndex > 0) {
        // Remove from current position
        merged.categoryOrder.splice(myTagsIndex, 1);
        // Insert at the beginning
        merged.categoryOrder.unshift('my-tags');
    } else if (myTagsIndex === -1) {
        // Not in the list, add it to the beginning
        merged.categoryOrder.unshift('my-tags');
    }
} catch (e) {
    // ignore
}
```

### 逻辑说明

1. **如果"my-tags"在列表中但不在第一位**：
   - 从当前位置移除
   - 插入到最前面

2. **如果"my-tags"不在列表中**：
   - 直接插入到最前面

3. **如果"my-tags"已经在第一位**：
   - 不做任何操作

## 修改的文件

- `hotnews/web/static/js/src/settings.js` - 添加"我的标签"位置处理逻辑

## 测试步骤

### 1. 清除本地配置（测试新用户）

```javascript
// 在浏览器控制台执行
localStorage.removeItem('hotnews_categories_config');
location.reload();
```

预期结果：
- "我的标签"应该在第一位

### 2. 测试已有配置的用户

```javascript
// 在浏览器控制台执行
const config = JSON.parse(localStorage.getItem('hotnews_categories_config') || '{}');
console.log('当前顺序:', config.categoryOrder);
```

刷新页面后，"我的标签"应该自动移到第一位。

### 3. 测试拖拽排序

1. 打开栏目设置
2. 拖拽"我的标签"到其他位置
3. 保存
4. 刷新页面

预期结果：
- "我的标签"会自动回到第一位（因为我们强制它在最前面）

## 其他栏目的位置

### "探索"和"知识"栏目

这两个栏目也有类似的处理逻辑：
```javascript
const flagKey = '__migrated_explore_knowledge_front_v1';
if (!userConfig[flagKey] && needsPromote) {
    const promoted = promoteCategoryOrder(merged.categoryOrder, ['explore', 'knowledge']);
    merged.categoryOrder = promoted;
    // 保存配置，下次不再自动调整
    this.saveCategoryConfig(userConfig);
}
```

区别：
- "探索"和"知识"只在第一次自动调整位置
- 之后用户可以自由拖拽
- "我的标签"每次都会强制在最前面

## 可选：允许用户自定义位置

如果希望用户可以自由调整"我的标签"的位置，可以修改逻辑：

```javascript
// 只在第一次添加时放到最前面
const flagKey = '__my_tags_positioned_v1';
if (!userConfig[flagKey]) {
    const myTagsIndex = merged.categoryOrder.indexOf('my-tags');
    if (myTagsIndex > 0) {
        merged.categoryOrder.splice(myTagsIndex, 1);
        merged.categoryOrder.unshift('my-tags');
    } else if (myTagsIndex === -1) {
        merged.categoryOrder.unshift('my-tags');
    }
    userConfig[flagKey] = Date.now();
    this.saveCategoryConfig(userConfig);
}
```

这样用户就可以拖拽调整位置了。

## 部署步骤

1. **修改代码**
   ```bash
   # 已完成
   ```

2. **重新构建前端**
   ```bash
   npm run build:js
   ```

3. **重启服务**
   ```bash
   docker-compose restart viewer
   # 或
   # 重启 Python 服务
   ```

4. **清除浏览器缓存**
   - 硬刷新：`Ctrl+Shift+R` 或 `Cmd+Shift+R`

## 验证

### 方法 1：浏览器控制台

```javascript
// 查看当前栏目顺序
const config = JSON.parse(localStorage.getItem('hotnews_categories_config') || '{}');
console.log('栏目顺序:', config.categoryOrder);
// 应该看到 ['my-tags', 'explore', 'knowledge', ...]
```

### 方法 2：查看页面

刷新页面后，"我的标签"应该在最左边（第一个栏目）。

## 总结

通过在 `getMergedCategoryConfig` 函数中添加特殊处理，确保"我的标签"始终显示在最前面，解决了用户登录后标签栏目位置不正确的问题。

**关键修改：**
- ✅ 检测"my-tags"在 `categoryOrder` 中的位置
- ✅ 如果不在第一位，移动到第一位
- ✅ 如果不存在，添加到第一位
- ✅ 每次加载配置时都执行检查

---

**更新时间**: 2026-01-19  
**版本**: v1.0
