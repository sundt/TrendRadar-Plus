"""
Cross-Source Article Deduplication Engine

跨数据源文章去重引擎。以标题匹配为主策略、URL 匹配为辅策略，
在文章入库时和批量扫描时识别重复文章。

策略优先级：
  1. title_fingerprint 精确匹配 (title_exact)
  2. title 模糊匹配 (title_fuzzy / title_fuzzy_cross)
  3. url_normalized 精确匹配 (url_exact)
  4. content fingerprint 精确匹配 (content_hash)
"""

import hashlib
import logging
import re
import time
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import parse_qsl, urlencode, urlparse

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# TitleNormalizer
# ---------------------------------------------------------------------------

class TitleNormalizer:
    """标题归一化 + 指纹生成 + 相似度计算"""

    STRIP_PREFIXES = [
        "【快讯】", "【独家】", "【重磅】", "【深度】", "【突发】",
        "【关注】", "【热点】", "【头条】",
        "[Breaking]", "[Exclusive]", "[Update]", "[BREAKING]",
        "原创", "独家", "快讯", "突发", "重磅", "深度",
    ]

    STRIP_SUFFIX_RE = re.compile(
        r'[（\(](?:来源|转自|via|图源|文|编辑)[：:]?\s*[^）\)]+[）\)]$'
    )

    # 纯日期/数字标题检测
    GENERIC_TITLE_RE = re.compile(
        r'^[\d\s\-/年月日:：.]+$'
    )

    @staticmethod
    def normalize(title: str) -> str:
        t = (title or "").strip()
        if not t:
            return ""
        for prefix in TitleNormalizer.STRIP_PREFIXES:
            if t.startswith(prefix):
                t = t[len(prefix):].strip()
        t = TitleNormalizer.STRIP_SUFFIX_RE.sub("", t).strip()
        # 去标点、空格，小写化（保留中文和字母数字）
        return re.sub(r'[^\w\u4e00-\u9fff]', '', t.lower())

    @staticmethod
    def fingerprint(title: str) -> str:
        normalized = TitleNormalizer.normalize(title)
        if not normalized:
            return ""
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()

    @staticmethod
    def similarity(t1: str, t2: str) -> float:
        n1 = TitleNormalizer.normalize(t1)
        n2 = TitleNormalizer.normalize(t2)
        if not n1 or not n2:
            return 0.0
        if n1 == n2:
            return 1.0
        # 长度差异过大直接排除
        if abs(len(n1) - len(n2)) > max(len(n1), len(n2)) * 0.3:
            return 0.0
        # 使用 SequenceMatcher 做序列级相似度（考虑顺序）
        from difflib import SequenceMatcher
        return SequenceMatcher(None, n1, n2).ratio()

    @staticmethod
    def is_eligible_for_fuzzy(title: str) -> bool:
        """标题是否适合做模糊匹配（排除过短/纯数字等）"""
        normalized = TitleNormalizer.normalize(title)
        if not normalized:
            return False
        # 检测语言：含中文字符视为中文标题
        has_cjk = any('\u4e00' <= c <= '\u9fff' for c in normalized)
        if has_cjk:
            return len(normalized) >= 10
        else:
            return len(normalized) >= 20

    @staticmethod
    def is_generic_title(title: str) -> bool:
        """是否为纯日期/数字等通用标题"""
        return bool(TitleNormalizer.GENERIC_TITLE_RE.match((title or "").strip()))


# ---------------------------------------------------------------------------
# URLNormalizer
# ---------------------------------------------------------------------------

class URLNormalizer:
    """URL 归一化（含微信特殊处理）"""

    TRACKING_PARAMS = {
        "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
        "from", "isappinstalled", "scene", "nsukey", "wxshare_count",
        "spm", "src", "source", "ref", "referer", "share", "share_token",
    }

    WECHAT_SHORT_RE = re.compile(r'^/s/([A-Za-z0-9_-]+)$')

    @staticmethod
    def normalize(url: str) -> str:
        u = (url or "").strip()
        if not u:
            return ""
        try:
            parsed = urlparse(u)
        except Exception:
            return u

        netloc = (parsed.netloc or "").lower()
        path = parsed.path or ""

        # 微信 URL 特殊处理
        if netloc == "mp.weixin.qq.com":
            return URLNormalizer._normalize_wechat(parsed)

        # 通用归一化
        path = path.rstrip("/")
        try:
            params = parse_qsl(parsed.query or "", keep_blank_values=True)
            filtered = [
                (k, v) for k, v in params
                if k.lower() not in URLNormalizer.TRACKING_PARAMS
            ]
            filtered.sort(key=lambda x: x[0])
            query = urlencode(filtered, doseq=True)
        except Exception:
            query = ""
        return f"{netloc}{path}{'?' + query if query else ''}"

    @staticmethod
    def _normalize_wechat(parsed) -> str:
        path = parsed.path or ""

        # 永久短链: /s/<hash>
        m = URLNormalizer.WECHAT_SHORT_RE.match(path)
        if m:
            return f"wechat:short:{m.group(1)}"

        # 临时链接: /s?__biz=xxx&mid=xxx&idx=xxx
        params = dict(parse_qsl(parsed.query or ""))
        biz = params.get("__biz", "")
        mid = params.get("mid", "")
        idx = params.get("idx", "1")
        if biz and mid:
            return f"wechat:biz:{biz}:{mid}:{idx}"

        return f"mp.weixin.qq.com{path}"


