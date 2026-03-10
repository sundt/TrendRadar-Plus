# coding=utf-8
"""
向量索引模块

使用 FAISS 实现高效的语义搜索。
支持两种 embedding 方式：
1. 百炼 API（推荐，无需本地模型，省内存）
2. 本地 sentence-transformers（备用）
"""

import os
import pickle
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, List, Optional, Tuple

# numpy 作为可选依赖
try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    np = None
    NUMPY_AVAILABLE = False

from hotnews.core.logger import get_logger
from .config import get_search_config

logger = get_logger(__name__)

# 尝试导入 FAISS
try:
    import faiss
    FAISS_AVAILABLE = True
except ImportError:
    FAISS_AVAILABLE = False
    logger.debug("faiss 未安装，向量搜索不可用")

# 尝试导入本地模型（可选）
try:
    from sentence_transformers import SentenceTransformer
    SENTENCE_TRANSFORMERS_AVAILABLE = True
except ImportError:
    SENTENCE_TRANSFORMERS_AVAILABLE = False
    logger.debug("sentence-transformers 未安装，本地 embedding 不可用")


@dataclass
class VectorSearchResult:
    """向量搜索结果"""

    title: str
    url: str
    platform_id: str
    date: str
    rank: int
    similarity: float  # 余弦相似度


