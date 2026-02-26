#!/usr/bin/env python3
"""
资源拆分验证脚本

验证移动端/PC 端条件加载优化是否正确生效。
包含三个层面的检查：
  1. 静态检查 — bundle 文件体积和 code-split chunks 是否存在
  2. HTML 差异检查 — 不同 UA 请求返回的 HTML 是否包含正确的资源引用
  3. 功能完整性检查 — 动态加载的模块 window.* 注册是否完整

用法:
  python3 scripts/verify_resource_split.py                    # 仅静态检查
  python3 scripts/verify_resource_split.py http://localhost:8090  # 静态 + 运行时检查
  python3 scripts/verify_resource_split.py https://hot.uihash.com # 线上验证
"""

import os
import sys
import re
import json
from pathlib import Path

# ---------------------------------------------------------------------------
# 配置
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent
STATIC_JS = PROJECT_ROOT / "hotnews" / "web" / "static" / "js"
STATIC_CSS = PROJECT_ROOT / "hotnews" / "web" / "static" / "css"

# 期望被 code-split 出去的模块（动态 import）
EXPECTED_CHUNKS = [
    "summary-modal", "favorites", "comment-preview",
    "todo", "subscribe-sidebar", "payment",
    # 之前已有的
    "platform-reorder", "subscription", "rss-catalog-preview-parity",
    "explore-embedded-rss", "topic-tracker",
]

# 移动端不应加载的资源关键词
MOBILE_SHOULD_NOT_HAVE = [
    "/js/index.js",           # 应该用 /js/mobile/index-mobile.js
    "mobile-enhance.css",     # 这个移动端应该有，但不应出现在 PC HTML 中
]

# PC 端不应加载的资源关键词
PC_SHOULD_NOT_HAVE = [
    "/js/mobile/index-mobile.js",
    "/js/src/mobile-enhance.js",
]

# 移动端 HTML 应包含的资源
MOBILE_SHOULD_HAVE = [
    "/js/mobile/index-mobile.js",
    "/js/src/mobile-enhance.js",
    "mobile-enhance.css",
]

# PC 端 HTML 应包含的资源
PC_SHOULD_HAVE = [
    "/js/index.js",
    "viewer-deferred.css",
    "topic-tracker.css",
]

# User-Agent 字符串
UA_MOBILE = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
)
UA_PC = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


passed = 0
failed = 0
warnings = 0


def ok(msg):
    global passed
    passed += 1
    print(f"  ✅ {msg}")


def fail(msg):
    global failed
    failed += 1
    print(f"  ❌ {msg}")


def warn(msg):
    global warnings
    warnings += 1
    print(f"  ⚠️  {msg}")


# ---------------------------------------------------------------------------
# 1. 静态检查：文件体积和 code-split chunks
# ---------------------------------------------------------------------------

