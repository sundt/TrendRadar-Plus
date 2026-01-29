#!/usr/bin/env python3
"""
API 性能测试脚本

测试各个 API 端点的响应时间，找出性能瓶颈。
在服务器上运行: python3 scripts/perf_test.py
"""

import time
import requests
import json
import sys
from typing import List, Dict, Any

BASE_URL = "http://127.0.0.1:8090"

# 要测试的 API 端点 (按重要性排序)
ENDPOINTS = [
    # ========== 核心页面 ==========
    ("GET", "/", "首页 HTML", "critical"),
    ("GET", "/health", "健康检查", "critical"),
    
    # ========== Timeline API (最重要) ==========
    ("GET", "/api/rss/brief/timeline?limit=500&offset=0", "Brief Timeline (500)", "critical"),
    ("GET", "/api/rss/brief/timeline?limit=100&offset=0", "Brief Timeline (100)", "critical"),
    ("GET", "/api/rss/brief/timeline?limit=50&offset=0", "Brief Timeline (50)", "critical"),
    ("GET", "/api/rss/explore/timeline?limit=50&offset=0", "Explore Timeline (50)", "critical"),
    
    # ========== 标签相关 ==========
    ("GET", "/api/tags/hot?limit=20", "热门标签", "high"),
    ("GET", "/api/tags/all", "所有标签", "high"),
    
    # ========== RSS 相关 ==========
    ("GET", "/api/rss/sources", "RSS 源列表", "high"),
    ("GET", "/api/rss/sources/all", "所有 RSS 源", "medium"),
    
    # ========== 公众号相关 ==========
    ("GET", "/api/featured-mps", "精选公众号", "high"),
    
    # ========== 用户偏好 (未登录) ==========
    ("GET", "/api/auth/me", "当前用户", "high"),
    ("GET", "/api/preferences/my-tags", "我的关注", "high"),
    ("GET", "/api/preferences/discovery-news?limit=50", "发现页", "high"),
    ("GET", "/api/preferences/recommended-tags?limit=10", "推荐标签", "medium"),
    
    # ========== 订阅相关 ==========
    ("GET", "/api/sources/all", "订阅源列表", "medium"),
    ("GET", "/api/sources/subscriptions", "我的订阅", "medium"),
    
    # ========== 其他 ==========
    ("GET", "/api/summary/list?limit=10", "总结列表", "low"),
    ("GET", "/api/favorites?limit=10", "收藏列表", "low"),
    ("GET", "/api/todos?limit=10", "待办列表", "low"),
]


def test_endpoint(method: str, path: str, name: str, priority: str) -> dict:
    """测试单个端点"""
    url = BASE_URL + path
    start = time.time()
    
    try:
        if method == "GET":
            resp = requests.get(url, timeout=60)
        else:
            resp = requests.post(url, timeout=60)
        
        elapsed = time.time() - start
        size = len(resp.content)
        
        # 尝试解析 JSON 获取更多信息
        extra_info = {}
        try:
            data = resp.json()
            if isinstance(data, dict):
                if "items" in data:
                    extra_info["items"] = len(data["items"])
                if "total" in data:
                    extra_info["total"] = data["total"]
                if "cached" in data:
                    extra_info["cached"] = data["cached"]
        except:
            pass
        
        return {
            "name": name,
            "path": path,
            "priority": priority,
            "status": resp.status_code,
            "time_ms": round(elapsed * 1000),
            "size_kb": round(size / 1024, 1),
            "ok": resp.status_code == 200,
            "extra": extra_info,
        }
    except requests.exceptions.Timeout:
        return {
            "name": name,
            "path": path,
            "priority": priority,
            "status": 0,
            "time_ms": 60000,
            "size_kb": 0,
            "ok": False,
            "error": "Timeout (60s)",
        }
    except Exception as e:
        elapsed = time.time() - start
        return {
            "name": name,
            "path": path,
            "priority": priority,
            "status": 0,
            "time_ms": round(elapsed * 1000),
            "size_kb": 0,
            "ok": False,
            "error": str(e)[:50],
        }


def get_status_icon(result: dict) -> str:
    """获取状态图标"""
    if not result["ok"]:
        return "❌"
    
    time_ms = result["time_ms"]
    priority = result["priority"]
    
    # 根据优先级设置不同的阈值
    if priority == "critical":
        if time_ms < 200:
            return "✅"
        elif time_ms < 500:
            return "⚠️"
        else:
            return "🔴"
    elif priority == "high":
        if time_ms < 300:
            return "✅"
        elif time_ms < 1000:
            return "⚠️"
        else:
            return "🔴"
    else:
        if time_ms < 500:
            return "✅"
        elif time_ms < 2000:
            return "⚠️"
        else:
            return "🔴"


