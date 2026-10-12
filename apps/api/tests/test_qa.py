import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.schemas.document import Chunk, NormalizedRect
from app.schemas.qa import AskRequest, AskResponse, BookCitation, WebCitation
from app.teach.qa import find_relevant_chunks, answer_grounded_question, generate_fallback_grounded_answer

client = TestClient(app)


def test_find_relevant_chunks_prioritizes_active_and_keywords():
    chunks = [
        Chunk(id="c1", doc_id="d1", ord=0, page_no=1, text="Introduction to Distributed Systems", rects=[NormalizedRect(x0=0.1, y0=0.1, x1=0.9, y1=0.2)]),
        Chunk(id="c2", doc_id="d1", ord=1, page_no=1, text="Consensus algorithms using Paxos and Raft", rects=[NormalizedRect(x0=0.1, y0=0.2, x1=0.9, y1=0.3)]),
        Chunk(id="c3", doc_id="d1", ord=2, page_no=2, text="Database indexing with B-Trees and LSM Trees", rects=[NormalizedRect(x0=0.1, y0=0.3, x1=0.9, y1=0.4)]),
    ]

    # Active chunk should be prioritized
    res = find_relevant_chunks(chunks, question="tell me about consensus", active_chunk_id="c2")
    assert res[0].id == "c2"

    # Keyword match for "indexing"
    res2 = find_relevant_chunks(chunks, question="how does database indexing work?")
    assert res2[0].id == "c3"


def test_deterministic_grounded_answer_structure():
    chunks = [
        Chunk(id="c1", doc_id="d1", ord=0, page_no=1, text="Normalized coordinate bounding boxes guarantee zero-drift highlights.", rects=[NormalizedRect(x0=0.1, y0=0.1, x1=0.9, y1=0.2)]),
        Chunk(id="c2", doc_id="d1", ord=1, page_no=2, text="Chatterbox TTS synthesizes 24kHz audio with emotional exaggeration.", rects=[NormalizedRect(x0=0.1, y0=0.2, x1=0.9, y1=0.3)]),
    ]

    answer_res = generate_fallback_grounded_answer(
        session_id="test-session",
        question="How does coordinate normalization work?",
        relevant_chunks=chunks,
        doc_title="RIFT Spec",
    )

    assert isinstance(answer_res, AskResponse)
    assert len(answer_res.book_citations) >= 2
    assert "[c1]" in answer_res.answer
    assert answer_res.book_citations[0].chunk_id == "c1"
    assert answer_res.book_citations[0].page_no == 1
    assert len(answer_res.web_citations) >= 1
    assert "http" in answer_res.web_citations[0].url


def test_ask_endpoint_json_and_streaming():
    # 1. Ingest sample document to have active document and session
    ingest_res = client.post("/documents/sample")
    assert ingest_res.status_code == 201
    doc_id = ingest_res.json()["data"]["id"]

    # 2. Create reading session
    session_res = client.post("/sessions", json={"doc_id": doc_id})
    assert session_res.status_code == 201
    session_id = session_res.json()["data"]["id"]

    # 3. Call POST /sessions/{id}/ask (JSON mode)
    ask_payload = {
        "question": "What is the primary coordinate contract for highlight overlays?",
        "active_chunk_id": f"{doc_id}-chunk-0",
    }
    json_res = client.post(f"/sessions/{session_id}/ask", json=ask_payload)
    assert json_res.status_code == 200
    json_data = json_res.json()
    assert json_data["success"] is True
    assert "answer" in json_data["data"]
    assert len(json_data["data"]["book_citations"]) > 0
    assert len(json_data["data"]["web_citations"]) > 0

    # 4. Call POST /sessions/{id}/ask (SSE Streaming mode)
    stream_res = client.post(f"/sessions/{session_id}/ask?stream=true", json=ask_payload)
    assert stream_res.status_code == 200
    assert "text/event-stream" in stream_res.headers["content-type"]
    stream_text = stream_res.text
    assert "event: token" in stream_text
    assert "event: citations" in stream_text
    assert "event: done" in stream_text
