#!/usr/bin/env python3
"""测试腾讯混元 API 调用"""

import httpx
import json

API_KEY = "sk-1Esl0ltKDX3vuU8XXS7bEuwEbEP8b9Kydyg3T9P3y1aRvoGN"
MODEL = "hunyuan-2.0-thinking-20251109"
URL = "https://api.hunyuan.cloud.tencent.com/v1/chat/completions"

def test_hunyuan():
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    
    prompt = """你是一个微信公众号专家。请推荐 3 个与"苹果公司"相关的微信公众号。

请按以下 JSON 格式输出：
{
    "sources": [
        {"name": "公众号名称", "type": "wechat_mp", "wechat_id": "微信号", "description": "简短描述"}
    ]
}

只输出 JSON，不要其他内容。"""

    request_body = {
        "model": MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.5,
        "enable_enhancement": True,  # 开启搜索增强
    }
    
    print(f"Testing Hunyuan API...")
    print(f"Model: {MODEL}")
    print(f"URL: {URL}")
    print(f"Request body: {json.dumps(request_body, ensure_ascii=False, indent=2)}")
    print("-" * 50)
    
    with httpx.Client(timeout=60) as client:
        response = client.post(URL, headers=headers, json=request_body)
        
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:2000]}")
        
        if response.status_code == 200:
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            print("-" * 50)
            print(f"Content:\n{content}")

if __name__ == "__main__":
    test_hunyuan()
