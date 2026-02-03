# 网页抓取增强方案

## 背景

当前文章总结功能对部分网站（特别是微信文章）抓取成功率较低，主要原因：
1. 微信文章需要 JS 渲染
2. 反爬机制检测（验证码、环境异常）
3. 当前方案：HTTP → Jina Reader → ScraperAPI，对微信效果有限

## 当前抓取流程

```
1. 直接 HTTP 请求（跳过微信文章）
   ↓ 失败
2. Jina Reader (r.jina.ai) - 免费，支持中文
   ↓ 失败  
3. ScraperAPI（付费代理，支持 JS 渲染）
   ↓ 失败
4. 返回错误
```

## 待评估方案

### 方案一：云端浏览器服务（海外）

| 服务 | 价格 | 特点 |
|------|------|------|
| Browserless | $50/月起 | 专业，稳定，API 调用 |
| ScraperAPI | $49/月起 | 已在用，`render=true` |
| Bright Data | $500/月起 | 企业级，成功率最高 |
| Apify | 按用量计费 | 灵活，有免费额度 |

### 方案二：国内服务商

| 服务商 | 网站 | 特点 |
|--------|------|------|
| 快代理 | kuaidaili.com | 老牌，API 调用方便 |
| 芝麻代理 | zhimaruanjian.com | 稳定，企业级 |
| ThorData | thordata.com | Web Scraper API，支持动态渲染 |
| 八爪鱼采集器 | bazhuayu.com | 可视化配置，支持 JS 渲染 |

### 方案三：复用公众号授权

利用用户已有的公众号后台授权，通过官方 API 获取文章内容：
- 优点：成功率高，不会被拦截
- 缺点：需要用户先扫码授权

## 下一步

1. 评估国内服务商的 API 和价格
2. 测试 ThorData 或快代理对微信文章的效果
3. 考虑复用公众号授权方案

## 相关修改记录

### 2026-01-25：微信公众号凭证有效期优化

修改内容：
1. `wechat_shared_credentials.py` - 默认有效期从 4 小时改为 24 小时
2. `wechat_qr_login.py` - `complete_login` 函数增加从 cookie 提取实际过期时间
3. `wechat_admin.py` - 使用实际过期时间保存凭证
4. `auth_api.py` - 适配新的返回值

目的：观察微信实际给的 cookie 有效期是多久
