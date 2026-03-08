"""
用户投稿 URL API

提供前端聊天窗口的 URL 投稿入口：
1. URL 安全校验（SSRF 防护、黑名单）
2. 重复检查
3. RSS 发现（多路径探测，选最优）
4. 服务器可达性测试（推断 use_socks_proxy）
5. 自动审核评分（Tranco 榜单 + 规则评分，>= 60 直接入库）
6. 分流：自动入库 or 写入 pending_sources 待人工审核
"""

import asyncio
import csv
import hashlib
import ipaddress
import socket
import time
import uuid
import subprocess
from typing import Any, Dict, List, Optional, Set
from urllib.parse import urlparse

import requests
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from hotnews.web.db_online import get_online_db_conn
from pathlib import Path

router = APIRouter(prefix="/api/submit", tags=["user-submit"])

project_root = Path(__file__).parent.parent.parent

# ─── 自动审核阈值 ─────────────────────────────────────────────────────────────
AUTO_APPROVE_THRESHOLD = 60

# ─── 限流（内存简易实现）───────────────────────────────────────────────────
_rate_limit: Dict[str, List[float]] = {}   # ip -> [timestamp, ...]
_host_limit: Dict[str, float] = {}         # "ip:host" -> timestamp
RATE_LIMIT_PER_HOUR = 10
RATE_LIMIT_WINDOW = 3600
HOST_COOLDOWN = 86400  # 同一 IP 对同一 host，24h 内只能提交 1 次

# ─── 内网地址段（SSRF 防护）──────────────────────────────────────────────────
_BLOCKED_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
]

# RSS 探测路径（按优先级排序）
RSS_PROBE_PATHS = [
    "/feed",
    "/feed/all",
    "/rss",
    "/rss.xml",
    "/atom.xml",
    "/feed.xml",
    "/index.xml",
    "/feeds/posts/default",
]