def run_tests(runs: int = 1) -> List[Dict[str, Any]]:
    """运行所有测试"""
    print("=" * 80)
    print("🔍 API 性能测试")
    print(f"   目标: {BASE_URL}")
    print(f"   端点数: {len(ENDPOINTS)}")
    print(f"   运行次数: {runs}")
    print("=" * 80)
    print()
    
    all_results = []
    
    for run in range(runs):
        if runs > 1:
            print(f"\n--- 第 {run + 1}/{runs} 轮 ---\n")
        
        results = []
        
        for method, path, name, priority in ENDPOINTS:
            result = test_endpoint(method, path, name, priority)
            results.append(result)
            
            status = get_status_icon(result)
            extra = ""
            if result.get("extra"):
                if "items" in result["extra"]:
                    extra = f" [{result['extra']['items']} items]"
                if result["extra"].get("cached"):
                    extra += " (cached)"
            
            print(f"{status} {result['name']:<30} {result['time_ms']:>6}ms  {result['size_kb']:>8}KB{extra}")
        
        all_results.extend(results)
    
    return all_results


def analyze_results(results: List[Dict[str, Any]]) -> None:
    """分析测试结果"""
    print()
    print("=" * 80)
    print("📊 性能分析报告")
    print("=" * 80)
    
    # 按时间排序找出最慢的
    ok_results = [r for r in results if r["ok"]]
    slow_apis = sorted(ok_results, key=lambda x: -x["time_ms"])
    
    print("\n🐢 最慢的 API (需要优化):")
    for r in slow_apis[:8]:
        if r["time_ms"] > 300:
            priority_tag = f"[{r['priority']}]"
            print(f"   {r['time_ms']:>6}ms  {priority_tag:<10} {r['name']}")
    
    # 按大小排序
    large_apis = sorted(ok_results, key=lambda x: -x["size_kb"])
    print("\n📦 最大的响应 (考虑压缩/分页):")
    for r in large_apis[:5]:
        if r["size_kb"] > 20:
            print(f"   {r['size_kb']:>8}KB  {r['name']}")
    
    # 失败的请求
    failed = [r for r in results if not r["ok"]]
    if failed:
        print("\n❌ 失败的请求:")
        for r in failed:
            error = r.get("error", f"HTTP {r['status']}")
            print(f"   {r['name']}: {error}")
    
    # 按优先级分组统计
    print("\n📈 按优先级统计:")
    for priority in ["critical", "high", "medium", "low"]:
        priority_results = [r for r in ok_results if r["priority"] == priority]
        if priority_results:
            avg_time = sum(r["time_ms"] for r in priority_results) / len(priority_results)
            max_time = max(r["time_ms"] for r in priority_results)
            print(f"   {priority:<10}: 平均 {avg_time:>6.0f}ms, 最大 {max_time:>6}ms ({len(priority_results)} 个)")
    
    # 总结
    total_time = sum(r["time_ms"] for r in results)
    avg_time = total_time / len(results) if results else 0
    success_rate = len(ok_results) / len(results) * 100 if results else 0
    
    print(f"\n📋 总结:")
    print(f"   成功率: {success_rate:.1f}%")
    print(f"   平均响应: {avg_time:.0f}ms")
    print(f"   总耗时: {total_time}ms")
    
    # 优化建议
    print("\n💡 优化建议:")
    
    # 检查 timeline 是否太慢
    timeline_results = [r for r in ok_results if "timeline" in r["name"].lower()]
    slow_timelines = [r for r in timeline_results if r["time_ms"] > 1000]
    if slow_timelines:
        print("   1. Timeline API 响应慢，建议:")
        print("      - 减少默认 limit (500 -> 100)")
        print("      - 添加数据库索引")
        print("      - 增加缓存 TTL")
    
    # 检查首页是否太慢
    homepage = next((r for r in ok_results if r["path"] == "/"), None)
    if homepage and homepage["time_ms"] > 500:
        print("   2. 首页 HTML 响应慢，建议:")
        print("      - 检查服务端渲染逻辑")
        print("      - 添加页面缓存")
    
    # 检查大响应
    if any(r["size_kb"] > 100 for r in ok_results):
        print("   3. 部分响应体积过大，建议:")
        print("      - 启用 gzip 压缩")
        print("      - 减少返回字段")


def main():
    """主函数"""
    runs = 1
    if len(sys.argv) > 1:
        try:
            runs = int(sys.argv[1])
        except:
            pass
    
    results = run_tests(runs)
    analyze_results(results)


if __name__ == "__main__":
    main()
