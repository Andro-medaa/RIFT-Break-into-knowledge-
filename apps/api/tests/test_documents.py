import io
import fitz
import pytest
from app.ingest.parse import parse_pdf_bytes

def create_sample_pdf_bytes() -> bytes:
    """Create a minimal valid multi-page PDF in memory for hermetic testing."""
    doc = fitz.open()

    # Page 1
    page1 = doc.new_page(width=595, height=842)
    page1.insert_text(fitz.Point(50, 80), "Chapter 1: Foundations of Artificial Intelligence", fontsize=18)
    page1.insert_text(fitz.Point(50, 130), "Artificial intelligence has undergone profound transformations across the past decade.", fontsize=11)
    page1.insert_text(fitz.Point(50, 160), "Deep representation learning utilizes normalized vector projections for scale invariance.", fontsize=11)
    page1.insert_text(fitz.Point(50, 190), "When multi-dimensional embeddings are aligned, semantic similarity can be computed via cosine distance.", fontsize=11)

    # Page 2
    page2 = doc.new_page(width=595, height=842)
    page2.insert_text(fitz.Point(50, 80), "Chapter 1.2: Cross-Attention Mechanisms", fontsize=18)
    page2.insert_text(fitz.Point(50, 130), "Cross-attention aligns auditory speech tokens directly with physical document coordinates.", fontsize=11)
    page2.insert_text(fitz.Point(50, 160), "Pedagogical tutoring requires sub-300ms speech interruption for natural conversational interaction.", fontsize=11)

    pdf_bytes = doc.write()
    doc.close()
    return pdf_bytes

def test_parse_pdf_bytes_normalization():
    pdf_bytes = create_sample_pdf_bytes()
    parsed = parse_pdf_bytes(pdf_bytes, filename="test_book.pdf")

    assert parsed.page_count == 2
    assert len(parsed.chunks) >= 2

    # Verify coordinate contract: all rects in [0.0, 1.0]
    for chunk in parsed.chunks:
        assert len(chunk.rects) > 0
        assert 1 <= chunk.page_no <= 2
        assert chunk.word_count > 0
        for r in chunk.rects:
            assert 0.0 <= r.x0 <= 1.0
            assert 0.0 <= r.y0 <= 1.0
            assert 0.0 <= r.x1 <= 1.0
            assert 0.0 <= r.y1 <= 1.0
            assert r.x0 <= r.x1
            assert r.y0 <= r.y1

    # Verify heading detected
    kinds = [c.kind for c in parsed.chunks]
    assert "heading" in kinds

def test_upload_and_get_chunks_endpoint(client):
    pdf_bytes = create_sample_pdf_bytes()
    files = {"file": ("geometry_ai.pdf", io.BytesIO(pdf_bytes), "application/pdf")}

    # 1. Upload document
    upload_resp = client.post("/documents", files=files)
    assert upload_resp.status_code == 201
    upload_data = upload_resp.json()
    assert upload_data["success"] is True
    doc_id = upload_data["data"]["id"]
    assert upload_data["data"]["page_count"] == 2
    assert upload_data["data"]["chunks_count"] > 0

    # 2. Get document chunks
    chunks_resp = client.get(f"/documents/{doc_id}/chunks")
    assert chunks_resp.status_code == 200
    chunks_data = chunks_resp.json()
    assert chunks_data["success"] is True
    assert len(chunks_data["data"]) > 0

    # 3. Filter chunks by page
    page1_resp = client.get(f"/documents/{doc_id}/chunks?page_no=1")
    assert page1_resp.status_code == 200
    page1_chunks = page1_resp.json()["data"]
    assert len(page1_chunks) > 0
    for c in page1_chunks:
        assert c["page_no"] == 1

def test_upload_invalid_file(client):
    files = {"file": ("malicious.exe", io.BytesIO(b"not a pdf"), "application/octet-stream")}
    resp = client.post("/documents", files=files)
    assert resp.status_code == 400
    assert "Only PDF documents" in resp.json()["detail"]

def test_create_and_ingest_sample(client):
    resp = client.post("/documents/sample")
    assert resp.status_code == 201
    data = resp.json()
    assert data["success"] is True
    assert data["data"]["page_count"] == 3
    assert data["data"]["chunks_count"] > 0
    doc_id = data["data"]["id"]

    # Verify chunks endpoint returns real PyMuPDF normalized rects
    chunks_resp = client.get(f"/documents/{doc_id}/chunks")
    assert chunks_resp.status_code == 200
    chunks = chunks_resp.json()["data"]
    assert len(chunks) > 0
    for c in chunks:
        for r in c["rects"]:
            assert 0.0 <= r["x0"] <= 1.0
            assert 0.0 <= r["y0"] <= 1.0

