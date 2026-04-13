import logging
import os
import requests
from typing import Any, Dict, List
from threading import Lock

logger = logging.getLogger("ai.manager")


class AIModelManager:
    _instance = None
    _lock = Lock()

    def __init__(self):
        self._project_root = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def set_project_root(self, root: str):
        self._project_root = root

    def call_chat_completion(self, messages: List[Dict[str, str]], **kwargs) -> Dict[str, Any]:
        """Execute chat completion via env-configured model (DASHSCOPE_MODEL).
        Model is always read from the DASHSCOPE_MODEL environment variable.
        """
        api_key = os.environ.get("DASHSCOPE_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("DASHSCOPE_API_KEY is not set in environment variables.")

        model = os.environ.get("DASHSCOPE_MODEL", "qwen-plus").strip()
        endpoint = os.environ.get(
            "HOTNEWS_MB_AI_ENDPOINT",
            "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
        ).strip()

        logger.info(f"AI call: model={model}")
        return self._execute_call(api_key, endpoint, model, messages, **kwargs)

    def _execute_call(self, api_key: str, endpoint: str, model_name: str, messages: List[Dict[str, str]], timeout=60) -> Dict[str, Any]:
        """OpenAI-compatible API call with model-specific handling."""
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

        processed_messages = self._prepare_messages_for_model(model_name, messages)

        payload = {
            "model": model_name,
            "messages": processed_messages,
            "temperature": 0
        }

        model_lower = model_name.lower()

        # GLM models require stream mode
        if "glm-4.5" in model_lower or "glm-4-" in model_lower:
            payload["stream"] = True

        # Kimi thinking models need longer timeout
        if "kimi" in model_lower and "thinking" in model_lower:
            timeout = max(timeout, 120)

        if payload.get("stream"):
            return self._execute_stream_request(endpoint, headers, payload, timeout)

        resp = requests.post(endpoint, json=payload, headers=headers, timeout=timeout)

        if resp.status_code >= 400:
            raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:200]}")

        data = resp.json()

        if "choices" not in data or not data["choices"]:
            raise RuntimeError("Invalid response: missing 'choices'")

        return data

    def _prepare_messages_for_model(self, model_name: str, messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
        """Prepare messages based on model requirements."""
        model_lower = model_name.lower()

        # qwen-mt-* models don't support system role - merge into first user message
        if "qwen-mt-" in model_lower:
            processed = []
            system_content = ""
            for msg in messages:
                role = msg.get("role", "").lower()
                content = msg.get("content", "")
                if role == "system":
                    system_content = content
                elif role == "user":
                    if system_content:
                        content = f"{system_content}\n\n---\n\n{content}"
                        system_content = ""
                    processed.append({"role": "user", "content": content})
                else:
                    processed.append({"role": role, "content": content})
            return processed

        return messages

    def _execute_stream_request(self, endpoint: str, headers: dict, payload: dict, timeout: int) -> Dict[str, Any]:
        """Execute streaming request and collect full response."""
        import json as json_module

        resp = requests.post(endpoint, json=payload, headers=headers, timeout=timeout, stream=True)

        if resp.status_code >= 400:
            raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:200]}")

        full_content = ""
        model_name = payload.get("model", "unknown")
        finish_reason = None

        for line in resp.iter_lines():
            if not line:
                continue
            line_str = line.decode("utf-8", errors="ignore")
            if not line_str.startswith("data:"):
                continue
            data_str = line_str[5:].strip()
            if data_str == "[DONE]":
                break
            try:
                chunk = json_module.loads(data_str)
                if chunk.get("model"):
                    model_name = chunk["model"]
                choices = chunk.get("choices", [])
                if choices:
                    delta = choices[0].get("delta", {})
                    content_piece = delta.get("content", "")
                    if content_piece:
                        full_content += content_piece
                    if choices[0].get("finish_reason"):
                        finish_reason = choices[0]["finish_reason"]
            except json_module.JSONDecodeError:
                continue

        return {
            "model": model_name,
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": full_content},
                    "finish_reason": finish_reason or "stop"
                }
            ]
        }
