import math
import re
from typing import Dict, List, Literal, Optional, Tuple
from pydantic import BaseModel, Field

from app.schemas.document import Chunk
from app.providers.embeddings import (
    EmbeddingProvider,
    cosine_similarity,
    get_embedding_provider,
)

SearchMode = Literal["hybrid", "vector", "bm25"]


class SearchHit(BaseModel):
    chunk_id: str
    doc_id: str
    ord: int
    page_no: int
    text: str
    rrf_score: float = Field(..., description="Reciprocal Rank Fusion combined score")
    vector_rank: Optional[int] = Field(default=None, description="1-based rank in vector search")
    bm25_rank: Optional[int] = Field(default=None, description="1-based rank in keyword search")
    cosine_sim: float = Field(default=0.0, description="Raw cosine similarity (0.0 to 1.0)")


class SearchResponse(BaseModel):
    query: str
    mode: SearchMode
    total_hits: int
    hits: List[SearchHit]


class InMemoryBM25Index:
    """Lightweight in-memory BM25 index for fast local execution and tests."""

    def __init__(self, k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.corpus: List[Chunk] = []
        self.doc_len: List[int] = []
        self.avg_dl: float = 0.0
        self.doc_freqs: Dict[str, int] = {}
        self.term_freqs: List[Dict[str, int]] = []

    def index(self, chunks: List[Chunk]):
        self.corpus = chunks
        self.doc_len = []
        self.term_freqs = []
        self.doc_freqs = {}

        total_words = 0
        for c in chunks:
            tokens = self._tokenize(c.text)
            dl = len(tokens)
            self.doc_len.append(dl)
            total_words += dl

            tf: Dict[str, int] = {}
            for t in tokens:
                tf[t] = tf.get(t, 0) + 1
            self.term_freqs.append(tf)

            for t in set(tokens):
                self.doc_freqs[t] = self.doc_freqs.get(t, 0) + 1

        self.avg_dl = (total_words / len(chunks)) if chunks else 1.0

    def search(self, query: str, top_k: int = 10) -> List[Tuple[int, float]]:
        """Returns sorted list of (chunk_index, score)."""
        if not self.corpus:
            return []

        q_tokens = self._tokenize(query)
        if not q_tokens:
            return []

        scores: List[Tuple[int, float]] = []
        N = len(self.corpus)

        for i in range(N):
            score = 0.0
            dl = self.doc_len[i]
            tf_doc = self.term_freqs[i]

            for q in q_tokens:
                if q not in tf_doc:
                    continue
                df = self.doc_freqs.get(q, 0)
                # Standard Lucene/BM25 IDF
                idf = math.log(1.0 + (N - df + 0.5) / (df + 0.5))
                freq = tf_doc[q]
                numerator = freq * (self.k1 + 1.0)
                denominator = freq + self.k1 * (1.0 - self.b + self.b * (dl / self.avg_dl))
                score += idf * (numerator / denominator)

            scores.append((i, score))

        scores.sort(key=lambda x: x[1], reverse=True)
        return scores[:top_k]

    @staticmethod
    def _tokenize(text: str) -> List[str]:
        return [t.lower() for t in re.findall(r"\w+", text) if len(t) > 1]


class HybridSearchEngine:
    """
    Hybrid Search Engine combining:
    1. BM25 keyword matching (exact and lexical recall)
    2. 768-dim vector embeddings (semantic and conceptual recall)
    3. Reciprocal Rank Fusion (RRF) with configurable k factor
    """

    def __init__(
        self,
        embedding_provider: Optional[EmbeddingProvider] = None,
        rrf_k: int = 60,
    ):
        self.embedding_provider = embedding_provider or get_embedding_provider()
        self.rrf_k = rrf_k
        self.doc_chunks: Dict[str, List[Chunk]] = {}
        self.doc_embeddings: Dict[str, List[List[float]]] = {}
        self.bm25_indices: Dict[str, InMemoryBM25Index] = {}

    def index_document(self, doc_id: str, chunks: List[Chunk]):
        """Index a document's chunks into both vector and BM25 search spaces."""
        self.doc_chunks[doc_id] = chunks

        # 1. Index BM25
        bm25 = InMemoryBM25Index()
        bm25.index(chunks)
        self.bm25_indices[doc_id] = bm25

        # 2. Index Embeddings
        texts = [c.text for c in chunks]
        embeddings = self.embedding_provider.embed_batch(texts)
        self.doc_embeddings[doc_id] = embeddings

    def search(
        self,
        doc_id: str,
        query: str,
        limit: int = 5,
        mode: SearchMode = "hybrid",
    ) -> SearchResponse:
        """Execute hybrid, vector, or BM25 search over a document."""
        chunks = self.doc_chunks.get(doc_id, [])
        if not chunks:
            return SearchResponse(query=query, mode=mode, total_hits=0, hits=[])

        # 1. Vector Search
        q_emb = self.embedding_provider.embed_text(query)
        doc_embs = self.doc_embeddings.get(doc_id, [])

        vec_scored = []
        for idx, emb in enumerate(doc_embs):
            sim = cosine_similarity(q_emb, emb)
            vec_scored.append((idx, sim))
        vec_scored.sort(key=lambda x: x[1], reverse=True)

        vector_ranks: Dict[int, Tuple[int, float]] = {
            chunk_idx: (rank + 1, sim)
            for rank, (chunk_idx, sim) in enumerate(vec_scored)
        }

        # 2. BM25 Search
        bm25_index = self.bm25_indices.get(doc_id)
        bm25_ranks: Dict[int, int] = {}
        if bm25_index:
            bm25_hits = bm25_index.search(query, top_k=len(chunks))
            for rank, (chunk_idx, _) in enumerate(bm25_hits):
                bm25_ranks[chunk_idx] = rank + 1

        # 3. Combine with Reciprocal Rank Fusion (RRF)
        hits: List[SearchHit] = []

        for idx, chunk in enumerate(chunks):
            v_rank, sim = vector_ranks.get(idx, (9999, 0.0))
            b_rank = bm25_ranks.get(idx, 9999)

            if mode == "vector":
                rrf = sim
            elif mode == "bm25":
                rrf = 1.0 / (self.rrf_k + b_rank)
            else:  # hybrid RRF
                rrf = (1.0 / (self.rrf_k + v_rank)) + (1.0 / (self.rrf_k + b_rank))

            hits.append(
                SearchHit(
                    chunk_id=chunk.id,
                    doc_id=chunk.doc_id,
                    ord=chunk.ord,
                    page_no=chunk.page_no,
                    text=chunk.text,
                    rrf_score=round(rrf, 6),
                    vector_rank=v_rank if v_rank < 9999 else None,
                    bm25_rank=b_rank if b_rank < 9999 else None,
                    cosine_sim=round(sim, 4),
                )
            )

        hits.sort(key=lambda x: x.rrf_score, reverse=True)
        top_hits = hits[:limit]

        return SearchResponse(
            query=query,
            mode=mode,
            total_hits=len(chunks),
            hits=top_hits,
        )

    def generate_postgres_sql(self, doc_id: str, query: str, limit: int = 5) -> str:
        """
        Generates production PostgreSQL + pgvector query combining:
        ts_rank(tsv) and cosine distance <=> with Reciprocal Rank Fusion.
        """
        escaped_query = query.replace("'", "''")
        return f"""
WITH vector_search AS (
    SELECT id, ord, page_no, text,
           ROW_NUMBER() OVER (ORDER BY embedding <=> :query_embedding) AS v_rank,
           1 - (embedding <=> :query_embedding) AS cosine_sim
    FROM chunks
    WHERE doc_id = '{doc_id}'
    LIMIT 20
),
keyword_search AS (
    SELECT id, ord, page_no, text,
           ROW_NUMBER() OVER (ORDER BY ts_rank_cd(tsv, plainto_tsquery('english', '{escaped_query}')) DESC) AS k_rank
    FROM chunks
    WHERE doc_id = '{doc_id}' AND tsv @@ plainto_tsquery('english', '{escaped_query}')
    LIMIT 20
)
SELECT COALESCE(v.id, k.id) AS chunk_id,
       COALESCE(v.ord, k.ord) AS ord,
       COALESCE(v.page_no, k.page_no) AS page_no,
       COALESCE(v.text, k.text) AS text,
       (COALESCE(1.0 / (60 + v.v_rank), 0.0) + COALESCE(1.0 / (60 + k.k_rank), 0.0)) AS rrf_score,
       v.v_rank AS vector_rank,
       k.k_rank AS bm25_rank,
       COALESCE(v.cosine_sim, 0.0) AS cosine_sim
FROM vector_search v
FULL OUTER JOIN keyword_search k ON v.id = k.id
ORDER BY rrf_score DESC
LIMIT {limit};
""".strip()


# Global search engine instance
GLOBAL_SEARCH_ENGINE = HybridSearchEngine()
