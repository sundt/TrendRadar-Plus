# coding=utf-8
"""
AI Polish API Routes

Provides REST API endpoints for AI-powered text polishing:
- Rewrite: 改写文本，保持原意但换种表达
- Expand: 扩写文本，增加细节和内容
- Summarize: 缩写文本，精简内容
- Translate: 翻译文本
"""

from typing import Optional, Literal
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel, Field

from .auth import require_member

router = APIRouter(prefix="/api/publisher/ai", tags=["publisher"])


# ==================== Request/Response Models ====================

class PolishRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000, description="要处理的文本")
    action: Literal["rewrite", "expand", "summarize", "translate"] = Field(..., description="处理类型")
    target_lang: Optional[str] = Field(None, description="翻译目标语言（仅翻译时需要）")
    style: Optional[str] = Field(None, description="风格偏好（可选）")


class PolishResponse(BaseModel):
    ok: bool
    data: Optional[dict] = None
    error: Optional[str] = None


# ==================== AI Service ====================

async def call_ai_service(prompt: str, system_prompt: str = "") -> str:
    """
    调用 AI 服务生成文本。
    
    这里使用项目已有的 AI 服务配置。
    """
    try:
        # 尝试使用项目的 AI 服务
        from hotnews.kernel.ai import get_ai_client
        
        client = get_ai_client()
        if not client:
            raise Exception("AI 服务未配置")
        
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        response = await client.chat(messages)
        return response.get("content", "")
        
    except ImportError:
        # 降级：使用简单的规则处理
        return _fallback_process(prompt)
    except Exception as e:
        raise HTTPException(500, f"AI 服务调用失败: {str(e)}")


def _fallback_process(text: str) -> str:
    """降级处理：当 AI 服务不可用时的简单处理。"""
    return text


# ==================== Prompt Templates ====================

PROMPTS = {
    "rewrite": {
        "system": "你是一个专业的文字编辑，擅长改写文本。保持原意不变，但用不同的表达方式重新组织语言，使文字更加流畅、专业。",
        "user": "请改写以下文本，保持原意但换种表达方式：\n\n{text}"
    },
    "expand": {
        "system": "你是一个专业的内容创作者，擅长扩展和丰富文本内容。在保持原意的基础上，添加更多细节、例子或解释，使内容更加充实。",
        "user": "请扩写以下文本，添加更多细节和内容：\n\n{text}"
    },
    "summarize": {
        "system": "你是一个专业的编辑，擅长精简文本。保留核心信息，去除冗余内容，使文字更加简洁有力。",
        "user": "请精简以下文本，保留核心内容：\n\n{text}"
    },
    "translate": {
        "system": "你是一个专业的翻译，擅长准确、流畅地翻译文本。保持原文的语气和风格。",
        "user": "请将以下文本翻译成{target_lang}：\n\n{text}"
    }
}


# ==================== API Endpoints ====================

@router.post("/polish")
async def api_polish_text(request: Request, data: PolishRequest):
    """
    AI 润色文本。
    
    支持的操作：
    - rewrite: 改写
    - expand: 扩写
    - summarize: 缩写
    - translate: 翻译
    
    Args:
        data: 润色请求数据
        
    Returns:
        润色后的文本
    """
    user = await require_member(request)
    
    text = data.text.strip()
    if not text:
        raise HTTPException(400, "文本不能为空")
    
    action = data.action
    
    # 获取 prompt 模板
    if action not in PROMPTS:
        raise HTTPException(400, f"不支持的操作: {action}")
    
    prompt_config = PROMPTS[action]
    system_prompt = prompt_config["system"]
    
    # 构建用户 prompt
    if action == "translate":
        target_lang = data.target_lang or "英文"
        user_prompt = prompt_config["user"].format(text=text, target_lang=target_lang)
    else:
        user_prompt = prompt_config["user"].format(text=text)
    
    # 添加风格偏好
    if data.style:
        user_prompt += f"\n\n风格要求：{data.style}"
    
    try:
        result = await call_ai_service(user_prompt, system_prompt)
        
        return {
            "ok": True,
            "data": {
                "original": text,
                "result": result,
                "action": action
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"处理失败: {str(e)}")


@router.get("/polish/actions")
async def api_get_polish_actions(request: Request):
    """
    获取支持的润色操作列表。
    
    Returns:
        操作列表及其描述
    """
    return {
        "ok": True,
        "data": [
            {
                "action": "rewrite",
                "name": "改写",
                "description": "保持原意，换种表达方式",
                "icon": "✏️"
            },
            {
                "action": "expand",
                "name": "扩写",
                "description": "添加更多细节和内容",
                "icon": "📝"
            },
            {
                "action": "summarize",
                "name": "缩写",
                "description": "精简内容，保留核心",
                "icon": "📋"
            },
            {
                "action": "translate",
                "name": "翻译",
                "description": "翻译成其他语言",
                "icon": "🌐",
                "options": {
                    "target_lang": ["英文", "中文", "日文", "韩文", "法文", "德文", "西班牙文"]
                }
            }
        ]
    }
