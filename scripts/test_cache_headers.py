#!/usr/bin/env python3
"""
测试 HTTP 缓存头配置

验证各个 API 端点的缓存策略是否正确设置
"""

import requests
from typing import Dict, List, Tuple

# 测试用例：(路径, 预期的 Cache-Control 值, 描述)
TEST_CASES: List[Tuple[str, str, str]] = [
    # 静态资源
    ("/static/js/index.js?v=123", "public, max-age=31536000, immutable", "带版本号的静态资源"),
    ("/static/css/style.css", "public, max-age=3600", "不带版本号的静态资源"),
    
    # 新闻数据 API
    ("/api/news", "public, max-age=300, s-maxage=300", "新闻数据"),
    ("/api/rss/brief/timeline", "public, max-age=300, s-maxage=300", "早报时间线"),
    ("/api/rss/explore/timeline", "public, max-age=300, s-maxage=300", "探索时间线"),
    
    # 分类数据 API
    ("/api/category/tech", "public, max-age=900, s-maxage=900", "分类数据"),
    
    # RSS 代理
    ("/api/rss/proxy?url=https://example.com/feed", "public, max-age=1800, s-maxage=1800", "RSS 代理"),
    
    # 搜索 API
    ("/api/search?q=test", "public, max-age=120, s-maxage=120", "搜索"),
    
    # 发现页 API
    ("/api/discovery/tags", "public, max-age=600, s-maxage=600", "发现页"),
    
    # 精选公众号 API
    ("/api/featured-mps/list", "public, max-age=600, s-maxage=600", "精选公众号"),
    
    # 用户相关 API（不应该缓存）
    ("/api/me/profile", "private, no-cache, no-store, must-revalidate", "用户资料"),
    ("/api/auth/login", "private, no-cache, no-store, must-revalidate", "登录"),
    
    # 管理后台 API（不应该缓存）
    ("/api/admin/users", "private, no-cache, no-store, must-revalidate", "管理后台"),
]


def test_cache_headers(base_url: str = "http://localhost:8090"):
    """测试缓存头配置"""
    print(f"🧪 测试缓存头配置: {base_url}\n")
    print("=" * 80)
    
    passed = 0
    failed = 0
    errors = []
    
    for path, expected_cache_control, description in TEST_CASES:
        url = f"{base_url}{path}"
        
        try:
            # 发送 HEAD 请求（不需要获取完整响应体）
            response = requests.head(url, timeout=5, allow_redirects=False)
            
            # 获取 Cache-Control 头
            cache_control = response.headers.get("Cache-Control", "")
            
            # 检查是否匹配
            if cache_control == expected_cache_control:
                print(f"✅ {description}")
                print(f"   路径: {path}")
                print(f"   缓存: {cache_control}")
                passed += 1
            else:
                print(f"❌ {description}")
                print(f"   路径: {path}")
                print(f"   预期: {expected_cache_control}")
                print(f"   实际: {cache_control}")
                failed += 1
                errors.append({
                    "path": path,
                    "description": description,
                    "expected": expected_cache_control,
                    "actual": cache_control,
                })
            
            print()
            
        except requests.RequestException as e:
            print(f"⚠️  {description}")
            print(f"   路径: {path}")
            print(f"   错误: {e}")
            print()
            failed += 1
            errors.append({
                "path": path,
                "description": description,
                "error": str(e),
            })
    
    # 打印总结
    print("=" * 80)
    print(f"\n📊 测试结果:")
    print(f"   ✅ 通过: {passed}")
    print(f"   ❌ 失败: {failed}")
    print(f"   📈 通过率: {passed / (passed + failed) * 100:.1f}%")
    
    if errors:
        print(f"\n❌ 失败的测试:")
        for error in errors:
            print(f"   - {error['description']} ({error['path']})")
            if "error" in error:
                print(f"     错误: {error['error']}")
            else:
                print(f"     预期: {error['expected']}")
                print(f"     实际: {error['actual']}")
    
    return passed, failed


def test_vary_header(base_url: str = "http://localhost:8090"):
    """测试 Vary 头配置"""
    print(f"\n🧪 测试 Vary 头配置\n")
    print("=" * 80)
    
    # 需要 Vary: Cookie 的路径
    paths_with_vary = [
        "/api/news",
        "/api/rss/brief/timeline",
        "/api/rss/explore/timeline",
        "/api/search?q=test",
    ]
    
    passed = 0
    failed = 0
    
    for path in paths_with_vary:
        url = f"{base_url}{path}"
        
        try:
            response = requests.head(url, timeout=5, allow_redirects=False)
            vary = response.headers.get("Vary", "")
            
            if "Cookie" in vary:
                print(f"✅ {path}")
                print(f"   Vary: {vary}")
                passed += 1
            else:
                print(f"❌ {path}")
                print(f"   预期: Vary: Cookie")
                print(f"   实际: Vary: {vary}")
                failed += 1
            
            print()
            
        except requests.RequestException as e:
            print(f"⚠️  {path}")
            print(f"   错误: {e}")
            print()
            failed += 1
    
    print("=" * 80)
    print(f"\n📊 Vary 头测试结果:")
    print(f"   ✅ 通过: {passed}")
    print(f"   ❌ 失败: {failed}")
    
    return passed, failed


if __name__ == "__main__":
    import sys
    
    # 从命令行参数获取 base_url
    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8090"
    
    # 测试缓存头
    cache_passed, cache_failed = test_cache_headers(base_url)
    
    # 测试 Vary 头
    vary_passed, vary_failed = test_vary_header(base_url)
    
    # 总结
    total_passed = cache_passed + vary_passed
    total_failed = cache_failed + vary_failed
    
    print(f"\n{'=' * 80}")
    print(f"🎯 总体测试结果:")
    print(f"   ✅ 通过: {total_passed}")
    print(f"   ❌ 失败: {total_failed}")
    print(f"   📈 通过率: {total_passed / (total_passed + total_failed) * 100:.1f}%")
    
    # 退出码
    sys.exit(0 if total_failed == 0 else 1)
