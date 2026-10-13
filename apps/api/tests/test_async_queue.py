import io
import fitz
import pytest
from app.queue.job import job_queue_manager
from app.routes.documents import DOCUMENTS_STORE


def create_test_pdf_bytes(title: str = "Async Deep Learning Textbook") -> bytes:
    doc = fitz.open()
    p1 = doc.new_page(width=600, height=800)
    p1.insert_text(fitz.Point(50, 70), title, fontsize=18)
    p1.insert_text(fitz.Point(50, 110), "Asynchronous processing distributes ingestion load.", fontsize=11)
    
    p2 = doc.new_page(width=600, height=800)
    p2.insert_text(fitz.Point(50, 70), "Chapter 2: Queue Workers & Backpressure", fontsize=18)
    p2.insert_text(fitz.Point(50, 110), "Server-Sent Events provide real-time updates to client UI.", fontsize=11)
    
    pdf_bytes = doc.write()
    doc.close()
    return pdf_bytes


def test_async_upload_enqueues_job_and_completes(client):
    pdf_bytes = create_test_pdf_bytes("Async Processing Manual")
    files = {"file": ("manual.pdf", io.BytesIO(pdf_bytes), "application/pdf")}

    # 1. Enqueue job via POST /documents/async
    res = client.post("/documents/async", files=files)
    assert res.status_code == 202
    body = res.json()
    assert body["success"] is True
    data = body["data"]
    assert "job_id" in data
    assert "doc_id" in data
    assert data["status"] == "queued"
    assert "/documents/" in data["progress_url"]

    doc_id = data["doc_id"]
    job_id = data["job_id"]

    # 2. Check job status endpoint
    status_res = client.get(f"/documents/{doc_id}/job")
    assert status_res.status_code == 200
    job_data = status_res.json()["data"]
    assert job_data["job_id"] == job_id
    assert job_data["doc_id"] == doc_id

    # 3. Verify job completed
    job = job_queue_manager.get_job(job_id)
    assert job is not None
    assert job.status == "completed"
    assert job.progress == 100
    assert job.page_count == 2
    assert job.chunks_count is not None and job.chunks_count > 0

    # 4. Document must now exist in store and chunks endpoint must return chunks
    doc_res = client.get(f"/documents/{doc_id}")
    assert doc_res.status_code == 200
    assert doc_res.json()["data"]["id"] == doc_id

    chunks_res = client.get(f"/documents/{doc_id}/chunks")
    assert chunks_res.status_code == 200
    chunks = chunks_res.json()["data"]
    assert len(chunks) == job.chunks_count


def test_job_not_found_returns_404(client):
    res = client.get("/documents/nonexistent_doc_id/job")
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


def test_sse_progress_stream_yields_events(client):
    pdf_bytes = create_test_pdf_bytes("Streaming Progress Textbook")
    files = {"file": ("streaming.pdf", io.BytesIO(pdf_bytes), "application/pdf")}

    res = client.post("/documents/async", files=files)
    assert res.status_code == 202
    doc_id = res.json()["data"]["doc_id"]

    # Open streaming connection
    with client.stream("GET", f"/documents/{doc_id}/progress") as stream_res:
        assert stream_res.status_code == 200
        assert "text/event-stream" in stream_res.headers["content-type"]
        
        # Read initial SSE frames
        lines = []
        for line in stream_res.iter_lines():
            if line:
                lines.append(line)
            if len(lines) >= 2:
                break

        assert any("event:" in l for l in lines)
        assert any("data:" in l for l in lines)
