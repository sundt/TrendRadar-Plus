# 🧹 开发规范 - 临时文件管理

## 问题

开发过程中经常创建临时测试文件（`debug_*.py`, `test_*.py`, `scrape_*.py`），但容易忘记删除，导致代码库混乱。

## 标准实践

### 1. 命名规范

所有临时文件必须使用以下前缀之一：

| 前缀 | 用途 | 示例 |
|------|------|------|
| `debug_` | 调试代码 | `debug_api_response.py` |
| `test_` | 临时测试 | `test_new_feature.py` |
| `scrape_` | 爬虫测试 | `scrape_sample_site.py` |
| `temp_` | 通用临时文件 | `temp_analysis.py` |

### 2. 存放位置

**优先级**（从高到低）：

1. ✅ **不创建文件** - 直接在 REPL、Admin 后台或 Jupyter 中测试
2. ✅ **系统临时目录** - `/tmp/` 或 `/var/tmp/`
3. ⚠️ **项目根目录** - 仅当必要时，使用标准前缀

### 3. 清理时机

- ✅ 每次开发结束后
- ✅ Git 提交前
- ✅ 每周定期检查
- ✅ 部署前强制清理

### 4. 自动化清理

运行项目清理脚本：

```bash
./scripts/cleanup_temp_scripts.sh
```

## 执行清单

**开发完成后**：
- [ ] 运行 `./scripts/cleanup_temp_scripts.sh`
- [ ] 检查 `git status` 确保无临时文件
- [ ] 提交代码

**每周维护**：
- [ ] 手动检查是否有遗漏的临时文件
- [ ] 清理 `/tmp/` 目录中的旧文件
