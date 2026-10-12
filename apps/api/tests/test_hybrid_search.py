import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.schemas.document import Chunk, NormalizedRect
from app.providers.embeddings import (
    DeterministicEmbeddingProvider,
    cosine_similarity,
    EMBEDDING_DIM,
)
from app.search.hybrid import HybridSearchEngine, GLOBAL_SEARCH_ENGINE

client = TestClient(app)


def test_embedding_dimensions_and_cosine_similarity():
    provider = DeterministicEmbeddingProvider(dim=768)
    vec1 = provider.embed_text("Deep neural networks with cross-attention")
    vec2 = provider.embed_text("Attention mechanism in transformer architectures")
    vec3 = provider.embed_text("Culinary recipes for Italian pasta sauce")

    assert len(vec1) == EMBEDDING_DIM
    assert len(vec2) == EMBEDDING_DIM

    # Similar concepts should have higher cosine similarity than unrelated recipes
    sim_related = cosine_similarity(vec1, vec2)
    sim_unrelated = cosine_similarity(vec1, vec3)

    assert sim_related > sim_unrelated
    assert -1.0 <= sim_related <= 1.0


def test_hybrid_search_rrf_ranking():
    engine = HybridSearchEngine(embedding_provider=DeterministicEmbeddingProvider(dim=768))

    chunks = [
        Chunk(
            id="c1",
            doc_id="doc-test",
            ord=0,
            page_no=1,
            text="The fundamental theorem of representation geometry states that continuous activations are bounded.",
            rects=[NormalizedRect(x0=0.1, y0=0.1, x1=0.9, y1=0.2)],
        ),
        Chunk(
            id="c2",
            doc_id="doc-test",
            ord=1,
            page_no=2,
            text="Cross-attention alignment matrices dynamically align auditory speech tokens with document text.",
            rects=[NormalizedRect(x0=0.1, y0=0.2, x1=0.9, y1=0.3)],
        ),
        Chunk(
            id="c3",
            doc_id="doc-test",
            ord=2,
            page_no=3,
            text="Silero ONNX models achieve sub-50ms client-side voice activity detection for instant barge-in.",
            rects=[NormalizedRect(x0=0.1, y0=0.3, x1=0.9, y1=0.4)],
        ),
    ]

    engine.index_document("doc-test", chunks)

    # 1. Hybrid Search
    res_hybrid = engine.search("doc-test", query="cross attention alignment tokens", mode="hybrid")
    assert res_hybrid.total_hits == 3
    assert len(res_hybrid.hits) > 0
    assert res_hybrid.hits[0].chunk_id == "c2"
    assert res_hybrid.hits[0].rrf_score > 0

    # 2. Vector-only Search
    res_vec = engine.search("doc-test", query="voice detection silence", mode="vector")
    assert res_vec.hits[0].chunk_id == "c3"

    # 3. BM25-only Search
    res_bm25 = engine.search("doc-test", query="representation geometry", mode="bm25")
    assert res_bm25.hits[0].chunk_id == "c1"


def test_postgres_sql_generation():
    engine = HybridSearchEngine()
    sql = engine.generate_postgres_sql("doc-123", "attention alignment", limit=5)

    assert "embedding <=> :query_embedding" in sql
    assert "ts_rank_cd(tsv" in sql
    assert "COALESCE(1.0 / (60 + v.v_rank), 0.0)" in sql
    assert "FULL OUTER JOIN" in sql


def test_search_api_endpoint():
    # Ingest sample document
    ingest_res = client.post("/documents/sample")
    assert ingest_res.status_code == 201
    doc_id = ingest_res.json()["data"]["id"]

    # Call search endpoint
    search_payload = {
        "query": "bounding box fractional coordinates",
        "limit": 3,
        "mode": "hybrid",
    }
    search_res = client.post(f"/documents/{doc_id}/search", json=search_payload)
    assert search_res.status_code == 200
    data = search_res.json()
    assert data["success"] is True
    assert len(data["data"]["hits"]) > 0
    assert data["data"]["hits"][0]["rrf_score"] > 0
    assert "chunk_id" in data["data"]["hits"][0]
