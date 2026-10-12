import pytest
from app.schemas.document import Chunk, BoundingBox
from app.teach.splitter import split_into_sentences
from app.teach.planner import plan_lesson, generate_heuristic_lesson, VALID_MOVES
from app.routes.documents import DOCUMENTS_STORE
from app.ingest.parse import DocumentParsed


def test_sentence_splitter_basic():
    text = "Welcome to deep learning. Today we will explore neural networks! Are you excited?"
    sentences = split_into_sentences(text)
    assert len(sentences) == 3
    assert sentences[0].text == "Welcome to deep learning."
    assert sentences[1].text == "Today we will explore neural networks!"
    assert sentences[2].text == "Are you excited?"
    for s in sentences:
        assert s.duration_estimate_ms >= 800


def test_sentence_splitter_handles_abbreviations():
    text = "Dr. Smith stated that e.g. neural networks outperform linear models. See Fig. 1 for details."
    sentences = split_into_sentences(text)
    # "Dr." and "e.g." should not trigger false sentence splits
    assert len(sentences) == 2
    assert "Dr. Smith" in sentences[0].text
    assert "Fig. 1" in sentences[1].text


def test_heuristic_lesson_moves_and_chunks():
    chunks = [
        Chunk(
            id="c1",
            doc_id="doc1",
            ord=0,
            page_no=1,
            rects=[BoundingBox(x0=0.1, y0=0.1, x1=0.9, y1=0.2)],
            kind="paragraph",
            text="High-dimensional representations project onto compact manifolds.",
        ),
        Chunk(
            id="c2",
            doc_id="doc1",
            ord=1,
            page_no=1,
            rects=[BoundingBox(x0=0.1, y0=0.25, x1=0.9, y1=0.35)],
            kind="paragraph",
            text="Normalized coordinate simplices decouple rendering from device pixels.",
        ),
    ]

    segments = generate_heuristic_lesson("doc1", chunks, "Geometry of Deep Learning")
    assert len(segments) >= 4  # intro + chunk 1 + chunk 2 + recap
    assert segments[0].move == "intro"
    assert segments[-1].move == "recap"

    for seg in segments:
        assert seg.move in VALID_MOVES
        assert len(seg.sentences) > 0
        assert seg.doc_id == "doc1"
        assert len(seg.script) > 10
        # Verify no markdown asterisks or hash headers in spoken script
        assert "**" not in seg.script
        assert "#" not in seg.script


def test_session_lifecycle_and_endpoints(client):
    # 1. Ingest sample document first
    sample_res = client.post("/documents/sample")
    assert sample_res.status_code == 201
    doc_id = sample_res.json()["data"]["id"]

    # 2. Create session
    session_res = client.post("/sessions", json={"doc_id": doc_id})
    assert session_res.status_code == 201
    session_data = session_res.json()["data"]
    session_id = session_data["id"]
    assert session_data["doc_id"] == doc_id
    assert session_data["seg_ord"] == 0
    assert session_data["sent_idx"] == 0

    # 3. Generate plan
    plan_res = client.post(f"/sessions/{session_id}/plan")
    assert plan_res.status_code == 200
    plan_data = plan_res.json()["data"]
    segments = plan_data["segments"]
    assert len(segments) > 0
    assert segments[0]["move"] == "intro"

    # 4. Fetch segments with pagination
    seg_res = client.get(f"/sessions/{session_id}/segments?from_ord=0&count=3")
    assert seg_res.status_code == 200
    seg_data = seg_res.json()["data"]
    assert len(seg_data) <= 3

    # 5. Update cursor
    cursor_res = client.patch(
        f"/sessions/{session_id}/cursor",
        json={"seg_ord": 2, "sent_idx": 1},
    )
    assert cursor_res.status_code == 200
    updated_session = cursor_res.json()["data"]
    assert updated_session["seg_ord"] == 2
    assert updated_session["sent_idx"] == 1
