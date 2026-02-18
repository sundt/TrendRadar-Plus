# 优化文档

## 文档列表

| 文档 | 说明 |
|------|------|
| [SOLUTION_DCDN_OPTIMIZATION.md](./SOLUTION_DCDN_OPTIMIZATION.md) | DCDN 动态请求优化方案（缓存策略、代码实现、费用对比） |
| [SOLUTION_DUPLICATE_NEWS.md](./SOLUTION_DUPLICATE_NEWS.md) | 重复新闻智能去重方案 |
| [DCDN_TRAFFIC_CALCULATION.md](./DCDN_TRAFFIC_CALCULATION.md) | 流量和费用计算指南 |
| [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) | 部署检查清单 |

## 相关脚本

- `scripts/test_cache_headers.py` — 缓存头自动化测试
- `scripts/check_traffic.sh` — 服务器流量统计

## 快速命令

```bash
# 测试缓存头
python3 scripts/test_cache_headers.py http://localhost:8090

# 查看缓存统计
curl http://localhost:8090/api/cache/stats

# 部署
bash deploy-fast.sh
```