def check_static():
    print("\n" + "=" * 70)
    print("📦 静态检查：Bundle 体积和 Code-Split Chunks")
    print("=" * 70)

    # PC bundle
    pc_bundle = STATIC_JS / "index.js"
    if pc_bundle.exists():
        size_kb = pc_bundle.stat().st_size / 1024
        if size_kb < 200:
            ok(f"PC index.js: {size_kb:.0f}KB (< 200KB，code-split 生效)")
        elif size_kb < 250:
            warn(f"PC index.js: {size_kb:.0f}KB (略大，检查是否有模块未拆出)")
        else:
            fail(f"PC index.js: {size_kb:.0f}KB (> 250KB，code-split 可能未生效)")
    else:
        fail("PC index.js 不存在，需要运行 npm run build:js")

    # Mobile bundle
    mobile_bundle = STATIC_JS / "mobile" / "index-mobile.js"
    if mobile_bundle.exists():
        size_kb = mobile_bundle.stat().st_size / 1024
        if size_kb < 180:
            ok(f"Mobile index-mobile.js: {size_kb:.0f}KB (< 180KB)")
        else:
            warn(f"Mobile index-mobile.js: {size_kb:.0f}KB (略大)")

        # 对比 PC bundle
        if pc_bundle.exists():
            pc_size = pc_bundle.stat().st_size / 1024
            diff = pc_size - size_kb
            if diff > 10:
                ok(f"Mobile 比 PC 小 {diff:.0f}KB（PC 专用模块已排除）")
            else:
                warn(f"Mobile 与 PC 差异仅 {diff:.0f}KB，检查 PC 专用模块是否排除")
    else:
        fail("Mobile index-mobile.js 不存在，需要运行 npm run build:js")

    # Code-split chunks
    print()
    js_files = list(STATIC_JS.glob("*.js"))
    chunk_names = [f.stem.rsplit("-", 1)[0] for f in js_files if "-" in f.stem]

    for expected in EXPECTED_CHUNKS:
        found = any(expected in name for name in chunk_names)
        if found:
            # 找到对应文件并显示大小
            matching = [f for f in js_files if expected in f.stem]
            if matching:
                size_kb = matching[0].stat().st_size / 1024
                ok(f"Chunk {expected}: {size_kb:.0f}KB")
        else:
            fail(f"Chunk {expected} 未找到（动态 import 可能未生效）")

    # CSS 文件检查
    print()
    for css_name in ["viewer-deferred.css", "topic-tracker.css", "mobile-enhance.css", "comment-preview.css"]:
        css_file = STATIC_CSS / css_name
        if css_file.exists():
            size_kb = css_file.stat().st_size / 1024
            ok(f"CSS {css_name}: {size_kb:.0f}KB")
        else:
            fail(f"CSS {css_name} 不存在")


# ---------------------------------------------------------------------------
# 2. 运行时检查：不同 UA 返回不同 HTML
# ---------------------------------------------------------------------------

def check_html_response(base_url):
    print("\n" + "=" * 70)
    print(f"🌐 运行时检查：HTML 条件加载 ({base_url})")
    print("=" * 70)

    try:
        import requests
    except ImportError:
        warn("requests 未安装，跳过运行时检查 (pip install requests)")
        return

    # 请求 PC 版本
    print("\n--- PC 端 (Chrome UA) ---")
    try:
        resp_pc = requests.get(base_url + "/", headers={"User-Agent": UA_PC}, timeout=15)
        html_pc = resp_pc.text

        for pattern in PC_SHOULD_HAVE:
            if pattern in html_pc:
                ok(f"PC HTML 包含 {pattern}")
            else:
                fail(f"PC HTML 缺少 {pattern}")

        for pattern in PC_SHOULD_NOT_HAVE:
            if pattern in html_pc:
                fail(f"PC HTML 不应包含 {pattern}")
            else:
                ok(f"PC HTML 正确排除 {pattern}")

        # 检查 Vary 头
        vary = resp_pc.headers.get("Vary", "")
        if "User-Agent" in vary:
            ok(f"Vary 头包含 User-Agent: {vary}")
        else:
            warn(f"Vary 头未包含 User-Agent: '{vary}'（CDN 可能缓存错误版本）")

    except Exception as e:
        fail(f"PC 请求失败: {e}")

    # 请求移动端版本
    print("\n--- 移动端 (iPhone UA) ---")
    try:
        resp_mobile = requests.get(base_url + "/", headers={"User-Agent": UA_MOBILE}, timeout=15)
        html_mobile = resp_mobile.text

        for pattern in MOBILE_SHOULD_HAVE:
            if pattern in html_mobile:
                ok(f"Mobile HTML 包含 {pattern}")
            else:
                fail(f"Mobile HTML 缺少 {pattern}")

        # 移动端不应有 PC 的 index.js（注意要精确匹配，避免匹配到 index-mobile.js）
        # 检查是否有 /js/index.js 但不是 /js/mobile/index-mobile.js
        has_pc_bundle = re.search(r'/js/index\.js\b', html_mobile) and '/js/mobile/' not in re.search(r'/js/index[^"]*', html_mobile).group()
        if has_pc_bundle:
            fail("Mobile HTML 不应加载 PC 的 /js/index.js")
        else:
            ok("Mobile HTML 正确排除 PC bundle")

        # 移动端应延迟加载 viewer-deferred.css（通过 JS 而非 <link>）
        has_deferred_link = 'viewer-deferred.css' in html_mobile and 'rel="stylesheet"' in html_mobile.split('viewer-deferred.css')[0][-200:]
        has_deferred_js = 'viewer-deferred.css' in html_mobile and 'loadDeferredCSS' in html_mobile
        if has_deferred_js and not has_deferred_link:
            ok("Mobile 通过 JS 延迟加载 viewer-deferred.css（非 <link> 直接加载）")
        elif has_deferred_link:
            warn("Mobile 仍通过 <link> 加载 viewer-deferred.css（应改为 JS 延迟加载）")
        else:
            warn("Mobile HTML 中未找到 viewer-deferred.css 的加载逻辑")

    except Exception as e:
        fail(f"Mobile 请求失败: {e}")

    # 体积对比
    print("\n--- HTML 体积对比 ---")
    try:
        pc_size = len(resp_pc.content)
        mobile_size = len(resp_mobile.content)
        diff = pc_size - mobile_size
        print(f"  PC HTML:     {pc_size / 1024:.1f}KB")
        print(f"  Mobile HTML: {mobile_size / 1024:.1f}KB")
        print(f"  差异:        {abs(diff) / 1024:.1f}KB {'(PC 更大)' if diff > 0 else '(Mobile 更大)'}")
    except Exception:
        pass