class BailianEmbeddingClient:
    """
    百炼 Embedding API 客户端
    
    使用 text-embedding-v4 模型，性价比最高。
    价格: 0.0005元/千Token，免费额度 100万 Token
    
    API 文档: https://help.aliyun.com/zh/model-studio/text-embedding-synchronous-api
    """
    
    def __init__(self, api_key: Optional[str] = None, model: str = "text-embedding-v4", dimensions: int = 1024):
        self.api_key = api_key or os.environ.get("DASHSCOPE_API_KEY", "")
        self.model = model
        self.dimensions = dimensions
        self.base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1"
        self._available = bool(self.api_key)
        
        if self._available:
            logger.info(f"百炼 Embedding 客户端已初始化: model={model}, dimensions={dimensions}")
        else:
            logger.warning("DASHSCOPE_API_KEY 未配置，百炼 Embedding 不可用")
    
    def encode(self, texts: List[str], batch_size: int = 10) -> Optional[Any]:
        """
        调用百炼 API 获取文本向量
        
        Args:
            texts: 文本列表
            batch_size: 每批处理数量（百炼限制最大 10 行/请求）
        
        Returns:
            numpy 数组或 None
        """
        if not self._available:
            return None
        
        if not NUMPY_AVAILABLE:
            logger.error("numpy 未安装，无法处理向量")
            return None
        
        all_embeddings = []
        
        # 分批处理（百炼 API 限制每批最多 10 条）
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            
            try:
                embeddings = self._call_api(batch)
                if embeddings is not None:
                    all_embeddings.append(embeddings)
                else:
                    logger.error(f"批次 {i//batch_size + 1} 获取 embedding 失败")
                    return None
            except Exception as e:
                logger.error(f"调用百炼 API 失败: {e}")
                return None
            
            # 避免触发限流（每秒最多 10 次请求）
            if i + batch_size < len(texts):
                time.sleep(0.15)
        
        if all_embeddings:
            return np.vstack(all_embeddings).astype(np.float32)
        return None
    
    def _call_api(self, texts: List[str]) -> Optional[Any]:
        """实际调用百炼 API（使用 urllib，避免额外依赖）"""
        import urllib.request
        import urllib.error
        import json
        
        url = f"{self.base_url}/embeddings"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        data = {
            "model": self.model,
            "input": texts,
            "dimensions": self.dimensions,
            "encoding_format": "float",
        }
        
        req = urllib.request.Request(
            url,
            data=json.dumps(data).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                result = json.loads(response.read().decode("utf-8"))
                
                # 检查错误
                if "error" in result:
                    logger.error(f"百炼 API 返回错误: {result['error']}")
                    return None
                
                # 提取 embeddings（按 index 排序）
                data_list = result.get("data", [])
                data_list.sort(key=lambda x: x.get("index", 0))
                
                embeddings = []
                for item in data_list:
                    embeddings.append(item["embedding"])
                
                if embeddings:
                    return np.array(embeddings, dtype=np.float32)
                    
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8") if e.fp else ""
            logger.error(f"百炼 API HTTP 错误 {e.code}: {error_body}")
        except urllib.error.URLError as e:
            logger.error(f"百炼 API 网络错误: {e.reason}")
        except json.JSONDecodeError as e:
            logger.error(f"百炼 API 响应解析失败: {e}")
        except Exception as e:
            logger.error(f"百炼 API 调用异常: {e}")
        
        return None
    
    def encode_single(self, text: str) -> Optional[Any]:
        """编码单个文本"""
        result = self.encode([text])
        if result is not None and len(result) > 0:
            return result[0]
        return None


class VectorIndex:
    """向量索引

    使用 FAISS 实现高效的高维向量检索。
    优先使用百炼 API（省内存），回退到本地模型。
    """

    def __init__(
        self,
        index_dir: Optional[str] = None,
        embedding_model: Optional[str] = None,
        vector_size: int = 1024,  # 百炼默认 1024 维
        use_bailian: bool = True,  # 优先使用百炼
    ):
        """
        初始化向量索引

        Args:
            index_dir: 索引存储目录
            embedding_model: Embedding 模型名称（本地模型）
            vector_size: 向量维度
            use_bailian: 是否使用百炼 API
        """
        # 检查基础依赖
        if not FAISS_AVAILABLE:
            logger.warning("FAISS 未安装，向量搜索不可用。请安装: pip install faiss-cpu")
            self._available = False
            return
        
        if not NUMPY_AVAILABLE:
            logger.warning("numpy 未安装，向量搜索不可用。请安装: pip install numpy")
            self._available = False
            return

        self._available = True

        config = get_search_config()
        self.index_dir = Path(index_dir or config.index_dir)
        self.index_dir.mkdir(parents=True, exist_ok=True)

        self.vector_size = vector_size
        self.embedding_model_name = embedding_model or config.embedding_model

        # 索引文件路径
        self.index_path = self.index_dir / "vector_index.faiss"
        self.meta_path = self.index_dir / "vector_meta.pkl"

        # FAISS 索引
        self.faiss_index = None

        # 元数据 (id -> (title, url, platform_id, date))
        self.metadata: dict = {}

        # 初始化 embedding 客户端
        self.bailian_client = None
        self.local_model = None
        self._embedding_type = None  # 'bailian' or 'local'
        
        # 优先使用百炼 API
        if use_bailian:
            self.bailian_client = BailianEmbeddingClient(dimensions=vector_size)
            if self.bailian_client._available:
                self._embedding_type = "bailian"
                logger.info("✓ 使用百炼 Embedding API（无需本地模型，节省内存）")
        
        # 回退到本地模型
        if self._embedding_type is None and SENTENCE_TRANSFORMERS_AVAILABLE:
            try:
                logger.info(f"加载本地 embedding 模型: {self.embedding_model_name}")
                self.local_model = SentenceTransformer(self.embedding_model_name)
                self._embedding_type = "local"
                # 更新 vector_size 为本地模型维度
                self.vector_size = self.local_model.get_sentence_embedding_dimension()
                logger.info(f"✓ 本地模型加载成功，维度: {self.vector_size}")
            except Exception as e:
                logger.warning(f"加载本地模型失败: {e}")
        
        if self._embedding_type is None:
            logger.error("无可用的 embedding 方式，请配置 DASHSCOPE_API_KEY 或安装 sentence-transformers")
            self._available = False
            return

        # 加载或创建索引
        self._load_or_create_index()

    def _load_or_create_index(self):
        """加载或创建 FAISS 索引"""
        if not self._available:
            return

        # 尝试加载现有索引
        if self.index_path.exists() and self.meta_path.exists():
            try:
                # 加载 FAISS 索引
                self.faiss_index = faiss.read_index(str(self.index_path))

                # 加载元数据
                with open(self.meta_path, "rb") as f:
                    self.metadata = pickle.load(f)

                # 检查维度是否匹配
                if self.faiss_index.d != self.vector_size:
                    logger.warning(f"索引维度 ({self.faiss_index.d}) 与当前配置 ({self.vector_size}) 不匹配，将重建索引")
                    self._create_index()
                else:
                    logger.info(f"向量索引已加载: {self.faiss_index.ntotal} 条记录 (embedding: {self._embedding_type})")
                return
            except Exception as e:
                logger.warning(f"加载现有索引失败: {e}，将创建新索引")

        # 创建新索引
        self._create_index()

    def _create_index(self):
        """创建新的 FAISS 索引"""
        if not self._available:
            return

        # 使用 FlatIP 索引（精确内积搜索，内存高效）
        # 对于 10 万量级数据，精确搜索足够快（~10ms），且比 HNSW 节省大量内存
        self.faiss_index = faiss.IndexFlatIP(self.vector_size)

        self.metadata = {}
        logger.info("新的向量索引已创建")

    def _ensure_available(self):
        """确保向量索引可用"""
        if not self._available:
            raise RuntimeError("向量索引不可用。请安装: pip install numpy faiss-cpu，并配置 DASHSCOPE_API_KEY")

    def encode_texts(self, texts: List[str], batch_size: int = 32) -> Any:
        """
        将文本编码为向量

        Args:
            texts: 文本列表
            batch_size: 批量大小

        Returns:
            向量数组（已归一化）
        """
        self._ensure_available()

        if self._embedding_type == "bailian":
            # 使用百炼 API（每批最多 10 条）
            embeddings = self.bailian_client.encode(texts, batch_size=min(batch_size, 10))
            if embeddings is None:
                raise RuntimeError("百炼 Embedding API 调用失败")
            # 归一化（用于余弦相似度）
            faiss.normalize_L2(embeddings)
            return embeddings
        else:
            # 使用本地模型
            embeddings = self.local_model.encode(
                texts,
                batch_size=batch_size,
                show_progress_bar=False,
                normalize_embeddings=True,
            )
            return np.array(embeddings, dtype=np.float32)

    def build_from_data(self, data: List[Tuple[str, str, str, str, int]]):
        """
        从数据列表构建索引（内存高效 + 断点续传 + 原子替换）

        - 每 5000 条写入一次 FAISS 并缓存 embeddings，避免 OOM
        - 缓存已编码的 embeddings，中断后可从断点恢复，不重复调 API
        - 最终原子替换正式文件

        Args:
            data: [(title, url, platform_id, date, id), ...]
        """
        self._ensure_available()

        if not data:
            logger.warning("没有数据可索引")
            return

        total = len(data)
        logger.info(f"开始构建向量索引: {total} 条数据 (embedding: {self._embedding_type})")

        # ---- 路径定义 ----
        cache_dir = self.index_dir / "build_cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        tmp_index_path = self.index_dir / "vector_index.faiss.tmp"
        tmp_meta_path = self.index_dir / "vector_meta.pkl.tmp"

        # ---- 检查缓存，确定断点 ----
        cached_count = 0
        cached_files = sorted(cache_dir.glob("emb_*.npy"))
        if cached_files:
            # 计算已缓存的条数
            for cf in cached_files:
                chunk = np.load(str(cf))
                cached_count += chunk.shape[0]
                del chunk
            logger.info(f"发现缓存: 已编码 {cached_count}/{total} 条，从断点继续")

        # ---- API 编码阶段：分批编码并缓存到磁盘 ----
        api_batch_size = 10 if self._embedding_type == "bailian" else 32
        commit_size = 5000  # 每 5000 条保存一次缓存
        texts = [item[0] for item in data]

        encoded = cached_count
        batch_buffer = []

        while encoded < total:
            # 取一个 API 批次
            end = min(encoded + api_batch_size, total)
            batch_texts = texts[encoded:end]
            emb = self.encode_texts(batch_texts)
            batch_buffer.append(emb)
            encoded += emb.shape[0]

            # 日志
            if (encoded // api_batch_size) % 50 == 0 or encoded >= total:
                logger.info(f"编码进度: {encoded}/{total} ({encoded * 100 // total}%)")

            # 每 commit_size 条或处理完毕时，保存缓存到磁盘
            buffer_count = sum(e.shape[0] for e in batch_buffer)
            if buffer_count >= commit_size or encoded >= total:
                chunk = np.vstack(batch_buffer)
                chunk_idx = len(list(cache_dir.glob("emb_*.npy")))
                np.save(str(cache_dir / f"emb_{chunk_idx:04d}.npy"), chunk)
                logger.info(f"缓存保存: chunk_{chunk_idx} ({chunk.shape[0]} 条), 累计 {encoded}/{total}")
                del chunk
                batch_buffer = []

        logger.info("所有 embeddings 编码完成，开始构建 FAISS 索引...")

        # ---- FAISS 构建阶段：从缓存文件分批加载并写入索引 ----
        new_index = faiss.IndexFlatIP(self.vector_size)

        cached_files = sorted(cache_dir.glob("emb_*.npy"))
        for i, cf in enumerate(cached_files):
            chunk = np.load(str(cf))
            new_index.add(chunk)
            logger.info(f"FAISS 写入: chunk {i + 1}/{len(cached_files)} ({chunk.shape[0]} 条, 索引总计 {new_index.ntotal})")
            del chunk  # 立即释放内存

        # 构建元数据
        new_metadata = {i: (data[i][0], data[i][1], data[i][2], data[i][3])
                        for i in range(len(data))}

        # ---- 原子替换 ----
        try:
            faiss.write_index(new_index, str(tmp_index_path))
            with open(tmp_meta_path, "wb") as f:
                pickle.dump(new_metadata, f)

            os.replace(str(tmp_index_path), str(self.index_path))
            os.replace(str(tmp_meta_path), str(self.meta_path))

            # 替换成功，更新内存中的索引
            self.faiss_index = new_index
            self.metadata = new_metadata

            # 清理缓存目录
            import shutil
            shutil.rmtree(str(cache_dir), ignore_errors=True)

            logger.info(f"✓ 向量索引构建完成: {total} 条记录（原子替换，缓存已清理）")
        except Exception as e:
            # 清理临时文件（保留缓存以便下次恢复）
            for tmp in (tmp_index_path, tmp_meta_path):
                try:
                    tmp.unlink(missing_ok=True)
                except Exception:
                    pass
            raise RuntimeError(f"向量索引原子替换失败: {e}") from e

    def incremental_update(self, data: List[Tuple[str, str, str, str, int]]):
        """
        增量更新索引

        Args:
            data: [(title, url, platform_id, date, id), ...]
        """
        self._ensure_available()

        if not data:
            return

        logger.debug(f"增量更新向量索引: {len(data)} 条")

        # 编码新数据
        texts = [item[0] for item in data]
        new_embeddings = self.encode_texts(texts)

        # 计算起始索引
        start_id = len(self.metadata)

        # 添加到索引
        self.faiss_index.add(new_embeddings)

        # 更新元数据
        for i, item in enumerate(data):
            self.metadata[start_id + i] = (item[0], item[1], item[2], item[3])

        # 保存到磁盘
        self._save_index()

    def _save_index(self):
        """保存索引到磁盘"""
        if not self._available or self.faiss_index is None:
            return

        faiss.write_index(self.faiss_index, str(self.index_path))

        with open(self.meta_path, "wb") as f:
            pickle.dump(self.metadata, f)

        logger.debug("向量索引已保存")

    def search(
        self,
        query: str,
        limit: int = 50,
        similarity_threshold: float = 0.5,
        platform_filter: Optional[List[str]] = None,
        date_filter: Optional[Tuple[str, str]] = None,
    ) -> List[VectorSearchResult]:
        """
        语义搜索

        Args:
            query: 搜索查询
            limit: 返回结果数量
            similarity_threshold: 相似度阈值
            platform_filter: 平台过滤
            date_filter: 日期范围过滤

        Returns:
            VectorSearchResult 列表
        """
        self._ensure_available()

        if self.faiss_index is None or self.faiss_index.ntotal == 0:
            logger.warning("向量索引为空")
            return []

        # 编码查询
        query_embedding = self.encode_texts([query])

        # 搜索（多取一些用于过滤）
        similarities, indices = self.faiss_index.search(query_embedding, limit * 2)

        results = []
        for rank, (idx, sim) in enumerate(zip(indices[0], similarities[0])):
            if idx < 0:
                continue

            if sim < similarity_threshold:
                break

            if idx not in self.metadata:
                continue

            title, url, platform_id, date = self.metadata[idx]

            # 应用过滤
            if platform_filter and platform_id not in platform_filter:
                continue
            if date_filter and (date < date_filter[0] or date > date_filter[1]):
                continue

            results.append(VectorSearchResult(
                title=title,
                url=url or "",
                platform_id=platform_id,
                date=date,
                rank=len(results) + 1,
                similarity=float(sim),
            ))

            if len(results) >= limit:
                break

        logger.debug(f"向量搜索 '{query}': 找到 {len(results)} 条结果")
        return results

    def clear(self):
        """清空索引"""
        if self._available:
            self._create_index()
            self._save_index()
            logger.info("向量索引已清空")

    def get_stats(self) -> dict:
        """获取索引统计信息"""
        if not self._available or self.faiss_index is None:
            return {"available": False}

        return {
            "available": True,
            "total_items": self.faiss_index.ntotal,
            "embedding_type": self._embedding_type,
            "embedding_model": "bailian-text-embedding-v4" if self._embedding_type == "bailian" else self.embedding_model_name,
            "vector_size": self.vector_size,
            "index_size_mb": round(
                (self.index_path.stat().st_size if self.index_path.exists() else 0) / (1024 * 1024), 2
            ),
        }