# ---------------------------------------------------------------------------
# ContentNormalizer
# ---------------------------------------------------------------------------

class ContentNormalizer:
    """文章内容指纹生成"""

    HTML_TAG_RE = re.compile(r'<[^>]+>')
    WHITESPACE_RE = re.compile(r'\s+')

    @staticmethod
    def fingerprint(text: str) -> str:
        if not text:
            return ""
        clean = ContentNormalizer.HTML_TAG_RE.sub("", text)
        clean = ContentNormalizer.WHITESPACE_RE.sub(" ", clean).strip()
        if len(clean) < 50:
            return ""
        snippet = clean[:500]
        return hashlib.sha256(snippet.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# CanonicalSelector
# ---------------------------------------------------------------------------

class CanonicalSelector:
    """从一组重复文章中选出 canonical（主文章）"""

    @staticmethod
    def select(articles: List[Dict]) -> Dict:
        """优先级: published_at 最早 → description 最长 → source_id 字典序最小"""
        return min(articles, key=lambda a: (
            a.get("published_at", 0) or float("inf"),
            -len(a.get("description", "") or ""),
            a.get("source_id", ""),
        ))


# ---------------------------------------------------------------------------
# DedupEngine
# ---------------------------------------------------------------------------

class DedupEngine:
    """跨源文章去重引擎"""

    # 同 Source_Group 内模糊匹配阈值
    THRESHOLD_INTRA_GROUP = 0.85
    # 跨 Source_Group 模糊匹配阈值
    THRESHOLD_CROSS_GROUP = 0.90
    # 标题精确匹配时间窗口（秒）
    TITLE_EXACT_WINDOW = 3 * 86400   # 3 天
    # URL 精确匹配时间窗口（秒）
    URL_EXACT_WINDOW = 7 * 86400     # 7 天
    # 模糊匹配时间窗口（秒）
    FUZZY_WINDOW = 3 * 86400         # 3 天
    # 同标题最大时间差（超过视为不同文章）
    MAX_TIME_DIFF = 72 * 3600        # 72 小时

    def __init__(self, conn):
        self.conn = conn

    # ------------------------------------------------------------------
    # Source Group helpers
    # ------------------------------------------------------------------

    def _get_group_sources(self, source_id: str) -> List[str]:
        """获取与 source_id 同组的所有源 ID（不含自身）"""
        try:
            row = self.conn.execute(
                "SELECT group_id FROM source_group_members WHERE source_id = ?",
                (source_id,),
            ).fetchone()
            if not row:
                return []
            rows = self.conn.execute(
                "SELECT source_id FROM source_group_members WHERE group_id = ? AND source_id != ?",
                (row[0], source_id),
            ).fetchall()
            return [str(r[0]) for r in rows]
        except Exception:
            return []

    # ------------------------------------------------------------------
    # Fingerprint helpers
    # ------------------------------------------------------------------

    def compute_fingerprints(
        self, title: str, url: str, description: str = ""
    ) -> Tuple[str, str, str]:
        """计算标题指纹、归一化 URL、内容指纹"""
        return (
            TitleNormalizer.fingerprint(title),
            URLNormalizer.normalize(url),
            ContentNormalizer.fingerprint(description),
        )

    def fill_fingerprints(
        self, source_id: str, dedup_key: str, title: str, url: str
    ) -> None:
        """为单条 rss_entries 填充 title_fingerprint 和 url_normalized"""
        tfp = TitleNormalizer.fingerprint(title) or "_empty_"
        unorm = URLNormalizer.normalize(url) or "_empty_"
        try:
            self.conn.execute(
                """UPDATE rss_entries
                   SET title_fingerprint = ?, url_normalized = ?
                   WHERE source_id = ? AND dedup_key = ?
                     AND (title_fingerprint = '' OR url_normalized = '')""",
                (tfp, unorm, source_id, dedup_key),
            )
        except Exception as e:
            logger.debug("fill_fingerprints error: %s", e)

    # ------------------------------------------------------------------
    # Core: check_and_handle (入库时单篇检查)
    # ------------------------------------------------------------------

    def check_and_handle(
        self,
        source_id: str,
        dedup_key: str,
        title: str,
        url: str,
        published_at: int,
        description: str = "",
        dry_run: bool = True,
    ) -> Optional[Dict]:
        """检查单篇文章是否与已有文章重复。

        Returns:
            匹配信息 dict 或 None（无重复）
        """
        now_ts = int(time.time())
        tfp = TitleNormalizer.fingerprint(title)
        unorm = URLNormalizer.normalize(url)

        # 填充指纹列
        self.fill_fingerprints(source_id, dedup_key, title, url)

        # Step 1: title_fingerprint 精确匹配（跨源，3 天内）
        if tfp:
            match = self._match_title_exact(
                source_id, dedup_key, tfp, published_at
            )
            if match:
                return self._record_match(
                    source_id, dedup_key, title, url, published_at,
                    match, "title_exact", 1.0, now_ts, dry_run,
                )

        # Step 2: 同 Source_Group 模糊标题匹配
        if tfp and TitleNormalizer.is_eligible_for_fuzzy(title):
            match = self._match_title_fuzzy_intra_group(
                source_id, dedup_key, title, published_at
            )
            if match:
                return self._record_match(
                    source_id, dedup_key, title, url, published_at,
                    match["article"], "title_fuzzy", match["score"],
                    now_ts, dry_run,
                )

        # Step 2.5: 跨源模糊标题匹配（阈值 0.90）
        if TitleNormalizer.is_eligible_for_fuzzy(title):
            match = self._match_title_fuzzy_cross(
                source_id, dedup_key, title, published_at
            )
            if match:
                return self._record_match(
                    source_id, dedup_key, title, url, published_at,
                    match["article"], "title_fuzzy_cross", match["score"],
                    now_ts, dry_run,
                )

        # Step 3: url_normalized 精确匹配（跨源，7 天内）
        if unorm:
            match = self._match_url_exact(
                source_id, dedup_key, unorm, published_at
            )
            if match:
                return self._record_match(
                    source_id, dedup_key, title, url, published_at,
                    match, "url_exact", 1.0, now_ts, dry_run,
                )

        return None

    # ------------------------------------------------------------------
    # Matching helpers
    # ------------------------------------------------------------------

    def _match_title_exact(
        self, source_id: str, dedup_key: str, tfp: str, published_at: int
    ) -> Optional[Dict]:
        """标题指纹精确匹配（跨源，时间窗口内）"""
        cutoff = (published_at or int(time.time())) - self.TITLE_EXACT_WINDOW
        try:
            row = self.conn.execute(
                """SELECT source_id, dedup_key, title, url, published_at,
                          COALESCE(description, '') as description
                   FROM rss_entries
                   WHERE title_fingerprint = ?
                     AND source_id != ?
                     AND published_at >= ?
                   ORDER BY published_at ASC
                   LIMIT 1""",
                (tfp, source_id, cutoff),
            ).fetchone()
        except Exception:
            return None
        if not row:
            return None
        # 检查时间差
        other_pub = int(row[4] or 0)
        if published_at and other_pub and abs(published_at - other_pub) > self.MAX_TIME_DIFF:
            return None
        return {
            "source_id": str(row[0]),
            "dedup_key": str(row[1]),
            "title": str(row[2] or ""),
            "url": str(row[3] or ""),
            "published_at": other_pub,
            "description": str(row[5] or ""),
        }

    def _match_title_fuzzy_intra_group(
        self, source_id: str, dedup_key: str, title: str, published_at: int
    ) -> Optional[Dict]:
        """同 Source_Group 内模糊标题匹配"""
        group_sources = self._get_group_sources(source_id)
        if not group_sources:
            return None
        cutoff = (published_at or int(time.time())) - self.FUZZY_WINDOW
        placeholders = ",".join("?" * len(group_sources))
        try:
            rows = self.conn.execute(
                f"""SELECT source_id, dedup_key, title, url, published_at,
                           COALESCE(description, '') as description
                    FROM rss_entries
                    WHERE source_id IN ({placeholders})
                      AND published_at >= ?
                    ORDER BY published_at ASC
                    LIMIT 200""",
                (*group_sources, cutoff),
            ).fetchall()
        except Exception:
            return None

        best_score = 0.0
        best_article = None
        for r in rows:
            other_title = str(r[2] or "")
            other_pub = int(r[4] or 0)
            if published_at and other_pub and abs(published_at - other_pub) > self.MAX_TIME_DIFF:
                continue
            score = TitleNormalizer.similarity(title, other_title)
            if score >= self.THRESHOLD_INTRA_GROUP and score > best_score:
                best_score = score
                best_article = {
                    "source_id": str(r[0]),
                    "dedup_key": str(r[1]),
                    "title": other_title,
                    "url": str(r[3] or ""),
                    "published_at": other_pub,
                    "description": str(r[5] or ""),
                }
        if best_article:
            return {"article": best_article, "score": best_score}
        return None

    def _match_title_fuzzy_cross(
        self, source_id: str, dedup_key: str, title: str, published_at: int
    ) -> Optional[Dict]:
        """跨源模糊标题匹配（阈值 0.90，3 天窗口）

        用归一化标题长度做预筛选，只拉长度接近的候选文章，控制比对量。
        """
        cutoff = (published_at or int(time.time())) - self.FUZZY_WINDOW
        normalized = TitleNormalizer.normalize(title)
        if not normalized:
            return None
        nlen = len(normalized)
        # 长度差 30% 以内才有可能达到 0.90 相似度
        min_len = int(nlen * 0.7)
        max_len = int(nlen * 1.3)

        try:
            rows = self.conn.execute(
                """SELECT source_id, dedup_key, title, url, published_at,
                          COALESCE(description, '') as description
                   FROM rss_entries
                   WHERE source_id != ?
                     AND published_at >= ?
                     AND LENGTH(title) BETWEEN ? AND ?
                   ORDER BY published_at DESC
                   LIMIT 300""",
                (source_id, cutoff, min_len, max_len),
            ).fetchall()
        except Exception:
            return None

        best_score = 0.0
        best_article = None
        for r in rows:
            other_title = str(r[2] or "")
            other_pub = int(r[4] or 0)
            if published_at and other_pub and abs(published_at - other_pub) > self.MAX_TIME_DIFF:
                continue
            score = TitleNormalizer.similarity(title, other_title)
            if score >= self.THRESHOLD_CROSS_GROUP and score > best_score:
                best_score = score
                best_article = {
                    "source_id": str(r[0]),
                    "dedup_key": str(r[1]),
                    "title": other_title,
                    "url": str(r[3] or ""),
                    "published_at": other_pub,
                    "description": str(r[5] or ""),
                }
        if best_article:
            return {"article": best_article, "score": best_score}
        return None

    def _match_url_exact(
        self, source_id: str, dedup_key: str, unorm: str, published_at: int
    ) -> Optional[Dict]:
        """URL 归一化精确匹配（跨源，时间窗口内）"""
        cutoff = (published_at or int(time.time())) - self.URL_EXACT_WINDOW
        try:
            row = self.conn.execute(
                """SELECT source_id, dedup_key, title, url, published_at,
                          COALESCE(description, '') as description
                   FROM rss_entries
                   WHERE url_normalized = ?
                     AND source_id != ?
                     AND published_at >= ?
                   ORDER BY published_at ASC
                   LIMIT 1""",
                (unorm, source_id, cutoff),
            ).fetchone()
        except Exception:
            return None
        if not row:
            return None
        return {
            "source_id": str(row[0]),
            "dedup_key": str(row[1]),
            "title": str(row[2] or ""),
            "url": str(row[3] or ""),
            "published_at": int(row[4] or 0),
            "description": str(row[5] or ""),
        }

    # ------------------------------------------------------------------
    # Record match
    # ------------------------------------------------------------------

    def _record_match(
        self,
        new_source_id: str,
        new_dedup_key: str,
        new_title: str,
        new_url: str,
        new_published_at: int,
        existing: Dict,
        match_type: str,
        similarity_score: float,
        now_ts: int,
        dry_run: bool,
    ) -> Dict:
        """选 canonical 并记录去重关系"""
        new_art = {
            "source_id": new_source_id,
            "dedup_key": new_dedup_key,
            "title": new_title,
            "url": new_url,
            "published_at": new_published_at,
            "description": "",
        }
        canonical = CanonicalSelector.select([new_art, existing])
        if canonical["source_id"] == new_source_id and canonical["dedup_key"] == new_dedup_key:
            dup = existing
        else:
            dup = new_art

        # 写入 cross_source_dedup
        try:
            self.conn.execute(
                """INSERT OR IGNORE INTO cross_source_dedup
                   (canonical_source_id, canonical_dedup_key,
                    dup_source_id, dup_dedup_key,
                    match_type, similarity_score,
                    dup_title, dup_url, dup_published_at,
                    detected_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    canonical["source_id"], canonical["dedup_key"],
                    dup["source_id"], dup["dedup_key"],
                    match_type, similarity_score,
                    dup.get("title", ""), dup.get("url", ""),
                    dup.get("published_at", 0),
                    now_ts,
                ),
            )
            self.conn.commit()
        except Exception as e:
            logger.warning("dedup record error: %s", e)

        result = {
            "match_type": match_type,
            "similarity_score": similarity_score,
            "canonical": canonical,
            "duplicate": dup,
        }

        if not dry_run:
            self._physical_delete(canonical, dup, now_ts)

        logger.info(
            "dedup.%s canonical=(%s,%s) dup=(%s,%s) score=%.2f dry_run=%s",
            match_type,
            canonical["source_id"], canonical["dedup_key"][:16],
            dup["source_id"], dup["dedup_key"][:16],
            similarity_score, dry_run,
        )
        return result


    # ------------------------------------------------------------------
    # Physical deletion (Phase 5)
    # ------------------------------------------------------------------

    def _physical_delete(self, canonical: Dict, dup: Dict, now_ts: int) -> None:
        """物理删除重复文章（迁移标签/摘要 → 删除）"""
        c_sid, c_dk = canonical["source_id"], canonical["dedup_key"]
        d_sid, d_dk = dup["source_id"], dup["dedup_key"]

        try:
            # 1. 迁移标签
            self.conn.execute(
                """INSERT OR IGNORE INTO rss_entry_tags
                   (source_id, dedup_key, tag_id, confidence, source, created_at)
                   SELECT ?, ?, tag_id, confidence, source, created_at
                   FROM rss_entry_tags
                   WHERE source_id = ? AND dedup_key = ?""",
                (c_sid, c_dk, d_sid, d_dk),
            )

            # 2. 迁移 AI 标注
            existing_label = self.conn.execute(
                "SELECT 1 FROM rss_entry_ai_labels WHERE source_id = ? AND dedup_key = ? LIMIT 1",
                (c_sid, c_dk),
            ).fetchone()
            if not existing_label:
                self.conn.execute(
                    """INSERT OR IGNORE INTO rss_entry_ai_labels
                       (source_id, dedup_key, url, domain, title, category,
                        action, score, confidence, reason, provider, model,
                        prompt_version, labeled_at, error)
                       SELECT ?, ?, url, domain, title, category,
                              action, score, confidence, reason, provider, model,
                              prompt_version, labeled_at, error
                       FROM rss_entry_ai_labels
                       WHERE source_id = ? AND dedup_key = ?""",
                    (c_sid, c_dk, d_sid, d_dk),
                )

            # 3. 迁移摘要 (article_summaries 以 url_hash 为主键)
            self._migrate_summary(canonical, dup)

            # 4. 删除 dup 的标签关联
            self.conn.execute(
                "DELETE FROM rss_entry_tags WHERE source_id = ? AND dedup_key = ?",
                (d_sid, d_dk),
            )

            # 5. 删除 dup 的 AI 标注
            self.conn.execute(
                "DELETE FROM rss_entry_ai_labels WHERE source_id = ? AND dedup_key = ?",
                (d_sid, d_dk),
            )

            # 6. 物理删除文章
            self.conn.execute(
                "DELETE FROM rss_entries WHERE source_id = ? AND dedup_key = ?",
                (d_sid, d_dk),
            )

            # 7. 更新 cross_source_dedup.deleted_at
            self.conn.execute(
                """UPDATE cross_source_dedup SET deleted_at = ?
                   WHERE dup_source_id = ? AND dup_dedup_key = ? AND deleted_at = 0""",
                (now_ts, d_sid, d_dk),
            )

            self.conn.commit()

            logger.info(
                "dedup.deleted dup=(%s,%s) title=%s",
                d_sid, d_dk[:16], dup.get("title", "")[:60],
            )
        except Exception as e:
            logger.error("dedup.delete_error dup=(%s,%s): %s", d_sid, d_dk[:16], e)
            try:
                self.conn.rollback()
            except Exception:
                pass

    def _migrate_summary(self, canonical: Dict, dup: Dict) -> None:
        """迁移摘要：如果 canonical 无摘要但 dup 有，迁移过去"""
        c_url_hash = hashlib.md5(canonical.get("url", "").encode()).hexdigest()
        d_url_hash = hashlib.md5(dup.get("url", "").encode()).hexdigest()
        if c_url_hash == d_url_hash:
            return
        try:
            has_canonical = self.conn.execute(
                "SELECT 1 FROM article_summaries WHERE url_hash = ? LIMIT 1",
                (c_url_hash,),
            ).fetchone()
            if has_canonical:
                # canonical 已有摘要，删除 dup 的
                self.conn.execute(
                    "DELETE FROM article_summaries WHERE url_hash = ?",
                    (d_url_hash,),
                )
                return
            # canonical 无摘要，迁移 dup 的
            dup_summary = self.conn.execute(
                "SELECT * FROM article_summaries WHERE url_hash = ? LIMIT 1",
                (d_url_hash,),
            ).fetchone()
            if dup_summary:
                cols = [desc[0] for desc in self.conn.execute(
                    "SELECT * FROM article_summaries LIMIT 0"
                ).description]
                row_dict = dict(zip(cols, dup_summary))
                row_dict["url_hash"] = c_url_hash
                row_dict["url"] = canonical.get("url", row_dict.get("url", ""))
                placeholders = ",".join("?" * len(cols))
                col_names = ",".join(cols)
                self.conn.execute(
                    f"INSERT OR IGNORE INTO article_summaries ({col_names}) VALUES ({placeholders})",
                    [row_dict.get(c, "") for c in cols],
                )
                self.conn.execute(
                    "DELETE FROM article_summaries WHERE url_hash = ?",
                    (d_url_hash,),
                )
        except Exception as e:
            logger.debug("migrate_summary error: %s", e)

    # ------------------------------------------------------------------
    # Batch scan (Task 5)
    # ------------------------------------------------------------------

    def batch_scan(
        self,
        days: int = 30,
        batch_size: int = 500,
        dry_run: bool = True,
    ) -> Dict[str, Any]:
        """批量扫描历史文章，识别跨源重复。

        Args:
            days: 扫描最近 N 天
            batch_size: 每批处理条数
            dry_run: True=只记录不删除, False=记录并物理删除

        Returns:
            {"processed": int, "new_pairs": int, "elapsed_s": float}
        """
        t0 = time.time()
        now_ts = int(t0)
        cutoff = now_ts - days * 86400
        new_pairs = 0
        processed = 0

        # Ensure no pending transaction
        try:
            self.conn.commit()
        except Exception:
            pass

        # 1. 标题指纹精确匹配：找出跨源重复组
        try:
            groups = self.conn.execute(
                """SELECT title_fingerprint, COUNT(DISTINCT source_id) as src_cnt
                   FROM rss_entries
                   WHERE title_fingerprint != ''
                     AND published_at >= ?
                   GROUP BY title_fingerprint
                   HAVING src_cnt > 1
                   ORDER BY title_fingerprint""",
                (cutoff,),
            ).fetchall()
        except Exception as e:
            logger.error("batch_scan title group error: %s", e)
            groups = []

        for tfp, _ in groups:
            try:
                rows = self.conn.execute(
                    """SELECT source_id, dedup_key, title, url, published_at,
                              COALESCE(description, '') as description
                       FROM rss_entries
                       WHERE title_fingerprint = ? AND published_at >= ?
                       ORDER BY published_at ASC""",
                    (tfp, cutoff),
                ).fetchall()
            except Exception:
                continue

            articles = [
                {
                    "source_id": str(r[0]), "dedup_key": str(r[1]),
                    "title": str(r[2] or ""), "url": str(r[3] or ""),
                    "published_at": int(r[4] or 0),
                    "description": str(r[5] or ""),
                }
                for r in rows
            ]
            if len(articles) < 2:
                continue

            # 检查时间差
            valid_articles = []
            base_pub = articles[0]["published_at"]
            for a in articles:
                if not base_pub or not a["published_at"] or abs(a["published_at"] - base_pub) <= self.MAX_TIME_DIFF:
                    valid_articles.append(a)

            if len(valid_articles) < 2:
                continue

            canonical = CanonicalSelector.select(valid_articles)
            for art in valid_articles:
                if art["source_id"] == canonical["source_id"] and art["dedup_key"] == canonical["dedup_key"]:
                    continue
                try:
                    cur = self.conn.execute(
                        """INSERT OR IGNORE INTO cross_source_dedup
                           (canonical_source_id, canonical_dedup_key,
                            dup_source_id, dup_dedup_key,
                            match_type, similarity_score,
                            dup_title, dup_url, dup_published_at, detected_at)
                           VALUES (?, ?, ?, ?, 'title_exact', 1.0, ?, ?, ?, ?)""",
                        (
                            canonical["source_id"], canonical["dedup_key"],
                            art["source_id"], art["dedup_key"],
                            art["title"], art["url"], art["published_at"],
                            now_ts,
                        ),
                    )
                    if cur.rowcount > 0:
                        new_pairs += 1
                        if not dry_run:
                            self._physical_delete(canonical, art, now_ts)
                except Exception:
                    pass
            processed += len(valid_articles)

            if processed % batch_size == 0:
                try:
                    self.conn.commit()
                except Exception:
                    pass

        # 2. URL 归一化精确匹配
        try:
            url_groups = self.conn.execute(
                """SELECT url_normalized, COUNT(DISTINCT source_id) as src_cnt
                   FROM rss_entries
                   WHERE url_normalized != ''
                     AND published_at >= ?
                   GROUP BY url_normalized
                   HAVING src_cnt > 1
                   ORDER BY url_normalized""",
                (cutoff,),
            ).fetchall()
        except Exception as e:
            logger.error("batch_scan url group error: %s", e)
            url_groups = []

        for unorm, _ in url_groups:
            try:
                rows = self.conn.execute(
                    """SELECT source_id, dedup_key, title, url, published_at,
                              COALESCE(description, '') as description
                       FROM rss_entries
                       WHERE url_normalized = ? AND published_at >= ?
                       ORDER BY published_at ASC""",
                    (unorm, cutoff),
                ).fetchall()
            except Exception:
                continue

            articles = [
                {
                    "source_id": str(r[0]), "dedup_key": str(r[1]),
                    "title": str(r[2] or ""), "url": str(r[3] or ""),
                    "published_at": int(r[4] or 0),
                    "description": str(r[5] or ""),
                }
                for r in rows
            ]
            if len(articles) < 2:
                continue

            canonical = CanonicalSelector.select(articles)
            for art in articles:
                if art["source_id"] == canonical["source_id"] and art["dedup_key"] == canonical["dedup_key"]:
                    continue
                # 跳过已有 title_exact 记录的
                existing = self.conn.execute(
                    """SELECT 1 FROM cross_source_dedup
                       WHERE dup_source_id = ? AND dup_dedup_key = ? LIMIT 1""",
                    (art["source_id"], art["dedup_key"]),
                ).fetchone()
                if existing:
                    continue
                try:
                    cur = self.conn.execute(
                        """INSERT OR IGNORE INTO cross_source_dedup
                           (canonical_source_id, canonical_dedup_key,
                            dup_source_id, dup_dedup_key,
                            match_type, similarity_score,
                            dup_title, dup_url, dup_published_at, detected_at)
                           VALUES (?, ?, ?, ?, 'url_exact', 1.0, ?, ?, ?, ?)""",
                        (
                            canonical["source_id"], canonical["dedup_key"],
                            art["source_id"], art["dedup_key"],
                            art["title"], art["url"], art["published_at"],
                            now_ts,
                        ),
                    )
                    if cur.rowcount > 0:
                        new_pairs += 1
                        if not dry_run:
                            self._physical_delete(canonical, art, now_ts)
                except Exception:
                    pass
            processed += len(articles)

        # 3. 跨源模糊标题匹配（阈值 0.90）
        #    按源分组，每个源的文章与其他源做模糊比对
        try:
            all_articles = self.conn.execute(
                """SELECT source_id, dedup_key, title, url, published_at,
                          COALESCE(description, '') as description
                   FROM rss_entries
                   WHERE published_at >= ?
                     AND title_fingerprint != '' AND title_fingerprint != '_empty_'
                   ORDER BY published_at ASC""",
                (cutoff,),
            ).fetchall()
        except Exception as e:
            logger.error("batch_scan fuzzy load error: %s", e)
            all_articles = []

        if all_articles:
            # 已被标记为 dup 的跳过
            known_dups = set()
            try:
                for row in self.conn.execute(
                    "SELECT dup_source_id, dup_dedup_key FROM cross_source_dedup"
                ).fetchall():
                    known_dups.add((str(row[0]), str(row[1])))
            except Exception:
                pass

            # 构建候选列表（排除已知 dup）
            candidates = []
            for r in all_articles:
                key = (str(r[0]), str(r[1]))
                if key not in known_dups:
                    candidates.append({
                        "source_id": str(r[0]), "dedup_key": str(r[1]),
                        "title": str(r[2] or ""), "url": str(r[3] or ""),
                        "published_at": int(r[4] or 0),
                        "description": str(r[5] or ""),
                    })

            fuzzy_pairs = 0
            matched_keys = set()
            for i, art in enumerate(candidates):
                if not TitleNormalizer.is_eligible_for_fuzzy(art["title"]):
                    continue
                art_key = (art["source_id"], art["dedup_key"])
                if art_key in matched_keys:
                    continue
                n_len = len(TitleNormalizer.normalize(art["title"]))
                if n_len == 0:
                    continue

                for j in range(i + 1, len(candidates)):
                    other = candidates[j]
                    if other["source_id"] == art["source_id"]:
                        continue
                    other_key = (other["source_id"], other["dedup_key"])
                    if other_key in matched_keys:
                        continue
                    # 时间差检查
                    if art["published_at"] and other["published_at"] and abs(art["published_at"] - other["published_at"]) > self.MAX_TIME_DIFF:
                        continue
                    # 长度预筛选
                    o_len = len(TitleNormalizer.normalize(other["title"]))
                    if o_len == 0 or abs(n_len - o_len) > max(n_len, o_len) * 0.3:
                        continue

                    score = TitleNormalizer.similarity(art["title"], other["title"])
                    if score >= self.THRESHOLD_CROSS_GROUP:
                        canonical = CanonicalSelector.select([art, other])
                        dup = other if canonical is art or (canonical["source_id"] == art["source_id"] and canonical["dedup_key"] == art["dedup_key"]) else art
                        try:
                            cur = self.conn.execute(
                                """INSERT OR IGNORE INTO cross_source_dedup
                                   (canonical_source_id, canonical_dedup_key,
                                    dup_source_id, dup_dedup_key,
                                    match_type, similarity_score,
                                    dup_title, dup_url, dup_published_at, detected_at)
                                   VALUES (?, ?, ?, ?, 'title_fuzzy_cross', ?, ?, ?, ?, ?)""",
                                (
                                    canonical["source_id"], canonical["dedup_key"],
                                    dup["source_id"], dup["dedup_key"],
                                    score,
                                    dup["title"], dup["url"], dup["published_at"],
                                    now_ts,
                                ),
                            )
                            if cur.rowcount > 0:
                                new_pairs += 1
                                fuzzy_pairs += 1
                                matched_keys.add((dup["source_id"], dup["dedup_key"]))
                                if not dry_run:
                                    self._physical_delete(canonical, dup, now_ts)
                        except Exception:
                            pass

                if fuzzy_pairs % 50 == 0 and fuzzy_pairs > 0:
                    try:
                        self.conn.commit()
                    except Exception:
                        pass

            logger.info("batch_scan fuzzy phase: %d new fuzzy pairs", fuzzy_pairs)

        try:
            self.conn.commit()
        except Exception:
            pass

        elapsed = time.time() - t0
        logger.info(
            "batch_scan done: processed=%d new_pairs=%d elapsed=%.1fs dry_run=%s",
            processed, new_pairs, elapsed, dry_run,
        )
        return {"processed": processed, "new_pairs": new_pairs, "elapsed_s": round(elapsed, 1)}

    # ------------------------------------------------------------------
    # Backfill fingerprints (Task 6)
    # ------------------------------------------------------------------

    def backfill_fingerprints(self, batch_size: int = 500) -> Dict[str, int]:
        """为现有 rss_entries 批量计算 title_fingerprint 和 url_normalized。

        Returns:
            {"updated": int, "elapsed_s": float}
        """
        t0 = time.time()
        updated = 0

        # Ensure no pending transaction
        try:
            self.conn.commit()
        except Exception:
            pass

        while True:
            rows = self.conn.execute(
                """SELECT source_id, dedup_key, title, url
                   FROM rss_entries
                   WHERE title_fingerprint = '' OR url_normalized = ''
                   LIMIT ?""",
                (batch_size,),
            ).fetchall()
            if not rows:
                break

            for r in rows:
                sid, dk, title, url = str(r[0]), str(r[1]), str(r[2] or ""), str(r[3] or "")
                tfp = TitleNormalizer.fingerprint(title) or "_empty_"
                unorm = URLNormalizer.normalize(url) or "_empty_"
                self.conn.execute(
                    """UPDATE rss_entries
                       SET title_fingerprint = ?, url_normalized = ?
                       WHERE source_id = ? AND dedup_key = ?""",
                    (tfp, unorm, sid, dk),
                )
            self.conn.commit()
            updated += len(rows)
            logger.info("backfill progress: %d rows updated", updated)

        elapsed = time.time() - t0
        logger.info("backfill done: updated=%d elapsed=%.1fs", updated, elapsed)
        return {"updated": updated, "elapsed_s": round(elapsed, 1)}

    # ------------------------------------------------------------------
    # Stats (Task 15)
    # ------------------------------------------------------------------

    def get_stats(self) -> Dict[str, Any]:
        """获取去重统计信息"""
        try:
            total = self.conn.execute(
                "SELECT COUNT(*) FROM cross_source_dedup"
            ).fetchone()[0]

            by_type = {}
            for row in self.conn.execute(
                "SELECT match_type, COUNT(*) FROM cross_source_dedup GROUP BY match_type"
            ).fetchall():
                by_type[str(row[0])] = int(row[1])

            last_24h = self.conn.execute(
                "SELECT COUNT(*) FROM cross_source_dedup WHERE detected_at >= ?",
                (int(time.time()) - 86400,),
            ).fetchone()[0]

            deleted = self.conn.execute(
                "SELECT COUNT(*) FROM cross_source_dedup WHERE deleted_at > 0"
            ).fetchone()[0]

            # Top source pairs
            top_pairs = []
            for row in self.conn.execute(
                """SELECT canonical_source_id, dup_source_id, COUNT(*) as cnt
                   FROM cross_source_dedup
                   GROUP BY canonical_source_id, dup_source_id
                   ORDER BY cnt DESC
                   LIMIT 10"""
            ).fetchall():
                top_pairs.append({
                    "canonical_source": str(row[0]),
                    "dup_source": str(row[1]),
                    "count": int(row[2]),
                })

            return {
                "total_pairs": total,
                "by_match_type": by_type,
                "last_24h": last_24h,
                "deleted": deleted,
                "top_source_pairs": top_pairs,
            }
        except Exception as e:
            logger.error("get_stats error: %s", e)
            return {"error": str(e)}
