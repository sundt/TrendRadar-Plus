#!/usr/bin/env python3
"""
API 性能测试脚本

测试各个 API 端点的响应时间，找出性能瓶颈。
在服务器上运行: python3 scripts/perf_test.py [runs] [base_url]
"""

import time
import requests
import sys
from typing import List, Dict, Any

BASE_URL = "http://127.0.0.1:8090"

# 要测试的 API 端点 — 按页面加载顺序排列
ENDPOINTS = [
    # ========== 首页加载关键路径 ==========
    ("GET", "/", "首页 HTML", "critical"),
    ("GET", "/health", "健康检查", "critical"),

    # ========== 页面加载时立即调用的 API ==========
    ("GET", "/api/news", "新闻数据 /api/news", "critical"),
    ("GET", "/api/auth/me", "用户认证检查", "critical"),
    ("GET", "/api/news/check-updates", "更新检查", "high"),
    ("GET", "/api/online", "在线人数", "high"),

    # ========== 各 Tab 的数据 API ==========
    ("GET", "/api/rss/brief/timeline?limit=50&offset=0", "早报 Timeline (50)", "critical"),
    ("GET", "/api/rss/brief/timeline?limit=100&offset=0", "早报 Timeline (100)", "high"),
    ("GET", "/api/rss/brief/timeline?limit=500&offset=0", "早报 Timeline (500)", "medium"),
    ("GET", "/api/rss/explore/timeline?limit=50&offset=0", "精选博客 Timeline (50)", "critical"),
    ("GET", "/api/featured-mps", "精选公众号", "high"),
    ("GET", "/api/user/preferences/discovery-news?news_limit=50&tag_limit=30", "发现页", "high"),
    ("GET", "/api/user/preferences/followed-news?limit=50", "我的标签", "high"),
    ("GET", "/api/topics", "话题列表", "high"),

    # ========== 分类/搜索 ==========
    ("GET", "/api/categories", "分类元数据", "high"),
    ("GET", "/api/search?q=AI", "搜索", "medium"),

    # ========== RSS 源 ==========
    ("GET", "/api/rss-sources", "RSS 源列表", "medium"),
    ("GET", "/api/rss-source-categories", "RSS 源分类", "medium"),

    # ========== 评论/标签 ==========
    ("GET", "/api/summary/tags?urls=https://example.com", "文章标签", "medium"),

    # ========== 静态资源 ==========
    ("GET", "/static/js/index.js", "JS Bundle", "critical"),
    ("GET", "/static/css/viewer.css", "CSS", "critical"),
]


def test_endpoint(method: str, path: str, name: str, priority: str, base_url: str) -> dict:
    url = base_url + path
    start = time.time()
    try:
        resp = requests.request(method, url, timeout=60, allow_redirects=True)
        elapsed = time.time() - start
        size = len(resp.content)
        extra = {}
        try:
            data = resp.json()
            if isinstance(data, dict):
                if "items" in data:
                    extra["items"] = len(data["items"])
                if "cached" in data:
                    extra["cached"] = data["cached"]
                if "categories" in data and isinstance(data["categories"], dict):
                    extra["categories"] = len(data["categories"])
        except Exception:
            pass
        return {
            "name": name, "path": path, "priority": priority,
            "status": resp.status_code, "time_ms": round(elapsed * 1000),
            "size_kb": round(size / 1024, 1), "ok": 200 <= resp.status_code < 500,
            "extra": extra,
        }
    except requests.exceptions.Timeout:
        return {
            "name": name, "path": path, "priority": priority,
            "status": 0, "time_ms": 60000, "size_kb": 0, "ok": False,
            "error": "Timeout (60s)", "extra": {},
        }
    except Exception as e:
        elapsed = time.time() - start
        return {
            "name": name, "path": path, "priority": priority,
            "status": 0, "time_ms": round(elapsed * 1000), "size_kb": 0,
            "ok": False, "error": str(e)[:80], "extra": {},
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
    print("=" * 80)
    print(f"🔍 API 性能测试  目标: {base_url}  端点: {len(ENDPOINTS)}  轮次: {runs}")
    print("=" * 80)

    all_results = []
    for run in range(runs):
        if runs > 1:
            print(f"\n--- 第 {run + 1}/{runs} 轮 ---\n")
        for method, path, name, priority in ENDPOINTS:
            r = test_endpoint(method, path, name, priority, base_url)
            all_results.append(r)
            extra = ""
            if r["extra"].get("items"):
                extra = f" [{r['extra']['items']} items]"
            elif r["extra"].get("categories"):
                extra = f" [{r['extra']['categories']} cats]"
            if r["extra"].get("cached"):
                extra += " (cached)"
            err = f"  ERR: {r.get('error', '')}" if not r["ok"] else ""
            print(f"{icon(r)} {r['name']:<35} {r['time_ms']:>6}ms  {r['size_kb']:>8}KB{extra}{err}")
    return all_results


def analyze(results: List[Dict[str, Any]]) -> None:
    print("\n" + "=" * 80)
    print("📊 性能分析")
    print("=" * 80)

    ok = [r for r in results if r["ok"]]
    failed = [r for r in results if not r["ok"]]

    # 最慢的
    slow = sorted(ok, key=lambda x: -x["time_ms"])
    print("\n� 最慢的 API:")
    for r in slow[:10]:
        if r["time_ms"] >= 100:
            print(f"   {r['time_ms']:>6}ms  [{r['priority']:<8}] {r['name']}")

    # 最大的
    large = sorted(ok, key=lambda x: -x["size_kb"])
    print("\n📦 最大的响应:")
    for r in large[:5]:
        if r["size_kb"] > 10:
            print(f"   {r['size_kb']:>8}KB  {r['name']}")

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
            print(f"   {p:<10}: 平均 {avg:>6.0f}ms, 最大 {mx:>6}ms ({len(pr)} 个)")

    # 页面加载模拟
    print("\n⏱️  首次页面加载模拟 (串行):")
    critical_paths = ["/", "/api/news", "/api/auth/me", "/api/rss/brief/timeline?limit=50&offset=0"]
    total_critical = 0
    for path in critical_paths:
        r = next((x for x in ok if x["path"] == path), None)
        if r:
            total_critical += r["time_ms"]
            print(f"   {r['time_ms']:>6}ms  {r['name']}")
    print(f"   {'─' * 40}")
    print(f"   {total_critical:>6}ms  关键路径总计 (用户感知的最小等待时间)")

    total_time = sum(r["time_ms"] for r in results)
    avg_time = total_time / len(results) if results else 0
    print(f"\n📋 总结: 平均 {avg_time:.0f}ms, 成功 {len(ok)}/{len(results)}")


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
