#!/usr/bin/env python3
"""
API 性能测试脚本

测试各个 API 端点的响应时间和体积，找出性能瓶颈。
在服务器上运行: python3 scripts/perf_test.py [runs] [base_url]
本地运行:       python3 scripts/perf_test.py https://hot.uihash.com
"""

import time
import requests
import sys
from typing import List, Dict, Any

BASE_URL = "http://127.0.0.1:8090"

# 要测试的端点 — 按实际页面加载顺序排列
ENDPOINTS = [
    # ========== 首页 HTML ==========
    ("GET", "/", "首页 HTML", "critical"),

    # ========== 关键 CSS（阻塞渲染） ==========
    ("GET", "/static/css/viewer.css", "viewer.css", "critical"),
    ("GET", "/static/css/vendor/bootstrap.min.css", "bootstrap.min.css", "critical"),
    ("GET", "/static/css/title-effects.css", "title-effects.css", "high"),
    ("GET", "/static/css/layout/tabs.css", "tabs.css", "high"),
    ("GET", "/static/css/topic-tracker.css", "topic-tracker.css", "medium"),
    ("GET", "/static/css/mobile-enhance.css", "mobile-enhance.css", "medium"),
    ("GET", "/static/css/comment-preview.css", "comment-preview.css", "medium"),

    # ========== 关键 JS ==========
    ("GET", "/static/js/index.js", "index.js (bundle)", "critical"),
    ("GET", "/static/js/src/mobile-enhance.js", "mobile-enhance.js", "high"),
    ("GET", "/static/js/src/fallback-loader.js", "fallback-loader.js", "high"),

    # ========== 首屏 API（关键路径） ==========
    ("GET", "/api/auth/me", "认证检查 /api/auth/me", "critical"),
    ("GET", "/api/news", "新闻数据 /api/news", "critical"),
    ("GET", "/api/columns", "栏目配置 /api/columns", "critical"),
    ("GET", "/api/user/preferences/followed-news?limit=50", "我的关注 followed-news", "critical"),

    # ========== 页面加载后调用的 API ==========
    ("GET", "/api/news/check-updates", "更新检查", "high"),
    ("GET", "/api/online", "在线人数", "high"),
    ("GET", "/api/topics", "话题列表", "high"),

    # ========== 各栏目 Timeline API ==========
    ("GET", "/api/timeline?tags=startup,venture,ecommerce,retail,automotive,apple,google,microsoft,meta,amazon&limit=50", "AI资讯 Timeline", "high"),
    ("GET", "/api/rss/finance/timeline?limit=50", "财经 Timeline", "high"),
    ("GET", "/api/rss/brief/timeline?limit=50&offset=0", "早报 Timeline", "high"),

    # ========== 发现页 ==========
    ("GET", "/api/user/preferences/discovery-news?limit=3&offset=0&news_limit=15&tag_limit=30", "发现页 discovery (首屏3卡)", "medium"),

    # ========== 分类/搜索 ==========
    ("GET", "/api/categories", "分类元数据", "medium"),
    ("GET", "/api/search?q=AI", "搜索", "medium"),

    # ========== RSS 源 ==========
    ("GET", "/api/rss-sources", "RSS 源列表", "medium"),
    ("GET", "/api/rss-source-categories", "RSS 源分类", "medium"),

    # ========== 图片资源 ==========
    ("GET", "/static/images/hxlogo.jpg", "Logo 图片", "medium"),
    ("GET", "/static/images/qun.webp", "二维码图片", "low"),
]


def test_endpoint(method: str, path: str, name: str, priority: str, base_url: str) -> dict:
    url = base_url + path
    headers = {"Accept-Encoding": "gzip, deflate, br"}
    start = time.time()
    try:
        resp = requests.request(method, url, timeout=60, allow_redirects=True, headers=headers)
        elapsed = time.time() - start
        raw_size = len(resp.content)
        # 检查是否有 Content-Encoding（gzip）
        encoding = resp.headers.get("Content-Encoding", "none")
        transfer_size = int(resp.headers.get("Content-Length", raw_size))
        cache_control = resp.headers.get("Cache-Control", "")
        extra = {"encoding": encoding, "cache": cache_control[:50]}
        try:
            data = resp.json()
            if isinstance(data, dict):
                if "items" in data:
                    extra["items"] = len(data["items"])
                if "cached" in data:
                    extra["cached"] = data["cached"]
                if "categories" in data and isinstance(data["categories"], dict):
                    extra["categories"] = len(data["categories"])
                if "tags" in data and isinstance(data["tags"], list):
                    extra["tags"] = len(data["tags"])
        except Exception:
            pass
        return {
            "name": name, "path": path, "priority": priority,
            "status": resp.status_code, "time_ms": round(elapsed * 1000),
            "size_kb": round(raw_size / 1024, 1),
            "transfer_kb": round(transfer_size / 1024, 1),
            "ok": 200 <= resp.status_code < 500,
            "extra": extra,
        }
    except requests.exceptions.Timeout:
        return {
            "name": name, "path": path, "priority": priority,
            "status": 0, "time_ms": 60000, "size_kb": 0, "transfer_kb": 0,
            "ok": False, "error": "Timeout (60s)", "extra": {},
        }
    except Exception as e:
        elapsed = time.time() - start
        return {
            "name": name, "path": path, "priority": priority,
            "status": 0, "time_ms": round(elapsed * 1000), "size_kb": 0,
            "transfer_kb": 0, "ok": False, "error": str(e)[:80], "extra": {},
        }


