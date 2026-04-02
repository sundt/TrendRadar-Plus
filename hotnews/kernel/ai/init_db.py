import os
import sys

# Ensure project root is in path
sys.path.append(os.getcwd())

from hotnews.kernel.ai.manager import AIModelManager

def init_defaults():
    mgr = AIModelManager.get_instance()
    mgr.set_project_root(os.getcwd()) # Fix: Set project root explicitly
    
    # 1. Initialize Providers
    # We create placeholders for common providers. API keys are left empty or valid if env var exists.
    providers = [
        {
            "id": "dashscope",
            "name": "Aliyun DashScope",
            "type": "openai_compatible",
            "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
            "api_key": "$DASHSCOPE_API_KEY",  # References env var by default
            "enabled": True
        },
        {
            "id": "deepseek",
            "name": "DeepSeek",
            "type": "openai_compatible",
            "base_url": "https://api.deepseek.com/v1",
            "api_key": "$DEEPSEEK_API_KEY",
            "enabled": True
        },
        {
            "id": "openai",
            "name": "OpenAI Official",
            "type": "openai_compatible",
            "base_url": "https://api.openai.com/v1",
            "api_key": "$OPENAI_API_KEY",
            "enabled": True
        }
    ]
    
    # Check if DB already has providers
    existing_p = mgr.get_providers()
    if not existing_p:
        print("Initializing default AI Providers...")
        mgr.save_providers(providers)
    else:
        print(f"AI Providers already exist ({len(existing_p)}), skipping init.")

    # 2. Initialize Models
    # Use $DASHSCOPE_MODEL reference so DB entry always resolves from env var
    existing_m = mgr.get_models()
    if not existing_m:
        print("Initializing default AI Models (env-var reference)...")
        models = [
            {
                "id": "default-env-model",
                "name": "$DASHSCOPE_MODEL",  # Resolves to DASHSCOPE_MODEL env var at runtime
                "provider_id": "dashscope",
                "priority": 50,
                "expires": "",
                "enabled": True
            }
        ]
        mgr.save_models(models)
    else:
        print(f"AI Models already exist ({len(existing_m)}), skipping init.")

if __name__ == "__main__":
    init_defaults()
