# 体育栏目显示问题诊断

## 问题分析

根据代码分析，体育栏目在数据库中存在且已启用：
- ID: `sports`
- 名称: 体育
- 图标: 🏀
- 排序: 80
- 状态: 已启用 (enabled=1)

有两个体育相关的数据源：
1. `custom_ypm26wp` - NBA近期比赛
2. `custom_g9la8ui` - NBA未来比赛

两个数据源都已启用，最后抓取时间：2026-01-20 08:29:30

## 可能的原因

### 1. 用户配置隐藏了体育栏目

体育栏目可能被添加到了 `hiddenDefaultCategories` 列表中。这个配置存储在浏览器的 localStorage 中。

### 2. 栏目顺序问题

虽然有 9 个栏目，但代码会自动应用 `compact` 样式（让栏目变小），不会隐藏任何栏目。

## 解决方案

### 方案 1：在浏览器控制台检查和修复（推荐）

在浏览器中打开网站，按 F12 打开开发者工具，在 Console 中执行：

```javascript
// 1. 检查当前配置
const config = JSON.parse(localStorage.getItem('hotnews_category_config') || '{}');
console.log('当前配置:', config);
console.log('隐藏的栏目:', config.hiddenDefaultCategories);

// 2. 如果体育栏目被隐藏，移除它
if (config.hiddenDefaultCategories && config.hiddenDefaultCategories.includes('sports')) {
    config.hiddenDefaultCategories = config.hiddenDefaultCategories.filter(id => id !== 'sports');
    localStorage.setItem('hotnews_category_config', JSON.stringify(config));
    console.log('✅ 已移除体育栏目的隐藏状态');
    location.reload(); // 刷新页面
} else {
    console.log('✅ 体育栏目未被隐藏');
}

// 3. 检查所有栏目
document.querySelectorAll('.category-tab').forEach(tab => {
    console.log('栏目:', tab.dataset.category, tab.querySelector('.category-tab-name').textContent);
});
```

### 方案 2：清除所有栏目配置（重置）

如果方案 1 不起作用，可以完全重置栏目配置：

```javascript
// 清除栏目配置
localStorage.removeItem('hotnews_category_config');
console.log('✅ 已清除栏目配置');
location.reload();
```

### 方案 3：通过栏目设置界面

1. 点击页面上的「栏目设置」按钮
2. 查看体育栏目是否被取消勾选
3. 如果被取消勾选，重新勾选并保存

## 验证

执行修复后，应该能看到：
- 体育栏目出现在栏目列表中
- 图标：🏀
- 名称：体育
- 包含 NBA 相关的新闻卡片

## 技术细节

### 栏目显示逻辑

代码位置：`hotnews/web/static/js/src/data.js` 第 827 行

```javascript
tabsEl.classList.toggle('compact', tabCount > 8);
```

- 当栏目数量 > 8 时，添加 `compact` 类
- `compact` 类只是让栏目变小，**不会隐藏栏目**
- 所有栏目都应该可见

### 栏目过滤逻辑

代码位置：`hotnews/web/static/js/src/settings.js` 第 950 行

```javascript
categoryOrder.forEach(catId => {
    if (hiddenCategories.includes(catId)) return; // 跳过隐藏的栏目
    // ...
});
```

如果 `sports` 在 `hiddenDefaultCategories` 数组中，它会被跳过，不会渲染。

## 数据库状态

```sql
-- 栏目配置
SELECT id, name, icon, sort_order, enabled 
FROM platform_categories 
WHERE id = 'sports';

-- 结果：
-- sports|体育|🏀|80|1

-- 体育数据源
SELECT id, name, category, enabled, last_run_at 
FROM custom_sources 
WHERE category = 'sports';

-- 结果：
-- custom_ypm26wp|NBA近期比赛|sports|1|2026-01-20 08:29:30
-- custom_g9la8ui|NBA未来比赛|sports|1|2026-01-20 08:29:30
```

所有数据库配置都正常，问题应该在浏览器的 localStorage 配置中。
