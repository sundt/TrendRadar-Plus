# E2E Tests

本项目使用 [Playwright](https://playwright.dev/) 进行端到端测试。

## 前置条件

- Node.js >= 18.0.0
- Docker（用于运行 News Viewer 服务）

## 安装

```bash
# 安装依赖
npm install

# 安装 Playwright 浏览器
npx playwright install
```

## 运行测试

### 确保服务运行

测试前需要确保 News Viewer 服务在 `http://127.0.0.1:8090` 运行：

```bash
# 使用 Docker 启动服务
bash docker/local-refresh-viewer.sh
```

### 运行测试命令

```bash
# 运行所有测试（无头模式）
npm test

# 使用 UI 模式运行（推荐调试时使用）
npm run test:ui

# 使用有头模式运行（可以看到浏览器）
npm run test:headed

# 调试模式
npm run test:debug

# 查看测试报告
npm run test:report
```

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BASE_URL` | `http://127.0.0.1:8090` | 测试目标 URL |
| `CI` | - | CI 环境标识，影响重试次数和并发 |

## 测试结构

```
tests/
├── e2e/
│   ├── pages/              # Page Object Models
│   │   └── viewer.page.ts  # Viewer 页面对象
│   ├── viewer.spec.ts      # Viewer 页面测试
│   └── category-settings.spec.ts  # 栏目设置测试
└── README.md
```

## 测试覆盖

### viewer.spec.ts
- 页面加载（标题、Tab、平台卡片、新闻列表）
- Tab 切换
- 新闻交互（已读标记）
- 过滤功能（添加/删除关键词）
- 平台筛选
- 刷新功能

### category-settings.spec.ts
- 设置弹窗打开/关闭
- 栏目列表显示
- 新增自定义栏目
- 隐藏/显示栏目
- 恢复默认

## CI/CD

测试会在以下情况自动运行：
- Push 到 `main` 分支（涉及相关文件）
- PR 到 `main` 分支（涉及相关文件）
- 手动触发

查看 `.github/workflows/e2e-tests.yml` 了解详情。

## 故障排除

### 测试超时
- 检查 Docker 容器是否正常运行
- 检查 `BASE_URL` 是否正确

### 元素找不到
- 使用 `npm run test:ui` 查看页面状态
- 检查选择器是否正确

### CI 失败
- 下载 `playwright-report` artifact 查看详细报告
- 下载 `test-results` artifact 查看失败截图
