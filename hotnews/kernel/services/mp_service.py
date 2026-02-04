"""
MP Service - 公众号服务模块

统一管理公众号数据，将所有公众号存储在 featured_wechat_mps 表中。
支持三种来源：
- admin: 管理员添加
- ai_recommend: AI 推荐（主题追踪）
- user: 用户添加
"""

import sqlite3
import time
from typing import Optional, Dict, Any, List


class MPService:
    """公众号服务 - 统一管理公众号数据"""
    
    def __init__(self, conn: sqlite3.Connection):
        """
        初始化公众号服务
        
        Args:
            conn: 在线数据库连接 (online.db)
        """
        self.conn = conn
    
    def get_or_create_mp(
        self,
        fakeid: str,
        nickname: str,
        source: str = 'admin',
        added_by_user_id: Optional[int] = None,
        round_head_img: str = "",
        signature: str = "",
        category: str = "general",
        enabled: int = 1,
    ) -> Dict[str, Any]:
        """
        获取或创建公众号记录
        
        如果公众号已存在（根据 fakeid），返回现有记录。
        如果不存在，创建新记录并返回。
        
        Args:
            fakeid: 公众号唯一标识
            nickname: 公众号名称
            source: 来源类型 ('admin', 'ai_recommend', 'user')
            added_by_user_id: 添加者用户 ID（仅 source='user' 时使用）
            round_head_img: 头像 URL
            signature: 简介
            category: 分类
            enabled: 是否启用 (0/1)
        
        Returns:
            {
                "id": int,
                "fakeid": str,
                "nickname": str,
                "source": str,
                "enabled": int,
                "is_new": bool  # True 表示新创建，False 表示已存在
            }
        
        Raises:
            ValueError: 如果 fakeid 或 nickname 为空，或 source 值无效
        """
        # 参数验证
        fakeid = (fakeid or "").strip()
        nickname = (nickname or "").strip()
        source = (source or "admin").strip().lower()
        
        if not fakeid:
            raise ValueError("fakeid 不能为空")
        if not nickname:
            raise ValueError("公众号名称不能为空")
        if source not in ('admin', 'ai_recommend', 'user'):
            raise ValueError(f"无效的来源类型: {source}")
        
        # 检查是否已存在
        existing = self.get_mp_by_fakeid(fakeid)
        if existing:
            return {
                "id": existing["id"],
                "fakeid": existing["fakeid"],
                "nickname": existing["nickname"],
                "source": existing.get("source", "admin"),
                "enabled": existing.get("enabled", 1),
                "is_new": False,
            }
        
        # 创建新记录
        now = int(time.time())
        
        # added_by_user_id 只在 source='user' 时有效
        user_id = added_by_user_id if source == 'user' else None
        
        try:
            cur = self.conn.execute(
                """
                INSERT INTO featured_wechat_mps 
                (fakeid, nickname, round_head_img, signature, category, 
                 sort_order, enabled, source, added_by_user_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
                """,
                (fakeid, nickname, round_head_img, signature, category,
                 enabled, source, user_id, now, now)
            )
            self.conn.commit()
            
            return {
                "id": cur.lastrowid,
                "fakeid": fakeid,
                "nickname": nickname,
                "source": source,
                "enabled": enabled,
                "is_new": True,
            }
        except sqlite3.IntegrityError:
            # 并发情况下可能已被其他进程创建
            self.conn.rollback()
            existing = self.get_mp_by_fakeid(fakeid)
            if existing:
                return {
                    "id": existing["id"],
                    "fakeid": existing["fakeid"],
                    "nickname": existing["nickname"],
                    "source": existing.get("source", "admin"),
                    "enabled": existing.get("enabled", 1),
                    "is_new": False,
                }
            raise
    
    def get_mp_by_fakeid(self, fakeid: str) -> Optional[Dict[str, Any]]:
        """
        根据 fakeid 获取公众号
        
        Args:
            fakeid: 公众号唯一标识
        
        Returns:
            公众号信息字典，不存在返回 None
        """
        fakeid = (fakeid or "").strip()
        if not fakeid:
            return None
        
        cur = self.conn.execute(
            """
            SELECT id, fakeid, nickname, round_head_img, signature, 
                   category, sort_order, enabled, source, added_by_user_id,
                   article_count, last_fetch_at, created_at, updated_at
            FROM featured_wechat_mps
            WHERE fakeid = ?
            """,
            (fakeid,)
        )
        row = cur.fetchone()
        if not row:
            return None
        
        return {
            "id": row[0],
            "fakeid": row[1],
            "nickname": row[2],
            "round_head_img": row[3] or "",
            "signature": row[4] or "",
            "category": row[5] or "general",
            "sort_order": row[6] or 0,
            "enabled": row[7] if row[7] is not None else 1,
            "source": row[8] or "admin",
            "added_by_user_id": row[9],
            "article_count": row[10] or 0,
            "last_fetch_at": row[11] or 0,
            "created_at": row[12] or 0,
            "updated_at": row[13] or 0,
        }
    
    def get_mp_by_nickname(self, nickname: str) -> Optional[Dict[str, Any]]:
        """
        根据昵称获取公众号（用于 AI 推荐时查重）
        
        注意：昵称可能不唯一，返回第一个匹配的记录
        
        Args:
            nickname: 公众号名称
        
        Returns:
            公众号信息字典，不存在返回 None
        """
        nickname = (nickname or "").strip()
        if not nickname:
            return None
        
        cur = self.conn.execute(
            """
            SELECT id, fakeid, nickname, round_head_img, signature, 
                   category, sort_order, enabled, source, added_by_user_id,
                   article_count, last_fetch_at, created_at, updated_at
            FROM featured_wechat_mps
            WHERE nickname = ?
            LIMIT 1
            """,
            (nickname,)
        )
        row = cur.fetchone()
        if not row:
            return None
        
        return {
            "id": row[0],
            "fakeid": row[1],
            "nickname": row[2],
            "round_head_img": row[3] or "",
            "signature": row[4] or "",
            "category": row[5] or "general",
            "sort_order": row[6] or 0,
            "enabled": row[7] if row[7] is not None else 1,
            "source": row[8] or "admin",
            "added_by_user_id": row[9],
            "article_count": row[10] or 0,
            "last_fetch_at": row[11] or 0,
            "created_at": row[12] or 0,
            "updated_at": row[13] or 0,
        }
    
    def list_mps(
        self,
        source: Optional[str] = None,
        enabled: Optional[bool] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """
        列出公众号
        
        Args:
            source: 按来源过滤 ('admin', 'ai_recommend', 'user')
            enabled: 按启用状态过滤
            limit: 返回数量限制
            offset: 偏移量
        
        Returns:
            公众号列表
        """
        query = """
            SELECT id, fakeid, nickname, round_head_img, signature, 
                   category, sort_order, enabled, source, added_by_user_id,
                   article_count, last_fetch_at, created_at, updated_at
            FROM featured_wechat_mps
            WHERE 1=1
        """
        params = []
        
        if source:
            query += " AND source = ?"
            params.append(source)
        
        if enabled is not None:
            query += " AND enabled = ?"
            params.append(1 if enabled else 0)
        
        query += " ORDER BY sort_order ASC, created_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        
        cur = self.conn.execute(query, params)
        rows = cur.fetchall() or []
        
        return [
            {
                "id": row[0],
                "fakeid": row[1],
                "nickname": row[2],
                "round_head_img": row[3] or "",
                "signature": row[4] or "",
                "category": row[5] or "general",
                "sort_order": row[6] or 0,
                "enabled": row[7] if row[7] is not None else 1,
                "source": row[8] or "admin",
                "added_by_user_id": row[9],
                "article_count": row[10] or 0,
                "last_fetch_at": row[11] or 0,
                "created_at": row[12] or 0,
                "updated_at": row[13] or 0,
            }
            for row in rows
        ]
    
    def update_mp(
        self,
        fakeid: str,
        nickname: Optional[str] = None,
        round_head_img: Optional[str] = None,
        signature: Optional[str] = None,
        category: Optional[str] = None,
        enabled: Optional[int] = None,
    ) -> bool:
        """
        更新公众号信息
        
        Args:
            fakeid: 公众号唯一标识
            nickname: 新名称（可选）
            round_head_img: 新头像（可选）
            signature: 新简介（可选）
            category: 新分类（可选）
            enabled: 新启用状态（可选）
        
        Returns:
            是否更新成功
        """
        fakeid = (fakeid or "").strip()
        if not fakeid:
            return False
        
        updates = []
        params = []
        
        if nickname is not None:
            updates.append("nickname = ?")
            params.append(nickname)
        if round_head_img is not None:
            updates.append("round_head_img = ?")
            params.append(round_head_img)
        if signature is not None:
            updates.append("signature = ?")
            params.append(signature)
        if category is not None:
            updates.append("category = ?")
            params.append(category)
        if enabled is not None:
            updates.append("enabled = ?")
            params.append(enabled)
        
        if not updates:
            return False
        
        updates.append("updated_at = ?")
        params.append(int(time.time()))
        params.append(fakeid)
        
        try:
            cur = self.conn.execute(
                f"UPDATE featured_wechat_mps SET {', '.join(updates)} WHERE fakeid = ?",
                params
            )
            self.conn.commit()
            return cur.rowcount > 0
        except Exception:
            self.conn.rollback()
            return False
