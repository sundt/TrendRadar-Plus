# 部署检查清单

## 部署步骤

```bash
cd hotnews
git add .
git commit -m "feat: add DCDN cache optimization"
git push
bash deploy-fast.sh
```

## 部署后验证

```bash
# 1. 服务健康
curl http://localhost:8090/health

# 2. 缓存头正确
curl -I http://localhost:8090/api/news
# 应看到: Cache-Control: public, max-age=300, s-maxage=300

# 3. 用户数据不缓存
curl -I http://localhost:8090/api/me/profile
# 应看到: Cache-Control: private, no-cache, no-store, must-revalidate

# 4. 缓存统计可用
curl http://localhost:8090/api/cache/stats

# 5. 自动化测试
python3 scripts/test_cache_headers.py http://localhost:8090
```

## 监控目标

| 时间 | 指标 |
|------|------|
| 1 小时后 | 服务正常，缓存头正确 |
| 1 天后 | 缓存命中率 > 50% |
| 1 周后 | 缓存命中率 > 70%，费用降低 50%+ |

## 回滚

```bash
cd hotnews
git revert HEAD
git push
bash deploy-fast.sh
```

## CDN 控制台配置

部署代码后，在阿里云 DCDN 控制台配置对应缓存规则，详见 [SOLUTION_DCDN_OPTIMIZATION.md](./SOLUTION_DCDN_OPTIMIZATION.md#阿里云-dcdn-控制台配置)。
