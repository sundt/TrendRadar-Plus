import json
import logging
import os
import time
import requests
from typing import Any, Dict, List, Optional
from datetime import datetime
from threading import Lock

# Assume we can import get_online_db_conn from web.db_online
try:
    from hotnews.web.db_online import get_online_db_conn
except ImportError:
    # Fallback for standalone testing or different import path structure
    def get_online_db_conn(project_root=None):
        import sqlite3
        path = os.path.join(project_root or os.getcwd(), "hotnews/output/online.db")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        return sqlite3.connect(path)

logger = logging.getLogger("ai.manager")

class AIModelManager:
    _instance = None
    _lock = Lock()

    def __init__(self):
        self._project_root = None
        # Cache for config to avoid DB hit every time (optional optimization)
        self._providers_cache = []
        self._models_cache = []
        self._last_load_ts = 0
        self._cache_ttl = 30  # seconds

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def set_project_root(self, root: str):
        self._project_root = root

    def _get_conn(self):
        return get_online_db_conn(self._project_root)

    def _ensure_admin_kv_table(self, conn):
        conn.execute("""
            CREATE TABLE IF NOT EXISTS admin_kv (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at INTEGER
            )
        """)

    def load_config(self, force=False):
        """Load providers and models from admin_kv table."""
        now = time.time()
        if not force and now - self._last_load_ts < self._cache_ttl:
            return

        try:
            with self._get_conn() as conn:
                self._ensure_admin_kv_table(conn)
                
                # Load Providers
                cur = conn.execute("SELECT value FROM admin_kv WHERE key = ?", ("ai_providers",))
                row = cur.fetchone()
                if row and row[0]:
                    self._providers_cache = json.loads(row[0])
                else:
                    self._providers_cache = []

                # Load Models
                cur = conn.execute("SELECT value FROM admin_kv WHERE key = ?", ("ai_models",))
                row = cur.fetchone()
                if row and row[0]:
                    self._models_cache = json.loads(row[0])
                else:
                    self._models_cache = []

                self._last_load_ts = now
        except Exception as e:
            logger.error(f"Failed to load AI config: {e}")

    def save_providers(self, providers: List[Dict[str, Any]]):
        """Save providers list to DB. 
        provider struct: {id, type, name, base_url, api_key, enabled}
        """
        with self._get_conn() as conn:
            self._ensure_admin_kv_table(conn)
            conn.execute(
                "INSERT OR REPLACE INTO admin_kv (key, value, updated_at) VALUES (?, ?, ?)",
                ("ai_providers", json.dumps(providers), int(time.time()))
            )
        self.load_config(force=True)

    def save_models(self, models: List[Dict[str, Any]]):
        """Save models list to DB.
        model struct: {id, name, provider_id, priority, expires, enabled}
        """
        with self._get_conn() as conn:
            self._ensure_admin_kv_table(conn)
            conn.execute(
                "INSERT OR REPLACE INTO admin_kv (key, value, updated_at) VALUES (?, ?, ?)",
                ("ai_models", json.dumps(models), int(time.time()))
            )
        self.load_config(force=True)

    def get_providers(self) -> List[Dict[str, Any]]:
        self.load_config()
        return self._providers_cache

    def get_models(self) -> List[Dict[str, Any]]:
        self.load_config()
        return self._models_cache

    def get_active_rotation_list(self) -> List[Dict[str, Any]]:
        """Return list of models ready for use, sorted by priority.
        Filters out: disabled, expired, invalid provider.
        """
        self.load_config()
        
        # Map provider_id -> provider
        pmap = {p["id"]: p for p in self._providers_cache if p.get("enabled", True)}
        
        candidates = []
        now_str = datetime.now().strftime("%Y-%m-%d")

        for m in self._models_cache:
            if not m.get("enabled", True):
                continue
            
            # Check expiration
            expires = (m.get("expires") or "").strip()
            if expires and expires < now_str:
                continue

            # Check provider
            pid = m.get("provider_id")
            if not pid or pid not in pmap:
                continue
            
            # Enriched model object
            m_copy = m.copy()
            m_copy["_provider_config"] = pmap[pid]
            candidates.append(m_copy)

        # Sort by priority (ASC), then by ID
        candidates.sort(key=lambda x: (int(x.get("priority", 999)), x.get("id", "")))
        return candidates

    def call_chat_completion(self, messages: List[Dict[str, str]], **kwargs) -> Dict[str, Any]:
        """Execute chat completion with rotation logic.
        Auto-switches to next model if current fails.
        """
        candidates = self.get_active_rotation_list()
        
        # Fallback to env var if no DB config
        if not candidates:
            # Fallback legacy logic
            logger.info("No DB-configured models found, utilizing legacy env implementation...")
            return self._call_legacy_env_fallback(messages, **kwargs)

        last_error = None
        
        for model_conf in candidates:
            try:
                provider = model_conf["_provider_config"]
                logger.info(f"AI Rotation: Trying model '{model_conf['name']}' (Provider: {provider.get('name', provider['id'])})...")
                
                resp = self._execute_provider_call(provider, model_conf["name"], messages, **kwargs)
                return resp
                
            except Exception as e:
                logger.warning(f"AI Rotation: Model '{model_conf['name']}' failed: {str(e)[:200]}. Switching to next...")
                last_error = e
                continue
        
        raise RuntimeError(f"All AI models failed. Last error: {last_error}")

    def _execute_provider_call(self, provider: Dict[str, Any], model_name: str, messages: List[Dict[str, str]], timeout=60) -> Dict[str, Any]:
        """Generic OpenAI-compatible API call with model-specific handling"""
        
        api_key = provider.get("api_key", "").strip()
        base_url = provider.get("base_url", "").strip()
        
        # If no explicit key, check if referencing an Env Var (legacy/security support)
        # e.g provider.api_key = "$DASHSCOPE_API_KEY"
        if api_key.startswith("$"):
            env_var = api_key[1:]
            api_key = os.environ.get(env_var, "")
            
        if not api_key:
            raise ValueError(f"Missing API Key for provider {provider.get('id')}")
            
        # Standardize Endpoint
        if not base_url.endswith("/v1"):
             # Many users forget /v1 or /chat/completions. 
             # We assume base_url is root unless specified. 
             # But OpenAI client usually expects base_url.
             # Here we use raw requests, so we need full URL.
             # Actually, let's assume base_url IS the chat endpoint or we try to smart-append.
             pass

        # For simplicity, we assume base_url points to the API root (e.g. https://api.openai.com/v1)
        # and we append /chat/completions
        endpoint = base_url.rstrip("/")
        if not endpoint.endswith("/chat/completions"):
            endpoint += "/chat/completions"

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        # Handle 'headers' override from provider config if needed (e.g. org id)
        
        # Prepare messages - handle model-specific requirements
        processed_messages = self._prepare_messages_for_model(model_name, messages)
        
        payload = {
            "model": model_name,
            "messages": processed_messages,
            "temperature": 0
        }
        
        # Model-specific adjustments
        model_lower = model_name.lower()
        
        # GLM models require stream mode
        if "glm-4.5" in model_lower or "glm-4-" in model_lower:
            payload["stream"] = True
            
        # Kimi thinking models need longer timeout
        if "kimi" in model_lower and "thinking" in model_lower:
            timeout = max(timeout, 120)  # At least 2 minutes for thinking models
        
        # Handle stream mode response
        if payload.get("stream"):
            return self._execute_stream_request(endpoint, headers, payload, timeout)
        
        # Standard non-stream request
        resp = requests.post(endpoint, json=payload, headers=headers, timeout=timeout)
        
        if resp.status_code >= 400:
             raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:200]}")
             
        data = resp.json()
        
        # Validate standard OpenAI format
        if "choices" not in data or not data["choices"]:
            raise RuntimeError("Invalid response: missing 'choices'")
            
        return data
    
    def _prepare_messages_for_model(self, model_name: str, messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
        """Prepare messages based on model requirements"""
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
                        # Merge system prompt into user message
                        content = f"{system_content}\n\n---\n\n{content}"
                        system_content = ""
                    processed.append({"role": "user", "content": content})
                else:
                    processed.append({"role": role, "content": content})
            
            return processed
        
        # Default: return messages as-is
        return messages
    
    def _execute_stream_request(self, endpoint: str, headers: dict, payload: dict, timeout: int) -> Dict[str, Any]:
        """Execute streaming request and collect full response"""
        import json as json_module
        
        resp = requests.post(endpoint, json=payload, headers=headers, timeout=timeout, stream=True)
        
        if resp.status_code >= 400:
            raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:200]}")
        
        # Collect streamed content
        full_content = ""
        model_name = payload.get("model", "unknown")
        finish_reason = None
        
        for line in resp.iter_lines():
            if not line:
                continue
            
            line_str = line.decode("utf-8", errors="ignore")
            
            # Skip non-data lines
            if not line_str.startswith("data:"):
                continue
            
            data_str = line_str[5:].strip()
            
            # End of stream
            if data_str == "[DONE]":
                break
            
            try:
                chunk = json_module.loads(data_str)
                
                # Extract model name from first chunk
                if chunk.get("model"):
                    model_name = chunk["model"]
                
                # Extract content delta
                choices = chunk.get("choices", [])
                if choices:
                    delta = choices[0].get("delta", {})
                    content_piece = delta.get("content", "")
                    if content_piece:
                        full_content += content_piece
                    
                    # Check finish reason
                    if choices[0].get("finish_reason"):
                        finish_reason = choices[0]["finish_reason"]
                        
            except json_module.JSONDecodeError:
                continue
        
        # Return in standard OpenAI format
        return {
            "model": model_name,
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": full_content
                    },
                    "finish_reason": finish_reason or "stop"
                }
            ]
        }

    def _call_legacy_env_fallback(self, messages, **kwargs):
        """Original implementation moved here as fallback"""
        # This implementation mirrors _mb_ai_call_qwen logic roughly but returns raw OpenAI format
        # Actually it's better to raise error if user expects rotation but config is empty.
        # But to be safe, we check HOTNEWS_MB_AI_ENABLED env vars.
        
        api_key = os.environ.get("DASHSCOPE_API_KEY", "").strip()
        if not api_key:
             raise RuntimeError("No AI Config (DB empty) and DASHSCOPE_API_KEY missing.")
             
        model = os.environ.get("HOTNEWS_MB_AI_MODEL", "qwen-plus").strip()
        endpoint = os.environ.get("HOTNEWS_MB_AI_ENDPOINT", "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions").strip()
        
        return self._execute_provider_call({
            "id": "legacy_env",
            "api_key": api_key,
            "base_url": endpoint.replace("/chat/completions", "")
        }, model, messages, **kwargs)