RSS_CONTENT_TYPES = {"application/rss+xml", "application/atom+xml", "text/xml", "application/xml"}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml,application/rss+xml,*/*",
}


def _get_conn():
    return get_online_db_conn(project_root)


def _ensure_pending_sources_table():
    """确保 pending_sources 表存在（幂等）"""
    conn = _get_conn()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS pending_sources (
            id              TEXT PRIMARY KEY,
            submitted_url   TEXT NOT NULL,
            detected_rss    TEXT DEFAULT '',
            feed_title      TEXT DEFAULT '',
            host            TEXT DEFAULT '',
            item_count      INTEGER DEFAULT 0,
            use_socks_proxy INTEGER DEFAULT 0,
            status          TEXT DEFAULT 'pending',
            reject_reason   TEXT DEFAULT '',
            submitter_ip    TEXT DEFAULT '',
            submitted_at    INTEGER NOT NULL,
            reviewed_at     INTEGER DEFAULT 0,
            approved_source_id TEXT DEFAULT ''
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_pending_sources_status ON pending_sources(status)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_pending_sources_host ON pending_sources(host)")
    conn.commit()


# 启动时建表
_ensure_pending_sources_table()


# ─── Tranco 榜单（启动时加载到内存）─────────────────────────────────────────

_tranco_ranks: Dict[str, int] = {}   # domain -> rank (1 = 最高)
_TRANCO_PATH = project_root / "data" / "tranco-top1m.csv"

def _load_tranco():
    global _tranco_ranks
    if _tranco_ranks:
        return
    if not _TRANCO_PATH.exists():
        return
    try:
        with open(_TRANCO_PATH, newline="", encoding="utf-8") as f:
            reader = csv.reader(f)
            for row in reader:
                if len(row) >= 2:
                    try:
                        rank = int(row[0])
                        domain = row[1].strip().lower()
                        _tranco_ranks[domain] = rank
                    except Exception:
                        continue
    except Exception:
        pass

_load_tranco()

# 低质量域名后缀黑名单
_SPAMMY_TLDS: Set[str] = {
    ".xyz", ".top", ".club", ".online", ".site", ".icu",
    ".vip", ".win", ".loan", ".review", ".stream",
}

# ─── 自动审核评分 ─────────────────────────────────────────────────────────────

def _calc_trust_score(
    host: str,
    feed_url: str,
    item_count: int,
    feed_title: str,
    needs_proxy: bool,
) -> tuple[int, Dict[str, int]]:
    """
    计算可信度分数（满分 100），返回 (total_score, breakdown)。

    评分规则：
      +30  Tranco top 10w
      +20  Tranco top 50w
      +10  Tranco top 100w（榜单内但排名较低）
      +20  HTTPS
      +20  条目数 >= 10
      +15  条目数 >= 5（与上面互斥，取高分）
      +15  有明确 feed title
      -20  域名后缀黑名单
      -10  HTTP（非 HTTPS）
      （需要代理不扣分，境外知名站点需要代理是正常的）
    """
    breakdown: Dict[str, int] = {}

    # Tranco 排名
    # 主域名可能带 www，取根域名也检查一遍
    root_host = host.removeprefix("www.")
    rank = _tranco_ranks.get(host) or _tranco_ranks.get(root_host)
    if rank:
        if rank <= 100_000:
            breakdown["tranco_top100k"] = 30
        elif rank <= 500_000:
            breakdown["tranco_top500k"] = 20
        else:
            breakdown["tranco_top1m"] = 10
    
    # HTTPS
    if feed_url.startswith("https://"):
        breakdown["https"] = 20
    else:
        breakdown["no_https"] = -10

    # 条目数
    if item_count >= 10:
        breakdown["items_10plus"] = 20
    elif item_count >= 5:
        breakdown["items_5plus"] = 15

    # Feed title
    if feed_title and feed_title != host:
        breakdown["has_title"] = 15

    # 垃圾域名后缀
    for tld in _SPAMMY_TLDS:
        if host.endswith(tld):
            breakdown["spammy_tld"] = -20
            break

    total = sum(breakdown.values())
    total = max(0, min(100, total))  # 夹在 0~100
    return total, breakdown


# ─── 安全校验 ────────────────────────────────────────────────────────────────

def _validate_url(url: str) -> tuple[bool, str]:
    """
    校验 URL 安全性。
    返回 (ok, reason)
    """
    url = url.strip()
    if not url:
        return False, "empty"

    # 必须有 scheme
    if not url.startswith(("http://", "https://")):
        # 尝试补全
        url = "https://" + url

    try:
        parsed = urlparse(url)
    except Exception:
        return False, "invalid_url"

    if parsed.scheme not in ("http", "https"):
        return False, "invalid_scheme"

    hostname = (parsed.hostname or "").strip()
    if not hostname:
        return False, "invalid_url"

    # 解析 IP，检查是否为内网
    try:
        addrs = socket.getaddrinfo(hostname, None)
        for addr in addrs:
            ip_str = addr[4][0]
            try:
                ip = ipaddress.ip_address(ip_str)
                for net in _BLOCKED_NETWORKS:
                    if ip in net:
                        return False, "private_ip"
            except Exception:
                pass
    except socket.gaierror:
        return False, "dns_failed"

    return True, ""


def _check_rate_limit(ip: str, host: str) -> tuple[bool, str]:
    """检查限流，返回 (allowed, reason)"""
    now = time.time()

    # IP 级别：每小时 10 次
    times = _rate_limit.get(ip, [])
    times = [t for t in times if now - t < RATE_LIMIT_WINDOW]
    if len(times) >= RATE_LIMIT_PER_HOUR:
        return False, "rate_limited"
    times.append(now)
    _rate_limit[ip] = times

    # Host 级别：同 IP + host 24h 内只能 1 次
    key = f"{ip}:{host}"
    last = _host_limit.get(key, 0)
    if now - last < HOST_COOLDOWN:
        return False, "host_cooldown"
    _host_limit[key] = now

    return True, ""


def _check_already_exists(host: str) -> Optional[str]:
    """检查 host 是否已在 rss_sources 中，返回 source name 或 None"""
    conn = _get_conn()
    cur = conn.execute(
        "SELECT name FROM rss_sources WHERE host = ? AND enabled = 1 LIMIT 1",
        (host,)
    )
    row = cur.fetchone()
    return row[0] if row else None


def _check_pending_duplicate(host: str) -> bool:
    """检查 host 是否已在 pending_sources 中（pending 状态）"""
    conn = _get_conn()
    cur = conn.execute(
        "SELECT id FROM pending_sources WHERE host = ? AND status = 'pending' LIMIT 1",
        (host,)
    )
    return bool(cur.fetchone())


# ─── RSS 发现 ────────────────────────────────────────────────────────────────

def _count_rss_items(content: bytes) -> int:
    """简单统计 RSS/Atom 条目数"""
    try:
        import xml.etree.ElementTree as ET
        root = ET.fromstring(content)
        # RSS 2.0
        items = root.findall(".//item")
        if items:
            return len(items)
        # Atom
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        entries = root.findall(".//atom:entry", ns) or root.findall(".//entry")
        return len(entries)
    except Exception:
        return 0


def _get_feed_title(content: bytes) -> str:
    """提取 Feed 标题"""
    try:
        import xml.etree.ElementTree as ET
        root = ET.fromstring(content)
        # RSS 2.0
        ch = root.find("channel")
        if ch is not None:
            t = ch.find("title")
            if t is not None and t.text:
                return t.text.strip()
        # Atom
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        t = root.find("atom:title", ns) or root.find("title")
        if t is not None and t.text:
            return t.text.strip()
    except Exception:
        pass
    return ""


def _is_rss_content(content_type: str, content: bytes) -> bool:
    ct = content_type.lower().split(";")[0].strip()
    if ct in RSS_CONTENT_TYPES:
        return True
    # 检查内容特征
    try:
        head = content[:500].decode("utf-8", errors="ignore").lower()
        return "<rss" in head or "<feed" in head or "<atom" in head
    except Exception:
        return False


def _discover_rss(base_url: str) -> Optional[Dict[str, Any]]:
    """
    多路径探测 RSS，返回条目数最多的那个。
    返回格式：{"url": ..., "title": ..., "item_count": ...}
    """
    parsed = urlparse(base_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"

    candidates = []

    # 1. 先检查网页 HTML 中的 <link rel="alternate"> 标签
    try:
        resp = requests.get(base_url, headers=HEADERS, timeout=8, allow_redirects=True)
        if resp.status_code == 200:
            import re
            links = re.findall(
                r'<link[^>]+type=["\']application/(?:rss|atom)\+xml["\'][^>]*href=["\']([^"\']+)["\']',
                resp.text,
                re.IGNORECASE,
            )
            for href in links:
                full = href if href.startswith("http") else origin + href
                candidates.append(full)
    except Exception:
        pass

    # 2. 加上常见路径
    for path in RSS_PROBE_PATHS:
        candidates.append(origin + path)

    # 3. 去重，保持顺序
    seen = set()
    unique_candidates = []
    for c in candidates:
        if c not in seen:
            seen.add(c)
            unique_candidates.append(c)

    # 4. 探测每个候选，找条目最多的
    best = None
    for url in unique_candidates[:12]:  # 最多探测 12 个
        try:
            r = requests.get(url, headers=HEADERS, timeout=6, allow_redirects=True)
            if r.status_code != 200:
                continue
            ct = r.headers.get("Content-Type", "")
            if not _is_rss_content(ct, r.content):
                continue
            count = _count_rss_items(r.content)
            title = _get_feed_title(r.content)
            if best is None or count > best["item_count"]:
                best = {
                    "url": r.url,  # 跟随重定向后的真实 URL
                    "title": title,
                    "item_count": count,
                }
        except Exception:
            continue

    return best


# ─── 服务器可达性检测 ─────────────────────────────────────────────────────────

async def _check_server_reachability(feed_url: str) -> bool:
    """
    在服务器本地测试能否访问 feed_url。
    返回 True = 需要代理；False = 直连 OK。
    """
    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(
                subprocess.run,
                [
                    "ssh", "-p", "52222", "-o", "BatchMode=yes",
                    "-o", "ConnectTimeout=5",
                    "root@120.77.222.205",
                    f"curl -s -o /dev/null -w '%{{http_code}}' -L --max-time 8 '{feed_url}' -A 'Mozilla/5.0'",
                ],
                capture_output=True,
                text=True,
                timeout=20,
            ),
            timeout=25,
        )
        code = (result.stdout or "").strip()
        # 200/301/302 = 直连 OK；403/000/其他 = 需要代理
        return code not in ("200", "301", "302", "304")
    except Exception:
        # SSH 检测失败时，乐观地认为直连可达（管理员可批准后手动调整）
        return False


# ─── API 端点 ─────────────────────────────────────────────────────────────────

class SubmitRequest(BaseModel):
    url: str


from fastapi import BackgroundTasks

@router.post("/url")
async def submit_url(req: SubmitRequest, request: Request, background_tasks: BackgroundTasks):
    """用户提交网站 URL"""
    raw_url = (req.url or "").strip()

    # 补全 scheme
    if raw_url and not raw_url.startswith(("http://", "https://")):
        raw_url = "https://" + raw_url

    # 获取客户端 IP（脱敏：只保留前 3 段）
    client_ip = request.client.host if request.client else "unknown"
    ip_parts = client_ip.split(".")
    anon_ip = ".".join(ip_parts[:3]) + ".*" if len(ip_parts) == 4 else client_ip

    # ① URL 安全校验
    ok, reason = _validate_url(raw_url)
    if not ok:
        reason_msg = {
            "empty": "请输入网站地址",
            "invalid_url": "地址格式不正确，请检查后重试",
            "invalid_scheme": "请使用 http:// 或 https:// 地址",
            "private_ip": "不支持内网地址",
            "dns_failed": "无法解析该域名，请检查地址",
        }.get(reason, "地址格式不正确")
        return JSONResponse({"ok": False, "status": "rejected", "reason": reason, "message": reason_msg})

    parsed = urlparse(raw_url)
    host = (parsed.hostname or "").lower()

    # ② 限流检查
    allowed, limit_reason = _check_rate_limit(client_ip, host)
    if not allowed:
        msg = {
            "rate_limited": "提交太频繁了，请稍后再试（每小时最多 10 次）",
            "host_cooldown": "你已经提交过这个网站，请等待审核（24 小时内同一网站只能提交 1 次）",
        }.get(limit_reason, "请稍后再试")
        return JSONResponse({"ok": False, "status": "rate_limited", "message": msg})

    # ③ 已收录检查
    existing_name = _check_already_exists(host)
    if existing_name:
        return JSONResponse({
            "ok": False,
            "status": "already_exists",
            "message": f"这个网站已经在收录列表中了（{existing_name}）🎉",
        })

    # ④ 待审重复检查
    if _check_pending_duplicate(host):
        return JSONResponse({
            "ok": False,
            "status": "pending_duplicate",
            "message": "这个网站已经在审核队列中了，请耐心等待管理员处理",
        })

    # 先保存一条 `detecting` 状态的记录，立即返回让前端不阻塞
    pending_id = "pending_" + str(uuid.uuid4())[:8]
    now = int(time.time())
    conn = _get_conn()
    conn.execute(
        """
        INSERT INTO pending_sources
            (id, submitted_url, host, status, reject_reason, submitter_ip, submitted_at)
        VALUES (?, ?, ?, 'detecting', '', ?, ?)
        """,
        (pending_id, raw_url, host, anon_ip, now),
    )
    conn.commit()

    # 将耗时的 RSS 探测和连通性测试放入后台执行
    background_tasks.add_task(_process_submission_background, pending_id, raw_url, host)

    return JSONResponse({
        "ok": True,
        "status": "detecting",
        "message": "您的提交已收录，审核后会显示在订阅列表中，感谢您的推荐！",
    })

async def _process_submission_background(pending_id: str, raw_url: str, host: str):
    """后台处理 RSS 探测、连通性检查及信任分计算，并更新数据库状态"""
    try:
        # ⑤ RSS 发现（在线程池中执行，避免阻塞事件循环）
        feed_info = await asyncio.to_thread(_discover_rss, raw_url)
        
        conn = _get_conn()
        now = int(time.time())

        if not feed_info:
            conn.execute(
                "UPDATE pending_sources SET status='rejected', reject_reason=?, reviewed_at=? WHERE id=?",
                ("未找到 RSS/Atom 订阅源", now, pending_id)
            )
            conn.commit()
            return
            
        feed_url = feed_info["url"]
        feed_title = feed_info["title"] or host
        item_count = feed_info["item_count"]

        # ⑥ 服务器可达性检测
        needs_proxy = await _check_server_reachability(feed_url)

        # ⑦ 自动审核评分
        score, breakdown = _calc_trust_score(
            host=host,
            feed_url=feed_url,
            item_count=item_count,
            feed_title=feed_title,
            needs_proxy=needs_proxy,
        )
        score_note = f"系统参考评分: {score}"
        
        # 统统进人工审核队列
        conn.execute(
            """
            UPDATE pending_sources 
            SET detected_rss = ?, feed_title = ?, item_count = ?, 
                use_socks_proxy = ?, status = 'pending', reject_reason = ?
            WHERE id = ?
            """,
            (feed_url, feed_title, item_count, 1 if needs_proxy else 0, score_note, pending_id)
        )
        conn.commit()
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        try:
            conn = _get_conn()
            conn.execute(
                "UPDATE pending_sources SET status='rejected', reject_reason=?, reviewed_at=? WHERE id=?",
                ("后台检测异常: " + str(e), int(time.time()), pending_id)
            )
            conn.commit()
        except:
            pass


# ─── 管理员待审接口 ────────────────────────────────────────────────────────────

from fastapi import Depends

admin_router = APIRouter(prefix="/api/admin/pending-sources", tags=["admin-pending"])


def _require_admin_from_app(request: Request):
    return request.app.state.require_admin(request)


@admin_router.get("")
async def list_pending(request: Request, status: str = "pending", _=Depends(_require_admin_from_app)):
    conn = _get_conn()
    cur = conn.execute(
        """
        SELECT id, submitted_url, detected_rss, feed_title, host,
               item_count, use_socks_proxy, status, reject_reason,
               submitter_ip, submitted_at, reviewed_at, approved_source_id
        FROM pending_sources
        WHERE status = ?
        ORDER BY submitted_at DESC
        """,
        (status,),
    )
    rows = cur.fetchall() or []
    items = [
        {
            "id": r[0],
            "submitted_url": r[1],
            "detected_rss": r[2],
            "feed_title": r[3],
            "host": r[4],
            "item_count": r[5],
            "use_socks_proxy": r[6],
            "status": r[7],
            "reject_reason": r[8],
            "submitter_ip": r[9],
            "submitted_at": r[10],
            "reviewed_at": r[11],
            "approved_source_id": r[12],
        }
        for r in rows
    ]
    # 统计各状态数量（用于 Tab 徽标）
    cur2 = conn.execute("SELECT status, COUNT(*) FROM pending_sources GROUP BY status")
    counts = {r[0]: r[1] for r in cur2.fetchall()}
    return JSONResponse({"ok": True, "total": len(items), "items": items, "counts": counts})


class ApproveRequest(BaseModel):
    name: str = ""
    category: str = ""
    language: str = ""
    country: str = ""


@admin_router.post("/{pending_id}/approve")
async def approve_pending(pending_id: str, body: ApproveRequest, request: Request, _=Depends(_require_admin_from_app)):
    import hashlib
    conn = _get_conn()
    cur = conn.execute(
        "SELECT submitted_url, detected_rss, feed_title, host, item_count, use_socks_proxy FROM pending_sources WHERE id = ? AND status = 'pending'",
        (pending_id,),
    )
    row = cur.fetchone()
    if not row:
        return JSONResponse({"ok": False, "error": "Not found or already reviewed"}, status_code=404)

    submitted_url, detected_rss, feed_title, host, item_count, use_socks = row
    feed_url = detected_rss or submitted_url
    name = body.name.strip() or feed_title or host

    # 写入 rss_sources
    source_id = "rss_" + hashlib.md5(feed_url.encode()).hexdigest()[:8]
    now = int(time.time())
    conn.execute(
        """
        INSERT OR IGNORE INTO rss_sources
            (id, name, url, host, category, cadence, enabled,
             use_socks_proxy, language, country, created_at, updated_at, added_at)
        VALUES (?, ?, ?, ?, ?, 'P4', 1, ?, ?, ?, ?, ?, ?)
        """,
        (source_id, name, feed_url, host,
         body.category, use_socks,
         body.language, body.country,
         now, now, now),
    )

    # 更新 pending 状态
    conn.execute(
        "UPDATE pending_sources SET status='approved', reviewed_at=?, approved_source_id=? WHERE id=?",
        (now, source_id, pending_id),
    )
    conn.commit()
    return JSONResponse({"ok": True, "source_id": source_id, "message": "已收录"})


class RejectRequest(BaseModel):
    reason: str = ""


@admin_router.post("/{pending_id}/reject")
async def reject_pending(pending_id: str, body: RejectRequest, request: Request, _=Depends(_require_admin_from_app)):
    conn = _get_conn()
    now = int(time.time())
    conn.execute(
        "UPDATE pending_sources SET status='rejected', reject_reason=?, reviewed_at=? WHERE id=? AND status='pending'",
        (body.reason, now, pending_id),
    )
    conn.commit()
    return JSONResponse({"ok": True, "message": "已拒绝"})