def icon(result: dict) -> str:
    if not result["ok"]:
        return "❌"
    ms = result["time_ms"]
    p = result["priority"]
    if p == "critical":
        return "✅" if ms < 200 else ("⚠️" if ms < 500 else "🔴")
    elif p == "high":
        return "✅" if ms < 300 else ("⚠️" if ms < 1000 else "🔴")
    else:
        return "✅" if ms < 500 else ("⚠️" if ms < 2000 else "🔴")


def run_tests(base_url: str, runs: int = 1) -> List[Dict[str, Any]]:
    print("=" * 90)
    print(f"� 性能测试  目标: {base_url}  端点: {len(ENDPOINTS)}  轮次: {runs}")
    print("=" * 90)

    all_results = []
    for run in range(runs):
        if runs > 1:
            print(f"\n--- 第 {run + 1}/{runs} 轮 ---\n")
        for method, path, name, priority in ENDPOINTS:
            r = test_endpoint(method, path, name, priority, base_url)
            all_results.append(r)
            extra_parts = []
            if r["extra"].get("items"):
                extra_parts.append(f"{r['extra']['items']} items")
            if r["extra"].get("tags"):
                extra_parts.append(f"{r['extra']['tags']} tags")
            if r["extra"].get("categories"):
                extra_parts.append(f"{r['extra']['categories']} cats")
            if r["extra"].get("cached"):
                extra_parts.append("cached")
            enc = r["extra"].get("encoding", "")
            if enc and enc != "none":
                extra_parts.append(enc)
            extra = f" [{', '.join(extra_parts)}]" if extra_parts else ""
            err = f"  ERR: {r.get('error', '')}" if not r["ok"] else ""
            print(f"{icon(r)} {r['name']:<30} {r['time_ms']:>6}ms  {r['size_kb']:>8}KB{extra}{err}")
    return all_results


def analyze(results: List[Dict[str, Any]]) -> None:
    print("\n" + "=" * 90)
    print("📊 性能分析")
    print("=" * 90)

    ok = [r for r in results if r["ok"]]
    failed = [r for r in results if not r["ok"]]

    # 最慢的
    slow = sorted(ok, key=lambda x: -x["time_ms"])
    print("\n🐌 最慢的端点:")
    for r in slow[:10]:
        if r["time_ms"] >= 50:
            cache = r["extra"].get("cache", "")
            cache_info = f"  cache: {cache}" if cache else ""
            print(f"   {r['time_ms']:>6}ms  {r['size_kb']:>8}KB  [{r['priority']:<8}] {r['name']}{cache_info}")

    # 最大的
    large = sorted(ok, key=lambda x: -x["size_kb"])
    print("\n📦 最大的响应:")
    for r in large[:10]:
        if r["size_kb"] > 5:
            enc = r["extra"].get("encoding", "none")
            print(f"   {r['size_kb']:>8}KB  (enc: {enc:<5})  {r['name']}")

    # 总传输量
    total_size = sum(r["size_kb"] for r in ok)
    print(f"\n� 总传输量: {total_size:.0f}KB ({total_size/1024:.1f}MB)")

    # 按类型统计
    css_size = sum(r["size_kb"] for r in ok if ".css" in r["path"])
    js_size = sum(r["size_kb"] for r in ok if ".js" in r["path"])
    api_size = sum(r["size_kb"] for r in ok if r["path"].startswith("/api/"))
    html_size = sum(r["size_kb"] for r in ok if r["path"] == "/")
    img_size = sum(r["size_kb"] for r in ok if any(ext in r["path"] for ext in [".jpg", ".png", ".webp", ".svg"]))
    print(f"   HTML: {html_size:.0f}KB | CSS: {css_size:.0f}KB | JS: {js_size:.0f}KB | API: {api_size:.0f}KB | 图片: {img_size:.0f}KB")

    if failed:
        print("\n❌ 失败:")
        for r in failed:
            err = r.get("error", "HTTP %s" % r["status"])
            print(f"   {r['name']}: {err}")

    # 按优先级
    print("\n📈 按优先级:")
    for p in ["critical", "high", "medium", "low"]:
        pr = [r for r in ok if r["priority"] == p]
        if pr:
            avg = sum(r["time_ms"] for r in pr) / len(pr)
            mx = max(r["time_ms"] for r in pr)
            total = sum(r["size_kb"] for r in pr)
            print(f"   {p:<10}: 平均 {avg:>6.0f}ms, 最大 {mx:>6}ms, 总量 {total:>6.0f}KB ({len(pr)} 个)")

    # 首屏关键路径
    print("\n⏱️  首屏关键路径 (串行模拟):")
    critical_paths = ["/", "/api/auth/me", "/api/news", "/api/user/preferences/followed-news?limit=50"]
    total_critical = 0
    for path in critical_paths:
        r = next((x for x in ok if x["path"] == path), None)
        if r:
            total_critical += r["time_ms"]
            print(f"   {r['time_ms']:>6}ms  {r['size_kb']:>6}KB  {r['name']}")
    print(f"   {'─' * 50}")
    print(f"   {total_critical:>6}ms  关键路径总计")

    total_time = sum(r["time_ms"] for r in results)
    avg_time = total_time / len(results) if results else 0
    print(f"\n📋 总结: 平均 {avg_time:.0f}ms/请求, 成功 {len(ok)}/{len(results)}")


def main():
    runs = 1
    base_url = BASE_URL
    for arg in sys.argv[1:]:
        if arg.startswith("http"):
            base_url = arg.rstrip("/")
        else:
            try:
                runs = int(arg)
            except ValueError:
                pass
    results = run_tests(base_url, runs)
    analyze(results)


if __name__ == "__main__":
    main()
