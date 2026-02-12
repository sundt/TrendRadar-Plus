"""
Admin AI Config Routes

AI 模型管理 API 端点（管理员专用）。
从 server.py 提取，降低主文件复杂度。
"""

import random
import time
from typing import Any, Dict

from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import JSONResponse

from hotnews.web.deps import require_admin, project_root
from hotnews.kernel.ai.manager import AIModelManager

router = APIRouter()


@router.get("/api/admin/ai/config", response_class=JSONResponse)
async def api_admin_ai_config_get(request: Request):
    """Get entire AI configuration (providers + models)"""
    require_admin(request)
    mgr = AIModelManager.get_instance()
    if mgr._project_root is None:
        mgr.set_project_root(project_root)
    return {
        "ok": True,
        "providers": mgr.get_providers(),
        "models": mgr.get_models(),
    }


@router.post("/api/admin/ai/providers", response_class=JSONResponse)
async def api_admin_ai_providers_save(request: Request, payload: Dict[str, Any] = Body(...)):
    """Save providers list (Full Replace)"""
    require_admin(request)
    providers = payload.get("providers")
    if not isinstance(providers, list):
        raise HTTPException(status_code=400, detail="Invalid providers format")
    mgr = AIModelManager.get_instance()
    if mgr._project_root is None:
        mgr.set_project_root(project_root)
    mgr.save_providers(providers)
    return {"ok": True}


@router.post("/api/admin/ai/models", response_class=JSONResponse)
async def api_admin_ai_models_save(request: Request, payload: Dict[str, Any] = Body(...)):
    """Save models list (Full Replace)"""
    require_admin(request)
    models = payload.get("models")
    if not isinstance(models, list):
        raise HTTPException(status_code=400, detail="Invalid models format")
    mgr = AIModelManager.get_instance()
    if mgr._project_root is None:
        mgr.set_project_root(project_root)
    mgr.save_models(models)
    return {"ok": True}


@router.post("/api/admin/ai/models/batch_import", response_class=JSONResponse)
async def api_admin_ai_models_import(request: Request, payload: Dict[str, Any] = Body(...)):
    """Parse text and merge into existing models
    Format: ProviderName | ModelName | Priority | Expires
    """
    require_admin(request)
    text = payload.get("text", "")
    mode = payload.get("mode", "append")

    mgr = AIModelManager.get_instance()
    if mgr._project_root is None:
        mgr.set_project_root(project_root)

    current_models = mgr.get_models() if mode == "append" else []

    lines = text.split("\n")
    added_count = 0

    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue

        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 2:
            continue

        pid = parts[0]
        name = parts[1]
        priority = 50
        expires = ""

        if len(parts) > 2 and parts[2]:
            try:
                priority = int(parts[2])
            except Exception:
                pass

        if len(parts) > 3:
            expires = parts[3]

        new_model = {
            "id": f"gen_{int(time.time())}_{random.randint(1000, 9999)}",
            "name": name,
            "provider_id": pid,
            "priority": priority,
            "expires": expires,
            "enabled": True,
        }
        current_models.append(new_model)
        added_count += 1

    mgr.save_models(current_models)
    return {"ok": True, "added": added_count, "total": len(current_models)}


@router.post("/api/admin/ai/rotation_test", response_class=JSONResponse)
async def api_admin_ai_test_rotation(request: Request):
    """Simulate rotation logic and return which model would be picked first"""
    require_admin(request)
    mgr = AIModelManager.get_instance()
    if mgr._project_root is None:
        mgr.set_project_root(project_root)

    candidates = mgr.get_active_rotation_list()
    if not candidates:
        return {"ok": False, "detail": "No active models found"}

    return {
        "ok": True,
        "selected_model": candidates[0],
        "all_candidates": candidates,
    }
