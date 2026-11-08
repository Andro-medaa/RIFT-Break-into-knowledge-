"""Integration tests for document upload, multimodal ingestion, pgvector storage, and RAG Q&A.

Uses httpx.AsyncClient to test FastAPI asynchronous endpoints while sharing
the asyncio event loop with asyncpg / SQLAlchemy Core connection pool.
"""

import asyncio
import sys
import tempfile
from pathlib import Path

# Ensure apps/api directory is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from httpx import ASGITransport, AsyncClient
from app.main import app


async def run_integration_tests():
    print("Running document & RAG route integration tests (AsyncClient)...")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Health check with database table status & pgvector check (with retry for DNS fluctuations)
        for attempt in range(4):
            resp = await client.get("/health")
            data = resp.json()
            if data["status"] == "healthy":
                break
            await asyncio.sleep(1.5)

        assert resp.status_code == 200
        assert data["status"] == "healthy"
        assert data["database"]["connected"] is True
        assert data["database"]["tables"]["documents"] is True
        assert data["database"]["tables"]["document_chunks"] is True
        assert data["database"]["pgvector"] is True
        print("  [OK] Health check verified (documents & document_chunks tables + pgvector active)")

        # 2. Invalid file rejection
        with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as f:
            f.write(b"This is not a PDF")
            invalid_path = f.name

        try:
            bad_resp = await client.post(
                "/api/documents/upload-by-address",
                json={"file_address": invalid_path},
                headers={"X-Owner-Id": "test_user"},
            )
            assert bad_resp.status_code == 400
            print("  [OK] Invalid file rejection (400 Bad Request)")
        finally:
            Path(invalid_path).unlink(missing_ok=True)

        # 3. Valid PDF upload with optional instruction
        custom_pdf = Path("C:/Users/sahoo/Desktop/RIFT/viva_answers (1).pdf")
        created_temp = False

        if custom_pdf.exists():
            test_pdf_path = str(custom_pdf)
            print(f"  [INFO] Using existing PDF: {custom_pdf.name}")
        else:
            pdf_bytes = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< >>\n%%EOF\n"
            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
                f.write(pdf_bytes)
                test_pdf_path = f.name
            created_temp = True
            print(f"  [INFO] Using temporary PDF: {test_pdf_path}")

        owner_id = "test_user_rag_01"
        test_instruction = "Focus especially on deep learning and tumor annotation methodology."

        try:
            # Upload by address with instruction
            up_resp = await client.post(
                "/api/documents/upload-by-address",
                json={"file_address": test_pdf_path, "instruction": test_instruction},
                headers={"X-Owner-Id": owner_id},
            )
            assert up_resp.status_code == 201
            up_data = up_resp.json()

            assert "id" in up_data
            assert "file_url" in up_data
            assert up_data["file_url"].startswith("https://")
            assert up_data["mime_type"] == "application/pdf"
            assert up_data["owner_id"] == owner_id

            doc_id = up_data["id"]
            file_url = up_data["file_url"]
            print(f"  [OK] Upload successful! Doc ID: {doc_id}")

            # Verify middleware headers
            assert "x-request-id" in up_resp.headers
            assert "x-process-time-ms" in up_resp.headers
            print("  [OK] Middleware headers verified (X-Request-ID, X-Process-Time-Ms)")

            # 4. Trigger multimodal ingestion
            ingest_resp = await client.post(
                f"/api/documents/{doc_id}/ingest",
                params={"instruction": test_instruction},
                headers={"X-Owner-Id": owner_id},
            )
            assert ingest_resp.status_code == 200
            ingest_data = ingest_resp.json()
            assert ingest_data["chunks_count"] > 0
            print(
                f"  [OK] Ingestion pipeline: generated {ingest_data['chunks_count']} chunks "
                f"({ingest_data['text_chunks']} text, {ingest_data['table_chunks']} tables, {ingest_data['image_chunks']} images)"
            )

            # 5. Fetch document chunks with normalized bounding boxes
            chunks_resp = await client.get(f"/api/documents/{doc_id}/chunks", headers={"X-Owner-Id": owner_id})
            assert chunks_resp.status_code == 200
            chunks = chunks_resp.json()
            assert len(chunks) == ingest_data["chunks_count"]
            first_chunk = chunks[0]
            assert "bbox" in first_chunk
            assert "x" in first_chunk["bbox"] and "y" in first_chunk["bbox"]
            assert 0.0 <= first_chunk["bbox"]["x"] <= 1.0
            print(f"  [OK] Extracted chunks: verified normalized bounding box coords (x={first_chunk['bbox']['x']}, y={first_chunk['bbox']['y']})")

            # 6. RAG Q&A query with citation generation
            query_resp = await client.post(
                f"/api/documents/{doc_id}/query",
                json={
                    "question": "What is a hybrid pipeline or generalist model?",
                    "instruction": test_instruction,
                },
                headers={"X-Owner-Id": owner_id},
            )
            assert query_resp.status_code == 200
            q_data = query_resp.json()
            assert "answer" in q_data and len(q_data["answer"]) > 10
            assert len(q_data["citations"]) > 0
            first_cit = q_data["citations"][0]
            assert "page" in first_cit
            assert "bbox" in first_cit
            print(f"  [OK] RAG Q&A verified: answer generated with {len(q_data['citations'])} clickable citation(s)")

            # 7. Delete document (cascades to chunks via foreign key)
            del_resp = await client.delete(f"/api/documents/{doc_id}", headers={"X-Owner-Id": owner_id})
            assert del_resp.status_code == 200
            print("  [OK] Delete document: successfully removed from storage & database")

            # Verify chunks were cascaded / removed
            post_del_chunks = await client.get(f"/api/documents/{doc_id}/chunks", headers={"X-Owner-Id": owner_id})
            assert len(post_del_chunks.json()) == 0
            print("  [OK] Cascade verified: document_chunks cleanly cleared")

        finally:
            if created_temp:
                Path(test_pdf_path).unlink(missing_ok=True)

    print("\nAll integration tests passed successfully with 0 errors!")


if __name__ == "__main__":
    asyncio.run(run_integration_tests())