# ---------------------------------------------------------------------------
# 3. 资源加载量对比
# ---------------------------------------------------------------------------

def check_resource_totals(base_url):
    print("\n" + "=" * 70)
    print("📊 资源加载量对比（模拟首屏）")
    print("=" * 70)

    try:
        import requests
    except ImportError:
        return

    def measure_resources(ua_name, ua_string):
        """请求 HTML 并统计引用的 CSS/JS 资源总量"""
        try:
            resp = requests.get(base_url + "/", headers={"User-Agent": ua_string}, timeout=15)
            html = resp.text
        except Exception as e:
            print(f"  {ua_name}: 请求失败 - {e}")
            return

        # 提取所有 CSS 和 JS 引用
        css_refs = re.findall(r'href="([^"]*\.css[^"]*)"', html)
        js_refs = re.findall(r'src="([^"]*\.js[^"]*)"', html)
        # modulepreload
        preloads = re.findall(r'href="([^"]*\.js[^"]*)"', html)

        total_css = 0
        total_js = 0
        css_details = []
        js_details = []

        for ref in css_refs:
            # 跳过 noscript 中的引用（简单判断）
            url = ref.split("?")[0]
            if url.startswith("/static/"):
                local_path = PROJECT_ROOT / "hotnews" / "web" / url.lstrip("/")
                if local_path.exists():
                    size = local_path.stat().st_size / 1024
                    total_css += size
                    css_details.append((url.split("/")[-1], size))

        for ref in js_refs:
            url = ref.split("?")[0]
            if url.startswith("/static/"):
                local_path = PROJECT_ROOT / "hotnews" / "web" / url.lstrip("/")
                if local_path.exists():
                    size = local_path.stat().st_size / 1024
                    total_js += size
                    js_details.append((url.split("/")[-1], size))

        print(f"\n  {ua_name}:")
        print(f"    CSS: {total_css:.0f}KB ({len(css_details)} 文件)")
        for name, size in sorted(css_details, key=lambda x: -x[1]):
            print(f"      {size:>6.0f}KB  {name}")
        print(f"    JS:  {total_js:.0f}KB ({len(js_details)} 文件)")
        for name, size in sorted(js_details, key=lambda x: -x[1]):
            print(f"      {size:>6.0f}KB  {name}")
        print(f"    总计: {total_css + total_js:.0f}KB")

    measure_resources("PC 端", UA_PC)
    measure_resources("移动端", UA_MOBILE)


