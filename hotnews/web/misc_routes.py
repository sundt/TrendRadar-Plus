import asyncio
import json
import os
from datetime import date
from pathlib import Path

import requests
from fastapi import APIRouter
from fastapi.responses import JSONResponse, Response, PlainTextResponse, RedirectResponse


router = APIRouter()


@router.get("/api/changelog")
async def api_changelog():
    """返回 CHANGELOG.md 内容"""
    # 优先从 hotnews/ 目录内读取（目录级 volume mount，git pull 后自动同步）
    # 避免 Docker 单文件 bind mount 的 inode 追踪问题
    candidates = [
        Path("/app/hotnews/CHANGELOG.md"),   # Docker: 部署脚本 cp 到 hotnews/ 内
        Path("/app/CHANGELOG.md"),            # Docker: 单文件挂载 (fallback)
        Path(__file__).parent.parent.parent.parent / "CHANGELOG.md",  # 本地开发
    ]
    for p in candidates:
        if p.is_file():
            return PlainTextResponse(content=p.read_text(encoding="utf-8"))
    return PlainTextResponse(content="# 📋 更新日志\n\n暂无更新记录。", status_code=200)


@router.get("/extension/install")
async def extension_install_redirect():
    """Redirect to extension installation guide page"""
    return RedirectResponse(url="/static/extension-install.html", status_code=302)


class UnicodeJSONResponse(Response):
    media_type = "application/json"

    def render(self, content) -> bytes:
        return json.dumps(
            content,
            ensure_ascii=False,
            allow_nan=False,
            indent=None,
            separators=(",", ":"),
        ).encode("utf-8")


@router.get("/MP_verify_{token}.txt")
async def wechat_mp_verify(token: str):
    """微信公众号域名验证文件"""
    return PlainTextResponse(content=token)


@router.get("/googlee986168f72b86e7c.html")
async def google_site_verify():
    """Google Search Console 域名验证文件"""
    return PlainTextResponse(content="google-site-verification: googlee986168f72b86e7c.html")


@router.get("/api/nba-today")
async def api_nba_today():
    today = date.today().strftime("%Y-%m-%d")
    url = f"https://matchweb.sports.qq.com/kbs/list?columnId=100000&startTime={today}&endTime={today}"

    def _fetch():
        resp = requests.get(
            url,
            headers={
                "Referer": "https://kbs.sports.qq.com/",
                "User-Agent": "Mozilla/5.0",
                "Accept": "application/json, text/plain, */*",
            },
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

    try:
        payload = await asyncio.to_thread(_fetch)
    except Exception as e:
        return JSONResponse(content={"detail": f"Failed to fetch Tencent NBA data: {e}"}, status_code=502)

    from hotnews.kernel.providers.tencent_nba import _extract_tencent_nba_matches

    games = _extract_tencent_nba_matches(payload)
    return UnicodeJSONResponse(content={"date": today, "games": games})


@router.get("/api/export/rss-sources.csv")
async def export_rss_sources_csv():
    """导出所有启用的 RSS 订阅源为 CSV 文件，方便用户导入到自己的 RSS 阅读器"""
    import csv
    import io
    from hotnews.web.db_online import get_online_db_conn

    project_root = Path(os.environ.get("PROJECT_ROOT", Path(__file__).parent.parent.parent))
    conn = get_online_db_conn(project_root)

    cur = conn.execute(
        """
        SELECT name, url, category, description, tags, language, country, feed_type
        FROM rss_sources
        WHERE enabled = 1 AND source_type = 'rss'
        ORDER BY category, name
        """
    )
    rows = cur.fetchall() or []

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["name", "url", "category", "description", "tags", "language", "country", "feed_type"])
    for r in rows:
        writer.writerow([
            str(r[0] or "").strip(),
            str(r[1] or "").strip(),
            str(r[2] or "").strip(),
            str(r[3] or "").strip(),
            str(r[4] or "").strip(),
            str(r[5] or "").strip(),
            str(r[6] or "").strip(),
            str(r[7] or "").strip(),
        ])

    csv_content = buf.getvalue()
    # Add UTF-8 BOM for Excel compatibility
    bom = "\ufeff"
    return Response(
        content=(bom + csv_content).encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": "attachment; filename=hotnews-rss-sources.csv",
            "Cache-Control": "public, max-age=3600",
        },
    )
