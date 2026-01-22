"""
Admin API for managing tag candidates and evolution.

Endpoints:
- GET /admin/tag-candidates - List candidate tags
- POST /admin/tag-candidates/{tag_id}/approve - Approve and promote
- POST /admin/tag-candidates/{tag_id}/reject - Reject candidate
- GET /admin/tag-evolution/logs - Get evolution logs
"""

import time
from typing import Optional
from fastapi import APIRouter, Request, Query, Body, HTTPException

from hotnews.kernel.services.tag_discovery import TagDiscoveryService
from hotnews.web.db_online import get_online_db_conn
from pathlib import Path


router = APIRouter(prefix="/admin/tag-candidates", tags=["Tag Candidates Admin"])

# Get project root - same pattern as other modules
project_root = Path(__file__).parent.parent.parent.parent


def _get_online_db_conn():
    """Get online database connection."""
    return get_online_db_conn(project_root)


@router.get("")
async def list_tag_candidates(
    request: Request,
    status: str = Query("pending", description="Filter by status: pending, approved, rejected, all"),
    order_by: str = Query("occurrence_count", description="Order by: occurrence_count, avg_confidence, created_at"),
    limit: int = Query(50, ge=1, le=200),
):
    """List tag candidates with optional filtering."""
    conn = _get_online_db_conn()
    service = TagDiscoveryService(conn)
    
    candidates = service.get_candidates(
        status=status,
        limit=limit,
        order_by=order_by,
    )
    
    # Get stats
    stats = {
        "pending": 0,
        "approved": 0,
        "rejected": 0,
    }
    try:
        cur = conn.execute(
            "SELECT status, COUNT(*) FROM tag_candidates GROUP BY status"
        )
        for row in cur.fetchall():
            if row[0] in stats:
                stats[row[0]] = row[1]
    except Exception:
        pass
    
    return {
        "ok": True,
        "candidates": candidates,
        "stats": stats,
        "count": len(candidates),
    }


@router.get("/qualified")
async def get_qualified_candidates(request: Request):
    """Get candidates that meet promotion criteria."""
    conn = _get_online_db_conn()
    service = TagDiscoveryService(conn)
    
    qualified = service.get_qualified_candidates()
    
    return {
        "ok": True,
        "qualified": qualified,
        "count": len(qualified),
    }


@router.get("/{tag_id}")
async def get_candidate_detail(request: Request, tag_id: str):
    """Get detailed info about a specific candidate."""
    conn = _get_online_db_conn()
    
    cur = conn.execute(
        "SELECT * FROM tag_candidates WHERE tag_id = ?",
        (tag_id,)
    )
    row = cur.fetchone()
    
    if not row:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    columns = [desc[0] for desc in cur.description]
    candidate = dict(zip(columns, row))
    
    # Parse JSON fields
    import json
    try:
        candidate["sample_titles"] = json.loads(candidate.get("sample_titles") or "[]")
    except:
        candidate["sample_titles"] = []
    
    # Get evolution logs for this tag
    service = TagDiscoveryService(conn)
    logs = service.get_evolution_logs(tag_id=tag_id, limit=20)
    
    return {
        "ok": True,
        "candidate": candidate,
        "evolution_logs": logs,
    }


@router.post("/{tag_id}/approve")
async def approve_candidate(
    request: Request,
    tag_id: str,
    icon: str = Body("🏷️", description="Emoji icon for the tag"),
):
    """Approve and promote a candidate tag to official tags."""
    conn = _get_online_db_conn()
    service = TagDiscoveryService(conn)
    
    success = service.promote_candidate(tag_id, icon=icon)
    
    if not success:
        raise HTTPException(status_code=400, detail="Failed to promote candidate")
    
    return {
        "ok": True,
        "message": f"Candidate '{tag_id}' promoted to official tag",
    }


@router.post("/{tag_id}/reject")
async def reject_candidate(
    request: Request,
    tag_id: str,
    reason: str = Body("", description="Rejection reason"),
):
    """Reject a candidate tag."""
    conn = _get_online_db_conn()
    service = TagDiscoveryService(conn)
    
    success = service.reject_candidate(tag_id, reason=reason)
    
    if not success:
        raise HTTPException(status_code=400, detail="Failed to reject candidate")
    
    return {
        "ok": True,
        "message": f"Candidate '{tag_id}' rejected",
    }


# Evolution logs router
evolution_router = APIRouter(prefix="/admin/tag-evolution", tags=["Tag Evolution Admin"])


@evolution_router.get("/logs")
async def get_evolution_logs(
    request: Request,
    tag_id: Optional[str] = Query(None, description="Filter by tag ID"),
    action: Optional[str] = Query(None, description="Filter by action type"),
    limit: int = Query(100, ge=1, le=500),
):
    """Get tag evolution logs."""
    conn = _get_online_db_conn()
    service = TagDiscoveryService(conn)
    
    logs = service.get_evolution_logs(
        tag_id=tag_id,
        action=action,
        limit=limit,
    )
    
    return {
        "ok": True,
        "logs": logs,
        "count": len(logs),
    }


@evolution_router.get("/stats")
async def get_evolution_stats(request: Request):
    """Get tag evolution statistics."""
    conn = _get_online_db_conn()
    
    stats = {}
    
    try:
        # Action counts
        cur = conn.execute(
            "SELECT action, COUNT(*) FROM tag_evolution_log GROUP BY action"
        )
        stats["by_action"] = {row[0]: row[1] for row in cur.fetchall()}
        
        # Recent activity (last 24h)
        cutoff = int(time.time()) - 86400
        cur = conn.execute(
            "SELECT COUNT(*) FROM tag_evolution_log WHERE created_at >= ?",
            (cutoff,)
        )
        stats["last_24h"] = cur.fetchone()[0]
        
        # Total candidates
        cur = conn.execute("SELECT COUNT(*) FROM tag_candidates")
        stats["total_candidates"] = cur.fetchone()[0]
        
        # Official dynamic tags
        cur = conn.execute("SELECT COUNT(*) FROM tags WHERE is_dynamic = 1")
        stats["dynamic_tags"] = cur.fetchone()[0]
        
    except Exception as e:
        stats["error"] = str(e)
    
    return {
        "ok": True,
        "stats": stats,
    }
