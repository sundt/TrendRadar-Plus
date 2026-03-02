import sqlite3
from pathlib import Path
from typing import Optional


_online_db_conn: Optional[sqlite3.Connection] = None


def get_online_db_conn(project_root: Path) -> sqlite3.Connection:
    global _online_db_conn

    if _online_db_conn is not None:
        return _online_db_conn

    # Ensure project_root is a Path object
    if not isinstance(project_root, Path):
        project_root = Path(project_root)

    output_dir = project_root / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    db_path = output_dir / "online.db"

    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA cache_size=-65536")      # 64MB page cache
    conn.execute("PRAGMA temp_store=MEMORY")      # temp tables in memory
    conn.execute("PRAGMA mmap_size=268435456")    # 256MB memory-mapped I/O
    conn.execute("PRAGMA busy_timeout=5000")      # wait 5s on lock instead of failing

    conn.execute(
        "CREATE TABLE IF NOT EXISTS online_sessions (session_id TEXT PRIMARY KEY, last_seen INTEGER NOT NULL)"
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS rss_usage_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts INTEGER NOT NULL,
            day TEXT NOT NULL,
            client_key TEXT NOT NULL,
            subs_count INTEGER NOT NULL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_rss_usage_events_day ON rss_usage_events(day)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_rss_usage_events_ts ON rss_usage_events(ts)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_rss_usage_events_client ON rss_usage_events(client_key)")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS rss_sources (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            host TEXT NOT NULL,
            category TEXT DEFAULT '',
            cadence TEXT NOT NULL DEFAULT 'P4',
            next_due_at INTEGER NOT NULL DEFAULT 0,
            last_attempt_at INTEGER NOT NULL DEFAULT 0,
            etag TEXT NOT NULL DEFAULT '',
            last_modified TEXT NOT NULL DEFAULT '',
            fail_count INTEGER NOT NULL DEFAULT 0,
            backoff_until INTEGER NOT NULL DEFAULT 0,
            last_error_reason TEXT NOT NULL DEFAULT '',
            enabled INTEGER DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            added_at INTEGER NOT NULL DEFAULT 0
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS rss_source_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT NOT NULL,
            host TEXT NOT NULL,
            title TEXT NOT NULL,
            note TEXT DEFAULT '',
            status TEXT NOT NULL,
            reason TEXT DEFAULT '',
            created_at INTEGER NOT NULL,
            reviewed_at INTEGER DEFAULT 0,
            source_id TEXT DEFAULT ''
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS rss_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id TEXT NOT NULL,
            dedup_key TEXT NOT NULL,
            url TEXT NOT NULL,
            title TEXT NOT NULL,
            published_at INTEGER NOT NULL DEFAULT 0,
            published_raw TEXT NOT NULL DEFAULT '',
            fetched_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            UNIQUE(source_id, dedup_key)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_rss_entries_source_pub ON rss_entries(source_id, published_at DESC)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_rss_entries_pub ON rss_entries(published_at DESC)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_rss_entries_pub_id ON rss_entries(published_at DESC, id DESC)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_rss_entries_source_created ON rss_entries(source_id, created_at DESC)")
    # Indexes for data lifecycle management and custom source queries
    conn.execute("CREATE INDEX IF NOT EXISTS idx_rss_entries_fetched_at ON rss_entries(fetched_at DESC)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_rss_entries_source_fetched ON rss_entries(source_id, fetched_at DESC)")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS rss_entry_ai_labels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id TEXT NOT NULL,
            dedup_key TEXT NOT NULL,
            url TEXT NOT NULL,
            domain TEXT NOT NULL,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            action TEXT NOT NULL,
            score INTEGER NOT NULL,
            confidence REAL NOT NULL,
            reason TEXT NOT NULL,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            prompt_version TEXT NOT NULL,
            labeled_at INTEGER NOT NULL,
            error TEXT NOT NULL DEFAULT '',
            UNIQUE(source_id, dedup_key)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_rss_entry_ai_labels_labeled_at ON rss_entry_ai_labels(labeled_at DESC)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_rss_entry_ai_labels_action_score ON rss_entry_ai_labels(action, score DESC)")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS custom_sources (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            provider_type TEXT NOT NULL,
            config_json TEXT NOT NULL,
            enabled BOOLEAN DEFAULT 1,
            schedule_cron TEXT,
            category TEXT DEFAULT '', 
            country TEXT DEFAULT '',
            language TEXT DEFAULT '',
            last_run_at TEXT,
            last_status TEXT,
            last_error TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS newsnow_platforms (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT DEFAULT '',
            enabled BOOLEAN DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            last_fetch_at TEXT,
            last_status TEXT,
            last_error TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS platform_categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            icon TEXT DEFAULT '📰',
            sort_order INTEGER DEFAULT 0,
            enabled BOOLEAN DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    # Platform category rules for regex-based automatic category assignment
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS platform_category_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pattern TEXT NOT NULL,
            category_id TEXT NOT NULL,
            priority INTEGER DEFAULT 0,
            enabled INTEGER DEFAULT 1,
            description TEXT DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ai_learning_lessons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT NOT NULL UNIQUE,
            lesson TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    # News click tracking for analytics
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS news_clicks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            news_id TEXT NOT NULL,
            url TEXT NOT NULL,
            title TEXT NOT NULL,
            source_name TEXT DEFAULT '',
            category TEXT DEFAULT '',
            clicked_at INTEGER NOT NULL,
            user_agent TEXT DEFAULT ''
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_news_clicks_news_id ON news_clicks(news_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_news_clicks_clicked_at ON news_clicks(clicked_at)")

    # Tags definition table (multi-label classification)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            name_en TEXT DEFAULT '',
            type TEXT NOT NULL,
            parent_id TEXT DEFAULT '',
            icon TEXT DEFAULT '',
            color TEXT DEFAULT '',
            description TEXT DEFAULT '',
            sort_order INTEGER DEFAULT 0,
            enabled INTEGER DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_tags_type ON tags(type)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_tags_enabled ON tags(enabled, sort_order)")

    # News entry tags association table (many-to-many)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS rss_entry_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id TEXT NOT NULL,
            dedup_key TEXT NOT NULL,
            tag_id TEXT NOT NULL,
            confidence REAL DEFAULT 1.0,
            source TEXT DEFAULT 'ai',
            created_at INTEGER NOT NULL,
            UNIQUE(source_id, dedup_key, tag_id)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_entry_tags_tag ON rss_entry_tags(tag_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_entry_tags_entry ON rss_entry_tags(source_id, dedup_key)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_entry_tags_created ON rss_entry_tags(created_at DESC)")

    # === Performance optimization indexes (cold-cache-performance-optimization) ===
    # Composite index for Brief Timeline JOIN on rss_entry_ai_labels
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ai_labels_source_dedup_action ON rss_entry_ai_labels(source_id, dedup_key, action, score, confidence)")
    # Composite index for Brief Timeline JOIN on rss_entry_tags
    conn.execute("CREATE INDEX IF NOT EXISTS idx_entry_tags_source_dedup_tag ON rss_entry_tags(source_id, dedup_key, tag_id)")
    # Composite index for rss_entries covering published_at + source_id + dedup_key
    conn.execute("CREATE INDEX IF NOT EXISTS idx_rss_entries_pub_source_dedup ON rss_entries(published_at DESC, source_id, dedup_key)")

    # Tag candidates table (AI-discovered tags pending approval)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS tag_candidates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tag_id TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            name_en TEXT,
            type TEXT NOT NULL DEFAULT 'topic',
            parent_id TEXT,
            icon TEXT,
            description TEXT,
            
            occurrence_count INTEGER DEFAULT 0,
            first_seen_at INTEGER,
            last_seen_at INTEGER,
            avg_confidence REAL DEFAULT 0.0,
            total_confidence REAL DEFAULT 0.0,
            
            status TEXT DEFAULT 'pending',
            promoted_at INTEGER,
            rejected_reason TEXT,
            
            sample_titles TEXT DEFAULT '[]',
            
            created_at INTEGER,
            updated_at INTEGER
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_tag_candidates_status ON tag_candidates(status)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_tag_candidates_count ON tag_candidates(occurrence_count DESC)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_tag_candidates_confidence ON tag_candidates(avg_confidence DESC)")

    # Tag evolution log table (tracks all tag lifecycle events)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS tag_evolution_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tag_id TEXT NOT NULL,
            action TEXT NOT NULL,
            old_value TEXT,
            new_value TEXT,
            reason TEXT,
            metadata TEXT,
            created_at INTEGER,
            created_by TEXT DEFAULT 'system'
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_tag_evolution_tag ON tag_evolution_log(tag_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_tag_evolution_action ON tag_evolution_log(action)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_tag_evolution_time ON tag_evolution_log(created_at DESC)")

    # ========== WeChat MP (公众号) Articles Cache ==========
    # [DEPRECATED] 旧的公众号文章缓存表，数据已迁移到 rss_entries (source_type='mp')
    # 保留表结构以兼容旧数据库，新数据不再写入此表
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS wechat_mp_articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fakeid TEXT NOT NULL,
            dedup_key TEXT NOT NULL,
            title TEXT NOT NULL,
            url TEXT NOT NULL UNIQUE,
            digest TEXT,
            cover_url TEXT,
            publish_time INTEGER NOT NULL,
            fetched_at INTEGER NOT NULL,
            mp_nickname TEXT,
            UNIQUE(fakeid, dedup_key)
        )
        """
    )
    # 旧索引保留以兼容
    conn.execute("CREATE INDEX IF NOT EXISTS idx_wechat_articles_fakeid_time ON wechat_mp_articles(fakeid, publish_time DESC)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_wechat_articles_dedup ON wechat_mp_articles(dedup_key)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_wechat_articles_publish ON wechat_mp_articles(publish_time DESC)")

    # ========== Featured WeChat MPs (精选公众号) ==========
    # 管理员精选的公众号列表
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS featured_wechat_mps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fakeid TEXT NOT NULL UNIQUE,
            nickname TEXT NOT NULL,
            round_head_img TEXT DEFAULT '',
            signature TEXT DEFAULT '',
            category TEXT DEFAULT 'general',
            sort_order INTEGER DEFAULT 0,
            enabled INTEGER DEFAULT 1,
            article_count INTEGER DEFAULT 50,
            last_fetch_at INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_featured_mps_enabled ON featured_wechat_mps(enabled, sort_order)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_featured_mps_category ON featured_wechat_mps(category, enabled)")

    # ========== WeChat MP Stats (智能调度统计) ==========
    # [DEPRECATED] 旧的公众号调度统计表，数据已迁移到 source_stats (source_type='mp')
    # 保留表结构以兼容旧数据库，新数据不再写入此表
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS wechat_mp_stats (
            fakeid TEXT PRIMARY KEY,
            nickname TEXT,
            
            -- 更新频率分类
            frequency_type TEXT DEFAULT 'daily',
            cadence TEXT DEFAULT 'W2',
            
            -- 发布时间统计（用于预测）
            avg_publish_hour REAL,
            std_publish_hour REAL,
            avg_interval_hours REAL,
            
            -- 调度状态
            next_due_at INTEGER DEFAULT 0,
            last_check_at INTEGER DEFAULT 0,
            last_article_at INTEGER DEFAULT 0,
            
            -- 失败处理
            fail_count INTEGER DEFAULT 0,
            backoff_until INTEGER DEFAULT 0,
            last_error TEXT,
            
            -- 统计数据
            total_articles INTEGER DEFAULT 0,
            check_count INTEGER DEFAULT 0,
            hit_count INTEGER DEFAULT 0,
            
            created_at INTEGER,
            updated_at INTEGER
        )
        """
    )
    # 旧索引保留以兼容
    conn.execute("CREATE INDEX IF NOT EXISTS idx_wechat_stats_next_due ON wechat_mp_stats(next_due_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_wechat_stats_cadence ON wechat_mp_stats(cadence)")

    # ========== Source Stats (RSS/Custom 智能调度统计) ==========
    # 统一的源抓取统计表，用于 RSS 源和自定义源的智能调度
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS source_stats (
            source_id TEXT PRIMARY KEY,
            source_type TEXT NOT NULL DEFAULT 'rss',
            
            -- 更新频率分类
            frequency_type TEXT DEFAULT 'daily',
            cadence TEXT DEFAULT 'P2',
            
            -- 发布时间统计（用于预测）
            avg_publish_hour REAL,
            std_publish_hour REAL,
            
            -- 调度状态
            next_due_at INTEGER DEFAULT 0,
            last_check_at INTEGER DEFAULT 0,
            last_article_at INTEGER DEFAULT 0,
            
            -- 失败处理
            fail_count INTEGER DEFAULT 0,
            backoff_until INTEGER DEFAULT 0,
            last_error TEXT,
            
            -- 统计数据
            check_count INTEGER DEFAULT 0,
            hit_count INTEGER DEFAULT 0,
            
            created_at INTEGER,
            updated_at INTEGER
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_source_stats_next_due ON source_stats(next_due_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_source_stats_cadence ON source_stats(cadence)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_source_stats_type ON source_stats(source_type)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_source_stats_type_due ON source_stats(source_type, next_due_at)")

    # ========== User Articles (用户文章/草稿) ==========
    # 统一存储用户创作的文章（草稿和已发布）
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_articles (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            source_id TEXT NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            digest TEXT DEFAULT '',
            cover_url TEXT DEFAULT '',
            html_content TEXT NOT NULL DEFAULT '',
            markdown_content TEXT DEFAULT '',
            
            import_type TEXT DEFAULT 'manual',
            import_source_id TEXT DEFAULT '',
            import_source_url TEXT DEFAULT '',
            
            status TEXT DEFAULT 'draft',
            version INTEGER DEFAULT 1,
            
            view_count INTEGER DEFAULT 0,
            
            published_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_user_articles_user_id ON user_articles(user_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_user_articles_source_id ON user_articles(source_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_user_articles_status ON user_articles(status)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_user_articles_updated_at ON user_articles(updated_at DESC)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_user_articles_published_at ON user_articles(published_at DESC)")

    # ========== Temp Images (临时图片) ==========
    # 用于存储用户上传的临时图片
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS temp_images (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            file_path TEXT NOT NULL,
            original_name TEXT DEFAULT '',
            file_size INTEGER DEFAULT 0,
            mime_type TEXT DEFAULT '',
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_temp_images_user_id ON temp_images(user_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_temp_images_expires_at ON temp_images(expires_at)")

    def _ensure_column(table: str, column: str, col_def: str) -> None:
        try:
            cur = conn.execute(f"PRAGMA table_info({table})")
            cols = {str(r[1]) for r in (cur.fetchall() or [])}
            if column not in cols:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}")
        except Exception:
            return

    # [DEPRECATED] 旧表字段，保留以兼容
    _ensure_column("wechat_mp_articles", "publish_hour", "INTEGER")

    _ensure_column("rss_sources", "category", "TEXT DEFAULT ''")
    _ensure_column("rss_sources", "cadence", "TEXT NOT NULL DEFAULT 'P4'")
    _ensure_column("rss_sources", "next_due_at", "INTEGER NOT NULL DEFAULT 0")
    _ensure_column("rss_sources", "last_attempt_at", "INTEGER NOT NULL DEFAULT 0")
    _ensure_column("rss_sources", "etag", "TEXT NOT NULL DEFAULT ''")
    _ensure_column("rss_sources", "last_modified", "TEXT NOT NULL DEFAULT ''")
    _ensure_column("rss_sources", "fail_count", "INTEGER NOT NULL DEFAULT 0")
    _ensure_column("rss_sources", "backoff_until", "INTEGER NOT NULL DEFAULT 0")
    _ensure_column("rss_sources", "last_error_reason", "TEXT NOT NULL DEFAULT ''")
    _ensure_column("rss_sources", "feed_type", "TEXT NOT NULL DEFAULT ''")
    _ensure_column("rss_sources", "country", "TEXT NOT NULL DEFAULT ''")
    _ensure_column("rss_sources", "language", "TEXT NOT NULL DEFAULT ''")
    _ensure_column("rss_sources", "source", "TEXT NOT NULL DEFAULT ''")
    _ensure_column("rss_sources", "seed_last_updated", "TEXT NOT NULL DEFAULT ''")
    _ensure_column("rss_sources", "added_at", "INTEGER NOT NULL DEFAULT 0")
    _ensure_column("rss_sources", "scrape_rules", "TEXT NOT NULL DEFAULT ''")
    _ensure_column("rss_sources", "source_type", "TEXT DEFAULT 'rss'")  # rss/user/mp
    _ensure_column("rss_source_requests", "title", "TEXT NOT NULL DEFAULT ''")
    
    # Custom Sources columns
    _ensure_column("custom_sources", "category", "TEXT DEFAULT ''")
    _ensure_column("custom_sources", "country", "TEXT DEFAULT ''")
    _ensure_column("custom_sources", "language", "TEXT DEFAULT ''")
    _ensure_column("custom_sources", "backoff_until", "TEXT DEFAULT ''")
    _ensure_column("custom_sources", "entries_count", "INTEGER DEFAULT 0")
    _ensure_column("custom_sources", "fail_count", "INTEGER DEFAULT 0")
    _ensure_column("custom_sources", "script_content", "TEXT DEFAULT ''")
    # Smart scheduling fields for custom sources (like RSS)
    _ensure_column("custom_sources", "cadence", "TEXT DEFAULT 'P2'")
    _ensure_column("custom_sources", "next_due_at", "INTEGER DEFAULT 0")
    
    # Proxy support fields
    _ensure_column("rss_sources", "use_scraperapi", "INTEGER DEFAULT 0")
    _ensure_column("rss_sources", "use_socks_proxy", "INTEGER DEFAULT 0")
    _ensure_column("custom_sources", "use_scraperapi", "INTEGER DEFAULT 0")
    _ensure_column("custom_sources", "use_socks_proxy", "INTEGER DEFAULT 0")

    # NewsNow platform category override for manual assignment
    _ensure_column("newsnow_platforms", "category_override", "TEXT DEFAULT ''")

    # Preference tracking columns for news_clicks
    _ensure_column("news_clicks", "user_id", "INTEGER DEFAULT 0")
    _ensure_column("news_clicks", "tags_json", "TEXT DEFAULT '[]'")
    _ensure_column("news_clicks", "source_id", "TEXT DEFAULT ''")
    _ensure_column("news_clicks", "dedup_key", "TEXT DEFAULT ''")

    # Dynamic tag discovery columns for tags table
    _ensure_column("tags", "is_dynamic", "INTEGER DEFAULT 0")
    _ensure_column("tags", "lifecycle", "TEXT DEFAULT 'active'")
    _ensure_column("tags", "usage_count", "INTEGER DEFAULT 0")
    _ensure_column("tags", "last_used_at", "INTEGER")
    _ensure_column("tags", "promoted_from", "TEXT")
    
    # Tag candidates keywords column (AI-generated search keywords)
    _ensure_column("tag_candidates", "keywords", "TEXT DEFAULT '[]'")

    # ========== Featured WeChat MPs 扩展字段（公众号存储架构重构） ==========
    # source: 来源类型 - admin(管理员添加), ai_recommend(AI推荐), user(用户添加)
    _ensure_column("featured_wechat_mps", "source", "TEXT DEFAULT 'admin'")
    # added_by_user_id: 用户添加时记录添加者 user_id
    _ensure_column("featured_wechat_mps", "added_by_user_id", "INTEGER")

    # ========== RSS Entries 扩展字段（公众号文章统一存储） ==========
    # 为 rss_entries 表添加公众号文章所需的字段
    _ensure_column("rss_entries", "description", "TEXT DEFAULT ''")
    _ensure_column("rss_entries", "content", "TEXT DEFAULT ''")
    _ensure_column("rss_entries", "cover_url", "TEXT DEFAULT ''")
    _ensure_column("rss_entries", "source_type", "TEXT DEFAULT 'rss'")
    
    # 添加 source_type 索引以支持按类型筛选
    conn.execute("CREATE INDEX IF NOT EXISTS idx_rss_entries_source_type ON rss_entries(source_type)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_rss_entries_source_type_pub ON rss_entries(source_type, published_at DESC)")

    try:
        conn.execute("UPDATE rss_sources SET added_at = created_at WHERE (added_at IS NULL OR added_at = 0) AND created_at > 0")
    except Exception:
        pass

    # ========== Global Article Summaries Cache ==========
    # 全局文章摘要缓存（多用户共享，节省 AI Token）
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS article_summaries (
            url_hash TEXT PRIMARY KEY,
            url TEXT NOT NULL,
            title TEXT NOT NULL,
            summary TEXT NOT NULL,
            article_type TEXT DEFAULT 'other',
            model TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            created_by INTEGER NOT NULL,
            hit_count INTEGER DEFAULT 0,
            updated_at INTEGER NOT NULL,
            prompt_tokens INTEGER DEFAULT 0,
            completion_tokens INTEGER DEFAULT 0,
            total_tokens INTEGER DEFAULT 0,
            fetch_method TEXT DEFAULT ''
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_article_summaries_created ON article_summaries(created_at DESC)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_article_summaries_type ON article_summaries(article_type)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_article_summaries_url ON article_summaries(url)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_article_summaries_type_created ON article_summaries(article_type, created_at DESC)")
    
    # Migration: add fetch_method column if not exists
    _ensure_column("article_summaries", "fetch_method", "TEXT DEFAULT ''")
    
    # Migration: add tag columns for quality assessment and category tags
    _ensure_column("article_summaries", "quality_tag", "TEXT DEFAULT ''")
    _ensure_column("article_summaries", "category_tags", "TEXT DEFAULT '[]'")
    
    # Migration: add generation_time_ms column for performance tracking
    _ensure_column("article_summaries", "generation_time_ms", "INTEGER DEFAULT 0")

    # ========== Payment Tables ==========
    # Initialize payment tables for WeChat Pay Token recharge
    from hotnews.kernel.user.payment_api import init_payment_tables
    init_payment_tables(conn)

    # ========== Summary Failure Tracking Tables ==========
    # 总结失败追踪表（用于标记无法总结的网页/订阅源）
    from hotnews.kernel.services.summary_failure_tracker import init_failure_tables
    init_failure_tables(conn)

    # ========== Article Comments (文章评论) ==========
    # 存储用户对文章选中内容或全文的评论（支持顶级评论和回复）
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS article_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            article_url TEXT NOT NULL,
            article_url_hash TEXT NOT NULL,
            article_title TEXT DEFAULT '',
            selected_text TEXT DEFAULT '',
            text_xpath TEXT DEFAULT '',
            text_start_offset INTEGER DEFAULT 0,
            text_end_offset INTEGER DEFAULT 0,
            text_context_before TEXT DEFAULT '',
            text_context_after TEXT DEFAULT '',
            content TEXT NOT NULL,
            parent_id INTEGER DEFAULT 0,
            reply_to_user_id INTEGER DEFAULT 0,
            reply_to_user_name TEXT DEFAULT '',
            root_id INTEGER DEFAULT 0,
            user_id INTEGER NOT NULL,
            user_name TEXT DEFAULT '',
            user_avatar TEXT DEFAULT '',
            like_count INTEGER DEFAULT 0,
            reply_count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'active',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_comments_article_hash ON article_comments(article_url_hash, status, created_at DESC)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_comments_user ON article_comments(user_id, created_at DESC)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_comments_parent ON article_comments(parent_id, created_at ASC)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_comments_root ON article_comments(root_id, created_at ASC)")

    # ========== Article Comment Likes (评论点赞) ==========
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS article_comment_likes (
            comment_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (comment_id, user_id)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_comment_likes_user ON article_comment_likes(user_id)")

    # ========== Article Comment Reactions (评论 Emoji 反应) ==========
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS article_comment_reactions (
            comment_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            emoji TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (comment_id, user_id, emoji)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment ON article_comment_reactions(comment_id)")

    # ========== Article View Stats (文章阅读统计) ==========
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS article_view_stats (
            article_url_hash TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            view_type TEXT NOT NULL,
            first_seen_at INTEGER NOT NULL,
            last_seen_at INTEGER NOT NULL,
            PRIMARY KEY (article_url_hash, user_id, view_type)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_view_stats_article ON article_view_stats(article_url_hash)")

    # ========== Cross-Source Dedup (跨源文章去重) ==========
    # 数据源分组表：将同一发布者的多个数据源关联为一组
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS source_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_name TEXT NOT NULL UNIQUE,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS source_group_members (
            group_id INTEGER NOT NULL,
            source_id TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (group_id, source_id)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sgm_source ON source_group_members(source_id)")

    # 跨源去重关系表：记录重复文章对及审计信息
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS cross_source_dedup (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            canonical_source_id TEXT NOT NULL,
            canonical_dedup_key TEXT NOT NULL,
            dup_source_id TEXT NOT NULL,
            dup_dedup_key TEXT NOT NULL,
            match_type TEXT NOT NULL,
            similarity_score REAL NOT NULL DEFAULT 1.0,
            dup_title TEXT DEFAULT '',
            dup_url TEXT DEFAULT '',
            dup_published_at INTEGER DEFAULT 0,
            detected_at INTEGER NOT NULL,
            deleted_at INTEGER DEFAULT 0,
            UNIQUE(canonical_source_id, canonical_dedup_key, dup_source_id, dup_dedup_key)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_csd_canonical ON cross_source_dedup(canonical_source_id, canonical_dedup_key)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_csd_dup ON cross_source_dedup(dup_source_id, dup_dedup_key)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_csd_detected ON cross_source_dedup(detected_at DESC)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_csd_match_type ON cross_source_dedup(match_type)")

    # rss_entries 去重指纹列
    _ensure_column("rss_entries", "title_fingerprint", "TEXT DEFAULT ''")
    _ensure_column("rss_entries", "url_normalized", "TEXT DEFAULT ''")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_rss_entries_title_fp ON rss_entries(title_fingerprint)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_rss_entries_url_norm ON rss_entries(url_normalized)")

    conn.commit()

    _online_db_conn = conn
    return conn