# ---------------------------------------------------------------------------
# 4. window.* 全局函数注册检查（静态分析源码）
# ---------------------------------------------------------------------------

def check_window_registrations():
    print("\n" + "=" * 70)
    print("🔗 window.* 全局函数注册检查")
    print("=" * 70)

    # 动态加载的模块必须注册的 window 函数
    required_registrations = {
        "summary-modal.js": [
            "openSummaryModal", "closeSummaryModal", "handleSummaryClick",
            "renderMarkdown",
        ],
        "todo.js": [
            "openTodoPanel", "closeTodoPanel", "addTodo", "batchAddTodos",
            "loadTodos", "initTodoButton", "initSelectionTodo",
        ],
        "favorites.js": [
            "toggleFavoritesPanel", "closeFavoritesPanel",
        ],
        "subscribe-sidebar.js": [
            "openSubscribeSidebar", "closeSubscribeSidebar",
        ],
        "payment.js": [
            "openTokenPaymentModal", "closePaymentModal",
        ],
        "comment-preview.js": [],  # 无全局函数，自初始化
    }

    src_dir = STATIC_JS / "src"
    for filename, required_fns in required_registrations.items():
        filepath = src_dir / filename
        if not filepath.exists():
            fail(f"{filename} 不存在")
            continue

        content = filepath.read_text(encoding="utf-8")
        for fn in required_fns:
            pattern = f"window.{fn}"
            if pattern in content:
                ok(f"{filename} 注册了 window.{fn}")
            else:
                fail(f"{filename} 缺少 window.{fn} 注册")


# ---------------------------------------------------------------------------
# 5. 跨模块 import 检查（确保无残留的静态 import）
# ---------------------------------------------------------------------------

def check_no_static_imports():
    print("\n" + "=" * 70)
    print("🔍 跨模块静态 import 检查（确保已改为 window.* 调用）")
    print("=" * 70)

    # 这些模块不应再被其他模块静态 import
    should_not_be_imported = [
        "summary-modal", "todo", "favorites",
        "subscribe-sidebar", "payment", "comment-preview",
    ]

    src_dir = STATIC_JS / "src"
    for js_file in sorted(src_dir.glob("*.js")):
        if js_file.name in ["index.js", "index-mobile.js"]:
            continue  # 入口文件的动态 import 是正确的

        content = js_file.read_text(encoding="utf-8")
        for mod in should_not_be_imported:
            # 匹配 import ... from './todo.js' 或 import './todo.js'
            pattern = rf"^\s*import\s+.*from\s+['\"]\./{re.escape(mod)}(?:\.js)?['\"]"
            matches = re.findall(pattern, content, re.MULTILINE)
            if matches:
                fail(f"{js_file.name} 仍然静态 import {mod}.js: {matches[0].strip()}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    base_url = None
    for arg in sys.argv[1:]:
        if arg.startswith("http"):
            base_url = arg.rstrip("/")

    # 始终运行静态检查
    check_static()
    check_window_registrations()
    check_no_static_imports()

    # 有 URL 时运行运行时检查
    if base_url:
        check_html_response(base_url)
        check_resource_totals(base_url)
    else:
        print("\n💡 提示: 传入 URL 可运行运行时检查")
        print("   python3 scripts/verify_resource_split.py http://localhost:8090")

    # 总结
    print("\n" + "=" * 70)
    total = passed + failed
    if failed == 0:
        print(f"🎉 全部通过: {passed}/{total} 检查项")
    else:
        print(f"📋 结果: ✅ {passed} 通过, ❌ {failed} 失败, ⚠️  {warnings} 警告")
    print("=" * 70)

    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    main()
