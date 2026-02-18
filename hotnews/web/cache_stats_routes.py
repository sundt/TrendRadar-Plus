"""
缓存统计 API

监控 CDN 缓存命中率和性能指标
"""

from collections import defaultdict
from datetime import datetime
from typing import Dict, Any

from fastapi import APIRouter, Request, Depends

router = APIRouter(prefix="/api/cache", tags=["cache"])

# 缓存统计数据
_cache_stats: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
    "hits": 0,
    "misses": 0,
    "total_requests": 0,
    "last_access": None,
})

def record_cache_access(path: str, is_hit: bool):
    """记录缓存访问"""
    stats = _cache_stats[path]
    stats["total_requests"] += 1
    if is_hit:
        stats["hits"] += 1
    else:
        stats["misses"] += 1
    stats["last_access"] = datetime.now().isoformat()


@router.get("/stats")
async def get_cache_stats(request: Request):
    """
    获取缓存统计信息
    
    返回各个路径的缓存命中率
    """
    # 计算总体统计
    total_hits = sum(s["hits"] for s in _cache_stats.values())
    total_misses = sum(s["misses"] for s in _cache_stats.values())
    total_requests = total_hits + total_misses
    
    hit_rate = (total_hits / total_requests * 100) if total_requests > 0 else 0
    
    # 按路径分组统计
    path_stats = {}
    for path, stats in _cache_stats.items():
        path_total = stats["hits"] + stats["misses"]
        path_hit_rate = (stats["hits"] / path_total * 100) if path_total > 0 else 0
        
        path_stats[path] = {
            "hits": stats["hits"],
            "misses": stats["misses"],
            "total": path_total,
            "hit_rate": round(path_hit_rate, 2),
            "last_access": stats["last_access"],
        }
    
    # 按请求数排序
    sorted_paths = sorted(
        path_stats.items(),
        key=lambda x: x[1]["total"],
        reverse=True
    )
    
    return {
        "summary": {
            "total_requests": total_requests,
            "total_hits": total_hits,
            "total_misses": total_misses,
            "hit_rate": round(hit_rate, 2),
        },
        "by_path": dict(sorted_paths[:50]),  # 只返回前50个最常访问的路径
        "top_cached": [
            {"path": path, **stats}
            for path, stats in sorted_paths[:10]
            if stats["hit_rate"] > 50
        ],
        "needs_optimization": [
            {"path": path, **stats}
            for path, stats in sorted_paths[:20]
            if stats["hit_rate"] < 30 and stats["total"] > 10
        ],
    }


@router.post("/reset")
async def reset_cache_stats(request: Request):
    """
    重置缓存统计
    
    需要管理员权限
    """
    from hotnews.web.server import _require_admin
    _require_admin(request)
    
    _cache_stats.clear()
    return {"message": "Cache stats reset successfully"}


@router.get("/recommendations")
async def get_cache_recommendations(request: Request):
    """
    获取缓存优化建议
    
    基于统计数据提供优化建议
    """
    recommendations = []
    
    for path, stats in _cache_stats.items():
        total = stats["hits"] + stats["misses"]
        if total < 10:
            continue
        
        hit_rate = (stats["hits"] / total * 100) if total > 0 else 0
        
        # 高流量但低命中率的路径
        if total > 100 and hit_rate < 30:
            recommendations.append({
                "path": path,
                "issue": "high_traffic_low_hit_rate",
                "description": f"高流量路径（{total} 请求）但缓存命中率低（{hit_rate:.1f}%）",
                "suggestion": "考虑增加缓存时间或检查 Vary 头配置",
                "priority": "high",
            })
        
        # 中等流量但零命中率
        elif total > 50 and hit_rate == 0:
            recommendations.append({
                "path": path,
                "issue": "no_cache",
                "description": f"中等流量路径（{total} 请求）完全没有缓存",
                "suggestion": "检查是否应该添加缓存策略",
                "priority": "medium",
            })
        
        # 低流量但高命中率（可以增加缓存时间）
        elif total > 20 and hit_rate > 80:
            recommendations.append({
                "path": path,
                "issue": "can_extend_cache",
                "description": f"缓存命中率很高（{hit_rate:.1f}%）",
                "suggestion": "可以考虑延长缓存时间以进一步减少请求",
                "priority": "low",
            })
    
    # 按优先级排序
    priority_order = {"high": 0, "medium": 1, "low": 2}
    recommendations.sort(key=lambda x: priority_order[x["priority"]])
    
    return {
        "recommendations": recommendations,
        "total_count": len(recommendations),
    }
