# coding=utf-8
"""
Platform Category Rules Admin API

Manage category assignment rules through the Admin UI.
"""
import json
import sqlite3
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from hotnews.web.db_online import get_online_db_conn
from hotnews.kernel.admin.category_rules import (
    get_all_rules,
    create_rule,
    update_rule,
    delete_rule,
    test_rule,
    initialize_default_rules,
    get_category_for_platform
)

router = APIRouter(prefix="/api/admin/category-rules", tags=["category_rules"])


class CategoryRule(BaseModel):
    pattern: str = Field(..., description="Regex pattern to match platform ID/name")
    category_id: str = Field(..., description="Target category ID")
    priority: int = Field(default=0, description="Priority (higher = earlier matching)")
    description: str = Field(default="", description="Rule description")


class CategoryRuleUpdate(BaseModel):
    pattern: Optional[str] = None
    category_id: Optional[str] = None
    priority: Optional[int] = None
    enabled: Optional[bool] = None
    description: Optional[str] = None


class TestRuleRequest(BaseModel):
    pattern: str
    test_id: str
    test_name: str = ""


def _get_project_root(request: Request):
    return request.app.state.project_root


def _get_conn(request: Request) -> sqlite3.Connection:
    return get_online_db_conn(_get_project_root(request))


def _require_admin(request: Request):
    if hasattr(request.app.state, "require_admin"):
        request.app.state.require_admin(request)


@router.get("", response_model=List[Dict[str, Any]])
async def list_category_rules(request: Request, _=Depends(_require_admin)):
    """List all category assignment rules."""
    conn = _get_conn(request)
    return get_all_rules(conn)


@router.post("")
async def create_category_rule(rule: CategoryRule, request: Request, _=Depends(_require_admin)):
    """Create a new category rule."""
    conn = _get_conn(request)
    try:
        rule_id = create_rule(
            conn,
            pattern=rule.pattern,
            category_id=rule.category_id,
            priority=rule.priority,
            description=rule.description
        )
        return {"success": True, "id": rule_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{rule_id}")
async def update_category_rule(
    rule_id: int,
    rule: CategoryRuleUpdate,
    request: Request,
    _=Depends(_require_admin)
):
    """Update an existing category rule."""
    conn = _get_conn(request)
    try:
        update_rule(
            conn,
            rule_id=rule_id,
            pattern=rule.pattern,
            category_id=rule.category_id,
            priority=rule.priority,
            enabled=rule.enabled,
            description=rule.description
        )
        return {"success": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{rule_id}")
async def delete_category_rule(rule_id: int, request: Request, _=Depends(_require_admin)):
    """Delete a category rule."""
    conn = _get_conn(request)
    try:
        delete_rule(conn, rule_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/test")
async def test_category_rule(test: TestRuleRequest, request: Request, _=Depends(_require_admin)):
    """Test if a pattern matches given platform."""
    try:
        matched = test_rule(test.pattern, test.test_id, test.test_name)
        
        # Also get what category it would be assigned
        conn = _get_conn(request)
        category = get_category_for_platform(conn, test.test_id, test.test_name)
        
        return {
            "matched": matched,
            "category": category
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/initialize")
async def initialize_rules(request: Request, _=Depends(_require_admin)):
    """Initialize default category rules."""
    conn = _get_conn(request)
    try:
        count = initialize_default_rules(conn)
        return {"success": True, "created": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
