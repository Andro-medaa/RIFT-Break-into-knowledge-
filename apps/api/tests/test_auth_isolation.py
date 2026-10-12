import io
import fitz
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def create_mini_pdf_bytes(title: str = "Private Research") -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    page.insert_text(fitz.Point(72, 100), f"Confidential Document: {title}", fontsize=16)
    page.insert_text(fitz.Point(72, 140), "Proprietary algorithmic secrets and architectural designs.", fontsize=11)
    b = doc.write()
    doc.close()
    return b


def test_public_sample_accessible_by_all():
    # Public sample document has owner_id = None
    ingest_res = client.post("/documents/sample")
    assert ingest_res.status_code == 201
    doc_id = ingest_res.json()["data"]["id"]

    # Guest user can view it
    guest_res = client.get(f"/documents/{doc_id}")
    assert guest_res.status_code == 200

    # Authenticated user can view it
    auth_res = client.get(
        f"/documents/{doc_id}",
        headers={"Authorization": "Bearer user-student-1"},
    )
    assert auth_res.status_code == 200


def test_multi_tenant_private_document_isolation():
    pdf_bytes = create_mini_pdf_bytes(title="User A Quantum Thesis")
    files = {"file": ("quantum.pdf", io.BytesIO(pdf_bytes), "application/pdf")}

    # 1. User A uploads a private document
    upload_res = client.post(
        "/documents",
        files=files,
        headers={"Authorization": "Bearer user-student-1"},
    )
    assert upload_res.status_code == 201
    doc_data = upload_res.json()["data"]
    doc_id = doc_data["id"]
    assert doc_data["owner_id"] == "user-student-1"

    # 2. User A can access their own document
    owner_get_res = client.get(
        f"/documents/{doc_id}",
        headers={"Authorization": "Bearer user-student-1"},
    )
    assert owner_get_res.status_code == 200

    owner_chunks_res = client.get(
        f"/documents/{doc_id}/chunks",
        headers={"Authorization": "Bearer user-student-1"},
    )
    assert owner_chunks_res.status_code == 200

    owner_search_res = client.post(
        f"/documents/{doc_id}/search",
        json={"query": "quantum secrets"},
        headers={"Authorization": "Bearer user-student-1"},
    )
    assert owner_search_res.status_code == 200

    # 3. User B attempts to access User A's document -> 403 Forbidden
    other_user_get_res = client.get(
        f"/documents/{doc_id}",
        headers={"Authorization": "Bearer user-student-2"},
    )
    assert other_user_get_res.status_code == 403

    other_user_chunks_res = client.get(
        f"/documents/{doc_id}/chunks",
        headers={"Authorization": "Bearer user-student-2"},
    )
    assert other_user_chunks_res.status_code == 403

    other_user_search_res = client.post(
        f"/documents/{doc_id}/search",
        json={"query": "quantum secrets"},
        headers={"Authorization": "Bearer user-student-2"},
    )
    assert other_user_search_res.status_code == 403

    # 4. Anonymous Guest user attempts to access User A's document -> 403 Forbidden
    guest_access_res = client.get(f"/documents/{doc_id}")
    assert guest_access_res.status_code == 403
