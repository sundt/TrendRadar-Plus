# 前端构建指南

## 问题

修改了 `src/` 目录下的 JS 文件后，刷新页面仍然看到旧的内容。

## 原因

项目使用 **esbuild** 打包前端 JavaScript 文件：
- 源文件：`hotnews/web/static/js/src/*.js`
- 打包后：`hotnews/web/static/js/index.js` 和其他 chunk 文件
- 浏览器加载的是打包后的文件，不是源文件

## 解决方案

### 方法 1：手动构建（推荐）

每次修改 `src/` 目录下的文件后，运行：

```bash
npm run build:js
```

输出示例：
```
✓ hotnews/web/static/js/index.js                                129.1kb
✓ hotnews/web/static/js/subscription-IHH5JN6U.js                 21.1kb
✓ hotnews/web/static/js/explore-embedded-rss-KJHUCJWE.js         18.5kb
...
⚡ Done in 27ms
```

### 方法 2：自动监听（开发时）

开发时可以使用 watch 模式，自动监听文件变化并重新构建：

```bash
npm run build:js:watch
```

这样每次保存文件时会自动重新构建。

## 构建配置

### package.json

```json
{
  "scripts": {
    "build:js": "esbuild hotnews/web/static/js/src/index.js --bundle --splitting --format=esm --outdir=hotnews/web/static/js --minify",
    "build:js:watch": "esbuild hotnews/web/static/js/src/index.js --bundle --splitting --format=esm --outdir=hotnews/web/static/js --watch"
  }
}
```

### 构建参数说明

- `--bundle`: 打包所有依赖到一个文件
- `--splitting`: 代码分割，生成多个 chunk
- `--format=esm`: 输出 ES Module 格式
- `--outdir`: 输出目录
- `--minify`: 压缩代码
- `--watch`: 监听文件变化（仅 watch 模式）

## 文件结构

```
hotnews/web/static/js/
├── src/                          # 源文件（开发时修改这里）
│   ├── index.js                  # 入口文件
│   ├── auth.js                   # 认证模块
│   ├── init.js                   # 初始化模块
│   ├── tabs.js                   # 标签页模块
│   └── ...
├── index.js                      # 打包后的主文件（浏览器加载）
├── chunk-*.js                    # 代码分割的 chunk 文件
└── subscription-*.js             # 其他打包文件
```

## 开发流程

### 1. 修改源文件

编辑 `src/` 目录下的文件：
```bash
vim hotnews/web/static/js/src/init.js
```

### 2. 构建

```bash
npm run build:js
```

### 3. 重启服务

```bash
# 如果使用 Docker
docker-compose restart viewer

# 如果直接运行
# 重启 Python 服务
```

### 4. 清除浏览器缓存

- 硬刷新：`Ctrl+Shift+R` (Windows/Linux) 或 `Cmd+Shift+R` (Mac)
- 或者打开开发者工具，勾选 "Disable cache"

## 常见问题

### Q1: 修改了代码但页面没变化？

**A**: 按顺序检查：
1. ✅ 是否运行了 `npm run build:js`？
2. ✅ 是否重启了服务？
3. ✅ 是否清除了浏览器缓存？

### Q2: 构建报错？

**A**: 检查：
1. Node.js 版本是否 >= 18.0.0
2. 是否安装了依赖：`npm install`
3. 源文件是否有语法错误

### Q3: 如何验证构建成功？

**A**: 检查打包后的文件：
```bash
# 查看文件大小和修改时间
ls -lh hotnews/web/static/js/index.js

# 搜索特定内容
grep "你的代码" hotnews/web/static/js/index.js
```

### Q4: watch 模式不工作？

**A**: 
1. 确保没有其他进程占用文件
2. 检查文件权限
3. 尝试手动构建一次

## 生产环境部署

### 部署前检查清单

- [ ] 运行 `npm run build:js` 构建最新代码
- [ ] 提交打包后的文件到 Git
- [ ] 测试功能是否正常
- [ ] 清除 CDN 缓存（如果使用）

### 自动化构建

可以在 CI/CD 流程中添加构建步骤：

```yaml
# .github/workflows/deploy.yml
- name: Install dependencies
  run: npm install

- name: Build frontend
  run: npm run build:js

- name: Deploy
  run: ./deploy.sh
```

## 性能优化

### 1. 代码分割

esbuild 自动进行代码分割，生成多个 chunk 文件，按需加载。

### 2. 压缩

`--minify` 参数会压缩代码，减小文件大小。

### 3. 缓存

打包后的文件名包含哈希值（如 `chunk-JEFDO44H.js`），支持长期缓存。

## 调试技巧

### 1. 不压缩构建（调试用）

```bash
esbuild hotnews/web/static/js/src/index.js --bundle --splitting --format=esm --outdir=hotnews/web/static/js
```

去掉 `--minify` 参数，代码更易读。

### 2. 生成 Source Map

```bash
esbuild hotnews/web/static/js/src/index.js --bundle --splitting --format=esm --outdir=hotnews/web/static/js --sourcemap
```

添加 `--sourcemap` 参数，方便在浏览器中调试。

### 3. 查看打包分析

```bash
esbuild hotnews/web/static/js/src/index.js --bundle --splitting --format=esm --outdir=hotnews/web/static/js --metafile=meta.json --analyze
```

生成打包分析报告。

## 总结

**关键点：**
1. ✅ 修改 `src/` 目录下的源文件
2. ✅ 运行 `npm run build:js` 构建
3. ✅ 重启服务
4. ✅ 清除浏览器缓存

**开发时推荐：**
```bash
# 终端 1：监听文件变化
npm run build:js:watch

# 终端 2：运行服务
python -m hotnews.web.server
```

这样修改代码后会自动重新构建，只需刷新浏览器即可看到效果。

---

**更新时间**: 2026-01-19  
**版本**: v1.0
