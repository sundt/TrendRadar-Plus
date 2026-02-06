#!/usr/bin/env python3
"""
AI 模型对比测试脚本

测试不同 AI 模型生成关键词和数据源的准确率。
支持的模型：
- 混元 Thinking (hunyuan-2.0-thinking-20251109)
- 混元 T1 (hunyuan-t1-latest)
- 通义千问 Plus (qwen-plus)
- 通义千问 Max (qwen3-max)

使用方法：
    python scripts/test_ai_models.py "深圳房价"
    python scripts/test_ai_models.py "读书" --models hunyuan-t1,qwen3-max
    python scripts/test_ai_models.py "考研" --skip-verify
"""

import argparse
import json
import re
import sys
import os
from pathlib import Path
from typing import Dict, List, Any

import httpx

# 添加项目路径
sys.path.insert(0, str(Path(__file__).parent.parent))


# ============================================================
# 配置
# ============================================================

MODELS = {
    "hunyuan-thinking": {
        "name": "混元 Thinking",
        "model": "hunyuan-2.0-thinking-20251109",
        "provider": "hunyuan",
        "url": "https://api.hunyuan.cloud.tencent.com/v1/chat/completions",
    },
    "hunyuan-t1": {
        "name": "混元 T1",
        "model": "hunyuan-t1-latest",
        "provider": "hunyuan",
        "url": "https://api.hunyuan.cloud.tencent.com/v1/chat/completions",
    },
    "qwen-plus": {
        "name": "通义千问 Plus",
        "model": "qwen-plus",
        "provider": "dashscope",
        "url": "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    },
    "qwen3-max": {
        "name": "通义千问 Max",
        "model": "qwen3-max",
        "provider": "dashscope",
        "url": "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    },
}


def get_search_prompt(topic_name: str) -> str:
    """生成搜索 prompt"""
    return f"""你是一个专业的新闻追踪专家。用户想要追踪关于「{topic_name}」的新闻和资讯。

## 任务
请通过网络搜索，完成以下任务：

### 第一步：搜索权威报道机构
搜索「{topic_name}」相关的新闻报道，找出：
1. 哪些微信公众号在持续报道这个领域？（找 10-15 个）
2. 哪些网站有相关的 RSS 订阅源？（找 3-5 个）

### 第二步：从报道中提取关键词
从搜索到的报道标题和内容中，提取 6-10 个高频出现的关键词，这些关键词应该：
- 是该领域的专有名词（机构名、政策名、产品名、人名等）
- 能精准匹配该主题的新闻标题
- 避免泛化词（如：新闻、发展、行业、市场）

### 第三步：选择图标
选择一个最能代表「{topic_name}」的 emoji 图标。

## 输出格式
请严格按以下 JSON 格式输出：
{{
    "icon": "emoji图标",
    "keywords": ["关键词1", "关键词2", ...],
    "sources": [
        {{"name": "公众号名称", "type": "wechat_mp", "wechat_id": "微信号ID", "description": "为什么推荐"}},
        {{"name": "网站名称", "type": "rss", "url": "https://example.com/feed", "description": "简短描述"}}
    ]
}}

只输出 JSON，不要其他内容。"""


def call_model(model_key: str, topic_name: str, api_keys: Dict[str, str]) -> Dict[str, Any]:
    """调用 AI 模型"""
    config = MODELS[model_key]
    provider = config["provider"]
    
    api_key = api_keys.get(provider)
    if not api_key:
        return {"error": f"缺少 {provider} API Key"}
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    prompt = get_search_prompt(topic_name)
    
    if provider == "hunyuan":
        body = {
            "model": config["model"],
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.5,
            "enable_enhancement": True,
        }
    else:  # dashscope
        body = {
            "model": config["model"],
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.5,
            "response_format": {"type": "json_object"},
            "enable_search": True,
            "search_options": {"forced_search": True, "search_strategy": "standard"}
        }
    
    try:
        response = httpx.post(config["url"], headers=headers, json=body, timeout=120)
        data = response.json()
        
        if "error" in data:
            return {"error": data["error"].get("message", str(data["error"]))}
        
        if "choices" not in data:
            return {"error": "无效响应"}
        
        content = data["choices"][0]["message"]["content"]
        
        # 提取 JSON
        json_match = re.search(r'\{[\s\S]*\}', content)
        if json_match:
            return json.loads(json_match.group(0))
        else:
            return {"error": "无法解析 JSON", "raw": content[:500]}
    
    except Exception as e:
        return {"error": str(e)}


def is_name_match(expected: str, actual: str) -> bool:
    """检查名称是否匹配"""
    expected = expected.lower().replace(" ", "")
    actual = actual.lower().replace(" ", "")
    
    # 完全包含
    if expected in actual or actual in expected:
        return True
    
    # 前缀匹配（至少2个字符）
    if len(expected) >= 2 and len(actual) >= 2:
        if expected[:2] in actual or actual[:2] in expected:
            return True
    
    return False


def verify_rss(rss_sources: List[Dict]) -> Dict[str, Any]:
    """验证 RSS 源列表"""
    results = []
    valid_count = 0
    
    for src in rss_sources:
        url = src.get("url", "")
        name = src.get("name", "")
        
        if not url:
            results.append({"name": name, "url": url, "valid": False, "error": "无URL"})
            continue
        
        try:
            response = httpx.get(url, timeout=10, follow_redirects=True, headers={
                "User-Agent": "Mozilla/5.0 (compatible; HotNews/1.0)"
            })
            
            if response.status_code != 200:
                results.append({"name": name, "url": url, "valid": False, "error": f"HTTP {response.status_code}"})
                continue
            
            content_type = response.headers.get("content-type", "").lower()
            content = response.text[:2000]
            
            # 检查是否是 RSS/Atom
            is_feed = (
                any(x in content_type for x in ["xml", "rss", "atom"]) or
                "<rss" in content or 
                "<feed" in content or 
                "<channel>" in content
            )
            
            if is_feed:
                results.append({"name": name, "url": url, "valid": True})
                valid_count += 1
            else:
                results.append({"name": name, "url": url, "valid": False, "error": "非RSS格式"})
        
        except Exception as e:
            results.append({"name": name, "url": url, "valid": False, "error": str(e)[:50]})
    
    return {
        "total": len(rss_sources),
        "valid": valid_count,
        "accuracy": valid_count / len(rss_sources) if rss_sources else 0,
        "details": results
    }


def verify_mps(mp_names: List[str], provider) -> Dict[str, Any]:
    """验证公众号列表"""
    results = []
    correct = 0
    
    for name in mp_names:
        result = provider.search_mp(name, limit=3)
        if result.ok and result.accounts:
            acc = result.accounts[0]
            match = is_name_match(name, acc.nickname)
            results.append({
                "name": name,
                "found": acc.nickname,
                "match": match
            })
            if match:
                correct += 1
        else:
            results.append({
                "name": name,
                "found": None,
                "match": False
            })
    
    return {
        "total": len(mp_names),
        "correct": correct,
        "accuracy": correct / len(mp_names) if mp_names else 0,
        "details": results
    }


def print_results(results: Dict[str, Dict], verify_results: Dict[str, Dict] = None, rss_verify_results: Dict[str, Dict] = None):
    """打印对比结果"""
    print("\n" + "=" * 80)
    print("【AI 模型对比结果】")
    print("=" * 80)
    
    # 汇总表格
    print("\n📊 汇总对比：")
    print("-" * 100)
    print(f"{'模型':<20} {'公众号数':<10} {'公众号准确率':<14} {'RSS数':<8} {'RSS准确率':<12} {'关键词数':<10}")
    print("-" * 100)
    
    for model_key, data in results.items():
        if "error" in data:
            print(f"{MODELS[model_key]['name']:<20} {'错误: ' + data['error'][:40]}")
            continue
        
        sources = data.get("sources", [])
        mps = [s for s in sources if s.get("type") == "wechat_mp"]
        rss = [s for s in sources if s.get("type") == "rss"]
        keywords = data.get("keywords", [])
        
        mp_accuracy = "-"
        if verify_results and model_key in verify_results:
            acc = verify_results[model_key].get("accuracy", 0)
            mp_accuracy = f"{acc*100:.0f}%"
        
        rss_accuracy = "-"
        if rss_verify_results and model_key in rss_verify_results:
            acc = rss_verify_results[model_key].get("accuracy", 0)
            rss_accuracy = f"{acc*100:.0f}%"
        
        print(f"{MODELS[model_key]['name']:<20} {len(mps):<10} {mp_accuracy:<14} {len(rss):<8} {rss_accuracy:<12} {len(keywords):<10}")
    
    print("-" * 100)
    
    # 详细信息
    for model_key, data in results.items():
        if "error" in data:
            continue
        
        print(f"\n\n{'='*40}")
        print(f"【{MODELS[model_key]['name']}】详细信息")
        print(f"{'='*40}")
        
        print(f"\n图标: {data.get('icon', '无')}")
        
        print(f"\n关键词 ({len(data.get('keywords', []))}个):")
        for kw in data.get("keywords", []):
            print(f"  - {kw}")
        
        sources = data.get("sources", [])
        mps = [s for s in sources if s.get("type") == "wechat_mp"]
        rss = [s for s in sources if s.get("type") == "rss"]
        
        print(f"\n公众号 ({len(mps)}个):")
        for s in mps:
            status = ""
            if verify_results and model_key in verify_results:
                for detail in verify_results[model_key].get("details", []):
                    if detail["name"] == s["name"]:
                        if detail["match"]:
                            status = " ✅"
                        elif detail["found"]:
                            status = f" ⚠️ -> {detail['found']}"
                        else:
                            status = " ❌"
                        break
            print(f"  - {s['name']}{status}")
        
        print(f"\nRSS ({len(rss)}个):")
        for s in rss:
            status = ""
            if rss_verify_results and model_key in rss_verify_results:
                for detail in rss_verify_results[model_key].get("details", []):
                    if detail["url"] == s.get("url"):
                        if detail["valid"]:
                            status = " ✅"
                        else:
                            status = f" ❌ ({detail.get('error', '未知错误')})"
                        break
            print(f"  - {s['name']}: {s.get('url', '无URL')}{status}")


def main():
    parser = argparse.ArgumentParser(description="AI 模型对比测试")
    parser.add_argument("topic", help="测试主题，如：深圳房价、读书、考研")
    parser.add_argument("--models", default="all", 
                        help="要测试的模型，逗号分隔。可选: hunyuan-thinking,hunyuan-t1,qwen-plus,qwen3-max 或 all")
    parser.add_argument("--skip-verify", action="store_true", help="跳过公众号验证")
    parser.add_argument("--hunyuan-key", help="混元 API Key")
    parser.add_argument("--dashscope-key", help="Dashscope API Key")
    
    args = parser.parse_args()
    
    # 获取 API Keys
    api_keys = {
        "hunyuan": args.hunyuan_key or os.environ.get("HUNYUAN_API_KEY", ""),
        "dashscope": args.dashscope_key or os.environ.get("DASHSCOPE_API_KEY", ""),
    }
    
    # 如果没有提供 key，尝试从配置文件读取
    if not api_keys["hunyuan"]:
        # 默认混元 key
        api_keys["hunyuan"] = "sk-1Esl0ltKDX3vuU8XXS7bEuwEbEP8b9Kydyg3T9P3y1aRvoGN"
    
    if not api_keys["dashscope"]:
        # 尝试从 docker/.env 读取
        env_path = Path(__file__).parent.parent / "docker" / ".env"
        if env_path.exists():
            with open(env_path) as f:
                for line in f:
                    if line.startswith("DASHSCOPE_API_KEY="):
                        api_keys["dashscope"] = line.split("=", 1)[1].strip()
                        break
    
    # 确定要测试的模型
    if args.models == "all":
        model_keys = list(MODELS.keys())
    else:
        model_keys = [m.strip() for m in args.models.split(",")]
        for m in model_keys:
            if m not in MODELS:
                print(f"错误: 未知模型 '{m}'")
                print(f"可选模型: {', '.join(MODELS.keys())}")
                sys.exit(1)
    
    print(f"🔍 测试主题: {args.topic}")
    print(f"📦 测试模型: {', '.join([MODELS[m]['name'] for m in model_keys])}")
    print("=" * 80)
    
    # 调用各模型
    results = {}
    for model_key in model_keys:
        print(f"\n⏳ 正在调用 {MODELS[model_key]['name']}...")
        results[model_key] = call_model(model_key, args.topic, api_keys)
        
        if "error" in results[model_key]:
            print(f"   ❌ 错误: {results[model_key]['error']}")
        else:
            sources = results[model_key].get("sources", [])
            mps = [s for s in sources if s.get("type") == "wechat_mp"]
            print(f"   ✅ 获取到 {len(mps)} 个公众号, {len(results[model_key].get('keywords', []))} 个关键词")
    
    # 验证公众号
    verify_results = {}
    rss_verify_results = {}
    
    if not args.skip_verify:
        print("\n\n🔐 开始验证公众号...")
        
        try:
            from hotnews.kernel.services.mp_credential_pool import CredentialPool
            from hotnews.kernel.providers.wechat_provider import WeChatMPProvider
            from hotnews.web.db_online import get_online_db_conn
            from hotnews.web.user_db import get_user_db_conn
            
            project_root = Path(__file__).parent.parent
            online_conn = get_online_db_conn(project_root)
            user_conn = get_user_db_conn(project_root)
            pool = CredentialPool()
            pool.load_credentials(online_conn, user_conn)
            cred = pool.get_credential()
            
            if cred:
                provider = WeChatMPProvider(cred.cookie, cred.token)
                
                for model_key, data in results.items():
                    if "error" in data:
                        continue
                    
                    sources = data.get("sources", [])
                    mp_names = [s["name"] for s in sources if s.get("type") == "wechat_mp"]
                    
                    if mp_names:
                        print(f"   验证 {MODELS[model_key]['name']} 的 {len(mp_names)} 个公众号...")
                        verify_results[model_key] = verify_mps(mp_names, provider)
                        print(f"   公众号准确率: {verify_results[model_key]['accuracy']*100:.0f}%")
            else:
                print("   ⚠️ 无可用微信凭证，跳过公众号验证")
        
        except Exception as e:
            print(f"   ⚠️ 公众号验证失败: {e}")
        
        # 验证 RSS
        print("\n🔗 开始验证 RSS...")
        for model_key, data in results.items():
            if "error" in data:
                continue
            
            sources = data.get("sources", [])
            rss_sources = [s for s in sources if s.get("type") == "rss"]
            
            if rss_sources:
                print(f"   验证 {MODELS[model_key]['name']} 的 {len(rss_sources)} 个 RSS...")
                rss_verify_results[model_key] = verify_rss(rss_sources)
                print(f"   RSS准确率: {rss_verify_results[model_key]['accuracy']*100:.0f}%")
    
    # 打印结果
    print_results(results, verify_results, rss_verify_results)
    
    # 保存结果
    output_file = Path(__file__).parent.parent / "output" / f"model_test_{args.topic}.json"
    output_file.parent.mkdir(exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump({
            "topic": args.topic,
            "results": results,
            "mp_verify_results": verify_results,
            "rss_verify_results": rss_verify_results
        }, f, ensure_ascii=False, indent=2)
    print(f"\n\n💾 结果已保存到: {output_file}")


if __name__ == "__main__":
    main()
