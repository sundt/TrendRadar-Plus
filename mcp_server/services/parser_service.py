"""
文件解析服务

提供txt格式新闻数据和YAML配置文件的解析功能。
支持从 SQLite 数据库和 TXT 文件两种数据源读取。
"""

import re
import sqlite3
from pathlib import Path
from typing import Dict, List, Tuple, Optional
from datetime import datetime

import yaml

from ..utils.errors import FileParseError, DataNotFoundError
from .cache_service import get_cache


class ParserService:
    """文件解析服务类"""

    def __init__(self, project_root: str = None):
        """
        初始化解析服务

        Args:
            project_root: 项目根目录，默认为当前目录的父目录
        """
        if project_root is None:
            # 获取当前文件所在目录的父目录的父目录
            current_file = Path(__file__)
            self.project_root = current_file.parent.parent.parent
        else:
            self.project_root = Path(project_root)

        # 初始化缓存服务
        self.cache = get_cache()

    @staticmethod
    def clean_title(title: str) -> str:
        """
        清理标题文本

        Args:
            title: 原始标题

        Returns:
            清理后的标题
        """
        # 移除多余空白
        title = re.sub(r'\s+', ' ', title)
        # 移除特殊字符
        title = title.strip()
        return title

    def parse_txt_file(self, file_path: Path) -> Tuple[Dict, Dict]:
        """
        解析单个txt文件的标题数据

        Args:
            file_path: txt文件路径

        Returns:
            (titles_by_id, id_to_name) 元组
            - titles_by_id: {platform_id: {title: {ranks, url, mobileUrl}}}
            - id_to_name: {platform_id: platform_name}

        Raises:
            FileParseError: 文件解析错误
        """
        if not file_path.exists():
            raise FileParseError(str(file_path), "文件不存在")

        titles_by_id = {}
        id_to_name = {}

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
                sections = content.split("\n\n")

                for section in sections:
                    if not section.strip() or "==== 以下ID请求失败 ====" in section:
                        continue

                    lines = section.strip().split("\n")
                    if len(lines) < 2:
                        continue

                    # 解析header: id | name 或 id
                    header_line = lines[0].strip()
                    if " | " in header_line:
                        parts = header_line.split(" | ", 1)
                        source_id = parts[0].strip()
                        name = parts[1].strip()
                        id_to_name[source_id] = name
                    else:
                        source_id = header_line
                        id_to_name[source_id] = source_id

                    titles_by_id[source_id] = {}

                    # 解析标题行
                    for line in lines[1:]:
                        if line.strip():
                            try:
                                title_part = line.strip()
                                rank = None

                                # 提取排名
                                if ". " in title_part and title_part.split(". ")[0].isdigit():
                                    rank_str, title_part = title_part.split(". ", 1)
                                    rank = int(rank_str)

                                # 提取 MOBILE URL
                                mobile_url = ""
                                if " [MOBILE:" in title_part:
                                    title_part, mobile_part = title_part.rsplit(" [MOBILE:", 1)
                                    if mobile_part.endswith("]"):
                                        mobile_url = mobile_part[:-1]

                                # 提取 URL
                                url = ""
                                if " [URL:" in title_part:
                                    title_part, url_part = title_part.rsplit(" [URL:", 1)
                                    if url_part.endswith("]"):
                                        url = url_part[:-1]

                                title = self.clean_title(title_part.strip())
                                ranks = [rank] if rank is not None else [1]

                                titles_by_id[source_id][title] = {
                                    "ranks": ranks,
                                    "url": url,
                                    "mobileUrl": mobile_url,
                                }

                            except Exception as e:
                                # 忽略单行解析错误
                                continue

        except Exception as e:
            raise FileParseError(str(file_path), str(e))

        return titles_by_id, id_to_name

    def get_date_folder_name(self, date: datetime = None) -> str:
        """
        获取日期文件夹名称（兼容中文和ISO格式）

        Args:
            date: 日期对象，默认为今天

        Returns:
            实际存在的文件夹名称，优先返回中文格式（YYYY年MM月DD日），
            若不存在则返回 ISO 格式（YYYY-MM-DD）
        """
        if date is None:
            date = datetime.now()
        return self._find_date_folder(date)

    def _get_date_folder_name(self, date: datetime = None) -> str:
        """
        获取日期文件夹名称（兼容中文和ISO格式）

        Args:
            date: 日期对象，默认为今天

        Returns:
            实际存在的文件夹名称，优先返回中文格式（YYYY年MM月DD日），
            若不存在则返回 ISO 格式（YYYY-MM-DD）
        """
        if date is None:
            date = datetime.now()
        return self._find_date_folder(date)

    def _find_date_folder(self, date: datetime) -> str:
        """
        查找实际存在的日期文件夹

        支持两种格式：
        - 中文格式：YYYY年MM月DD日（优先）
        - ISO格式：YYYY-MM-DD

        Args:
            date: 日期对象

        Returns:
            实际存在的文件夹名称，若都不存在则返回中文格式
        """
        output_dir = self.project_root / "output"

        # 中文格式：YYYY年MM月DD日
        chinese_format = date.strftime("%Y年%m月%d日")
        # ISO格式：YYYY-MM-DD
        iso_format = date.strftime("%Y-%m-%d")

        # 优先检查中文格式
        if (output_dir / chinese_format).exists():
            return chinese_format
        # 其次检查 ISO 格式
        if (output_dir / iso_format).exists():
            return iso_format

        # 都不存在，返回中文格式（与项目现有风格一致）
        return chinese_format

    def _get_sqlite_db_path(self, date: datetime = None) -> Optional[Path]:
        """
        获取 SQLite 数据库文件路径

        Args:
            date: 日期对象，默认为今天

        Returns:
            数据库文件路径，如果不存在则返回 None
        """
        date_folder = self._get_date_folder_name(date)
        db_path = self.project_root / "output" / date_folder / "news.db"
        if db_path.exists():
            return db_path
        return None

    def _get_txt_folder_path(self, date: datetime = None) -> Optional[Path]:
        """
        获取 TXT 文件夹路径

        Args:
            date: 日期对象，默认为今天

        Returns:
            TXT 文件夹路径，如果不存在则返回 None
        """
        date_folder = self._get_date_folder_name(date)
        txt_path = self.project_root / "output" / date_folder / "txt"
        if txt_path.exists() and txt_path.is_dir():
            return txt_path
        return None

    def _read_from_txt(
        self,
        date: datetime = None,
        platform_ids: Optional[List[str]] = None
    ) -> Optional[Tuple[Dict, Dict, Dict]]:
        """
        从 TXT 文件夹读取新闻数据

        Args:
            date: 日期对象，默认为今天
            platform_ids: 平台ID列表，None表示所有平台

        Returns:
            (all_titles, id_to_name, all_timestamps) 元组，如果不存在返回 None
        """
        txt_folder = self._get_txt_folder_path(date)
        if txt_folder is None:
            return None

        # 获取所有 TXT 文件并按时间排序
        txt_files = sorted(txt_folder.glob("*.txt"))
        if not txt_files:
            return None

        all_titles = {}
        id_to_name = {}
        all_timestamps = {}

        for txt_file in txt_files:
            try:
                titles_by_id, file_id_to_name = self.parse_txt_file(txt_file)

                # 记录时间戳
                all_timestamps[txt_file.name] = txt_file.stat().st_mtime

                # 合并 id_to_name
                id_to_name.update(file_id_to_name)

                # 合并标题数据
                for source_id, titles in titles_by_id.items():
                    # 如果指定了 platform_ids，过滤
                    if platform_ids and source_id not in platform_ids:
                        continue

                    if source_id not in all_titles:
                        all_titles[source_id] = {}

                    for title, data in titles.items():
                        if title not in all_titles[source_id]:
                            # 新标题
                            all_titles[source_id][title] = {
                                "ranks": data.get("ranks", []),
                                "url": data.get("url", ""),
                                "mobileUrl": data.get("mobileUrl", ""),
                                "first_time": txt_file.stem,  # 使用文件名作为时间
                                "last_time": txt_file.stem,
                                "count": 1,
                            }
                        else:
                            # 合并已存在的标题
                            existing = all_titles[source_id][title]
                            # 合并排名
                            for rank in data.get("ranks", []):
                                if rank not in existing["ranks"]:
                                    existing["ranks"].append(rank)
                            # 更新 last_time
                            existing["last_time"] = txt_file.stem
                            existing["count"] += 1
                            # 保留 URL
                            if not existing["url"] and data.get("url"):
                                existing["url"] = data["url"]
                            if not existing["mobileUrl"] and data.get("mobileUrl"):
                                existing["mobileUrl"] = data["mobileUrl"]

            except Exception as e:
                print(f"Warning: 解析 TXT 文件失败 {txt_file}: {e}")
                continue

        if not all_titles:
            return None

        return (all_titles, id_to_name, all_timestamps)

    def _read_from_sqlite(
        self,
        date: datetime = None,
        platform_ids: Optional[List[str]] = None
    ) -> Optional[Tuple[Dict, Dict, Dict]]:
        """
        从 SQLite 数据库读取新闻数据

        新表结构数据已按 URL 去重，包含：
        - first_crawl_time: 首次抓取时间
        - last_crawl_time: 最后抓取时间
        - crawl_count: 抓取次数

        Args:
            date: 日期对象，默认为今天
            platform_ids: 平台ID列表，None表示所有平台

        Returns:
            (all_titles, id_to_name, all_timestamps) 元组，如果数据库不存在返回 None
        """
        db_path = self._get_sqlite_db_path(date)
        if db_path is None:
            return None

        all_titles = {}
        id_to_name = {}
        all_timestamps = {}

        try:
            conn = sqlite3.connect(str(db_path))
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            # 检查表是否存在
            cursor.execute("""
                SELECT name FROM sqlite_master
                WHERE type='table' AND name='news_items'
            """)
            if not cursor.fetchone():
                conn.close()
                return None

            # 构建查询
            # 检查字段是否存在
            cursor.execute("PRAGMA table_info(news_items)")
            columns = {row['name'] for row in cursor.fetchall()}
            has_published_at = 'published_at' in columns

            # 构建查询
            pub_col = ", n.published_at" if has_published_at else ""
            
            if platform_ids:
                placeholders = ','.join(['?' for _ in platform_ids])
                query = f"""
                    SELECT n.id, n.platform_id, p.name as platform_name, n.title,
                           n.rank, n.url, n.mobile_url,
                           n.first_crawl_time, n.last_crawl_time, n.crawl_count{pub_col}
                    FROM news_items n
                    LEFT JOIN platforms p ON n.platform_id = p.id
                    WHERE n.platform_id IN ({placeholders})
                """
                cursor.execute(query, platform_ids)
            else:
                cursor.execute(f"""
                    SELECT n.id, n.platform_id, p.name as platform_name, n.title,
                           n.rank, n.url, n.mobile_url,
                           n.first_crawl_time, n.last_crawl_time, n.crawl_count{pub_col}
                    FROM news_items n
                    LEFT JOIN platforms p ON n.platform_id = p.id
                """)

            rows = cursor.fetchall()

            # 收集所有 news_item_id 用于查询历史排名
            news_ids = [row['id'] for row in rows]
            rank_history_map = {}

            if news_ids:
                # 分批查询，避免 "too many SQL variables" 错误
                # SQLite 默认限制 999 个变量
                batch_size = 500
                for i in range(0, len(news_ids), batch_size):
                    batch_ids = news_ids[i:i + batch_size]
                    placeholders = ",".join("?" * len(batch_ids))
                    cursor.execute(f"""
                        SELECT news_item_id, rank FROM rank_history
                        WHERE news_item_id IN ({placeholders})
                        ORDER BY news_item_id, crawl_time
                    """, batch_ids)
                    
                    for rh_row in cursor.fetchall():
                        news_id = rh_row['news_item_id']
                        rank = rh_row['rank']
                        if news_id not in rank_history_map:
                            rank_history_map[news_id] = []
                        rank_history_map[news_id].append(rank)

            for row in rows:
                news_id = row['id']
                platform_id = row['platform_id']
                platform_name = row['platform_name'] or platform_id
                title = row['title']

                # 更新 id_to_name
                if platform_id not in id_to_name:
                    id_to_name[platform_id] = platform_name

                # 初始化平台字典
                if platform_id not in all_titles:
                    all_titles[platform_id] = {}

                # 获取排名历史，如果为空则使用当前排名
                ranks = rank_history_map.get(news_id, [row['rank']])

                # 直接使用数据（已去重）
                # 直接使用数据（已去重）
                item_data = {
                    "ranks": ranks,
                    "url": row['url'] or "",
                    "mobileUrl": row['mobile_url'] or "",
                    "first_time": row['first_crawl_time'] or "",
                    "last_time": row['last_crawl_time'] or "",
                    "count": row['crawl_count'] or 1,
                }
                if has_published_at:
                    item_data["published_at"] = row['published_at'] or 0
                
                all_titles[platform_id][title] = item_data

            # 获取抓取时间作为 timestamps
            cursor.execute("""
                SELECT crawl_time, created_at FROM crawl_records
                ORDER BY crawl_time
            """)
            for row in cursor.fetchall():
                crawl_time = row['crawl_time']
                created_at = row['created_at']
                # 将 created_at 转换为 Unix 时间戳
                try:
                    ts = datetime.strptime(created_at, "%Y-%m-%d %H:%M:%S").timestamp()
                except (ValueError, TypeError):
                    ts = datetime.now().timestamp()
                all_timestamps[f"{crawl_time}.db"] = ts

            conn.close()

            if not all_titles:
                return None

            return (all_titles, id_to_name, all_timestamps)

        except Exception as e:
            print(f"Warning: 从 SQLite 读取数据失败: {e}")
            return None

    def read_all_titles_for_date(
        self,
        date: datetime = None,
        platform_ids: Optional[List[str]] = None
    ) -> Tuple[Dict, Dict, Dict]:
        """
        读取指定日期的所有标题（带缓存）

        Args:
            date: 日期对象，默认为今天
            platform_ids: 平台ID列表，None表示所有平台

        Returns:
            (all_titles, id_to_name, all_timestamps) 元组
            - all_titles: {platform_id: {title: {ranks, url, mobileUrl, ...}}}
            - id_to_name: {platform_id: platform_name}
            - all_timestamps: {filename: timestamp}

        Raises:
            DataNotFoundError: 数据不存在
        """
        # 生成缓存键
        date_str = self.get_date_folder_name(date)
        platform_key = ','.join(sorted(platform_ids)) if platform_ids else 'all'
        cache_key = f"read_all_titles:{date_str}:{platform_key}"

        # 尝试从缓存获取
        # 对于历史数据（非今天），使用更长的缓存时间（1小时）
        # 对于今天的数据，使用较短的缓存时间（15分钟），因为可能有新数据
        is_today = (date is None) or (date.date() == datetime.now().date())
        ttl = 900 if is_today else 3600  # 15分钟 vs 1小时

        cached = self.cache.get(cache_key, ttl=ttl)
        if cached:
            return cached

        # 优先从 SQLite 读取
        sqlite_result = self._read_from_sqlite(date, platform_ids)
        if sqlite_result:
            self.cache.set(cache_key, sqlite_result)
            return sqlite_result

        # SQLite 不存在，尝试从 TXT 读取
        txt_result = self._read_from_txt(date, platform_ids)
        if txt_result:
            self.cache.set(cache_key, txt_result)
            return txt_result

        # 两种数据源都不存在
        raise DataNotFoundError(
            f"未找到 {date_str} 的数据",
            suggestion="请先运行爬虫或检查日期是否正确"
        )

    def parse_yaml_config(self, config_path: str = None) -> dict:
        """
        解析YAML配置文件

        Args:
            config_path: 配置文件路径，默认为 config/config.yaml

        Returns:
            配置字典

        Raises:
            FileParseError: 配置文件解析错误
        """
        if config_path is None:
            config_path = self.project_root / "config" / "config.yaml"
        else:
            config_path = Path(config_path)

        if not config_path.exists():
            raise FileParseError(str(config_path), "配置文件不存在")

        try:
            with open(config_path, "r", encoding="utf-8") as f:
                config_data = yaml.safe_load(f)
            return config_data
        except Exception as e:
            raise FileParseError(str(config_path), str(e))

    def parse_frequency_words(self, words_file: str = None) -> List[Dict]:
        """
        解析关键词配置文件

        Args:
            words_file: 关键词文件路径，默认为 config/frequency_words.txt

        Returns:
            词组列表

        Raises:
            FileParseError: 文件解析错误
        """
        if words_file is None:
            words_file = self.project_root / "config" / "frequency_words.txt"
        else:
            words_file = Path(words_file)

        if not words_file.exists():
            return []

        word_groups = []

        try:
            with open(words_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue

                    # 使用 | 分隔符
                    parts = [p.strip() for p in line.split("|")]
                    if not parts:
                        continue

                    group = {
                        "required": [],
                        "normal": [],
                        "filter_words": []
                    }

                    for part in parts:
                        if not part:
                            continue

                        words = [w.strip() for w in part.split(",")]
                        for word in words:
                            if not word:
                                continue
                            if word.endswith("+"):
                                # 必须词
                                group["required"].append(word[:-1])
                            elif word.endswith("!"):
                                # 过滤词
                                group["filter_words"].append(word[:-1])
                            else:
                                # 普通词
                                group["normal"].append(word)

                    if group["required"] or group["normal"]:
                        word_groups.append(group)

        except Exception as e:
            raise FileParseError(str(words_file), str(e))

        return word_groups
