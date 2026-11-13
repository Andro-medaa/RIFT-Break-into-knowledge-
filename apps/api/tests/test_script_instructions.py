"""Tests for instruction-driven script generation, persistence, caching, and API routes."""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from httpx import ASGITransport, AsyncClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.main import app
from app.services.script import ScriptService


def _sample_chunks() -> list[dict]:
    return [
        {
            "id": "c1",
            "chunk_index": 0,
            "content": "Abstract: We study neural representation collapse and summarize benchmark accuracy across datasets.",
            "page_number": 1,
            "bbox": {"x": 0.1, "y": 0.1, "w": 0.8, "h": 0.1},
        },
        {
            "id": "c2",
            "chunk_index": 1,
            "content": "Related Work: Earlier heuristic clustering methods struggled on noisy biomedical imagery.",
            "page_number": 2,
            "bbox": {"x": 0.1, "y": 0.2, "w": 0.8, "h": 0.1},
        },
        {
            "id": "c3",
            "chunk_index": 2,
            "content": "Section 2 Notation: Let covariance_regularization L_cov enforce orthogonal eigen_spectrum stability.",
            "page_number": 2,
            "bbox": {"x": 0.1, "y": 0.5, "w": 0.8, "h": 0.12},
        },
        {
            "id": "c4",
            "chunk_index": 3,
            "content": "Section 3 Methodology: Our VICReg trainer minimizes covariance_regularization L_cov over eigen_spectrum batches.",
            "page_number": 3,
            "bbox": {"x": 0.1, "y": 0.15, "w": 0.8, "h": 0.15},
        },
        {
            "id": "c5",
            "chunk_index": 4,
            "content": "Appendix Acknowledgments: Thanks to grant agencies and lab coffee sponsors.",
            "page_number": 5,
            "bbox": {"x": 0.1, "y": 0.7, "w": 0.8, "h": 0.08},
        },
    ]


class ScriptInstructionTests(unittest.IsolatedAsyncioTestCase):
    def test_instruction_persistence_and_cache_separation(self):
        with tempfile.TemporaryDirectory() as tmp:
            svc = ScriptService(data_dir=Path(tmp))
            self.assertIsNone(svc.get_document_instruction("doc-1", "owner-a"))

            saved = svc.save_document_instruction("doc-1", "owner-a", "  Focus on methodology  ")
            self.assertEqual(saved, "Focus on methodology")
            self.assertEqual(svc.get_document_instruction("doc-1", "owner-a"), "Focus on methodology")
            self.assertIsNone(svc.get_document_instruction("doc-1", "owner-b"))

            default_cache = svc._get_cache_file("doc-1", "en", "natural", None)
            guided_cache = svc._get_cache_file("doc-1", "en", "natural", saved)
            self.assertNotEqual(default_cache, guided_cache)

            svc.save_document_instruction("doc-1", "owner-a", "   ")
            self.assertIsNone(svc.get_document_instruction("doc-1", "owner-a"))

            svc.save_document_instruction("doc-1", "owner-a", "Short tone")
            guided_cache.write_text("{}", encoding="utf-8")
            svc.clear_document_artifacts("doc-1")
            self.assertIsNone(svc.get_document_instruction("doc-1", "owner-a"))
            self.assertFalse(guided_cache.exists())

    def test_heuristic_planner_selective_scope_with_smart_cross_links(self):
        with tempfile.TemporaryDirectory() as tmp:
            svc = ScriptService(data_dir=Path(tmp))
            chunks = _sample_chunks()

            planned, _ = svc._heuristic_plan_for_instruction(
                chunks,
                "Cover only page 3 methodology and any connected concepts, skip acknowledgments",
            )
            planned_ids = [item.chunk_id for item in planned]
            self.assertIn("c4", planned_ids)
            self.assertIn("c3", planned_ids)
            self.assertTrue(any(item.chunk_id == "c3" and item.role == "linked_context" for item in planned))
            self.assertNotIn("c2", planned_ids)
            self.assertNotIn("c5", planned_ids)

            styled_plan, _ = svc._heuristic_plan_for_instruction(
                chunks,
                "Use a witty podcast tone in reverse order",
            )
            self.assertEqual([p.chunk_id for p in styled_plan], ["c5", "c4", "c3", "c2", "c1"])

    async def test_generate_script_obeys_instruction_sequence_and_linked_scope(self):
        with tempfile.TemporaryDirectory() as tmp:
            svc = ScriptService(data_dir=Path(tmp))
            chunks = _sample_chunks()
            svc.save_document_instruction(
                "doc-99",
                "owner-1",
                "Explain Section 3 methodology plus any linked definitions, lead with Section 3 then prerequisite, enthusiastic tone",
            )

            planner_reply = json.dumps({
                "tone_style_notes": "Enthusiastic conversational tutor, lead with Section 3 then bring linked notation.",
                "selected_items": [
                    {
                        "chunk_id": "c4",
                        "role": "primary",
                        "bridge_note": None,
                        "chapter_heading": "Section 3: Methodology",
                    },
                    {
                        "chunk_id": "c3",
                        "role": "linked_context",
                        "bridge_note": "Defines covariance_regularization L_cov used directly by the VICReg trainer in Section 3.",
                        "chapter_heading": "Linked Notation (Page 2)",
                    },
                ],
            })

            narrator_reply = json.dumps([
                {
                    "chunk_id": "c4",
                    "segment_index": 0,
                    "text": "Let us jump straight into the exciting core in Section 3, where the VICReg trainer keeps eigen-spectrum stability locked in!",
                    "chapter_heading": "Section 3: Methodology",
                },
                {
                    "chunk_id": "c3",
                    "segment_index": 0,
                    "text": "And to see why that trainer works so well, notice how it links right back to Section 2 on page 2, where covariance regularization L cov enforces orthogonal stability.",
                    "chapter_heading": "Linked Notation (Page 2)",
                },
            ])

            captured_prompts: list[str] = []

            async def fake_generate_content(model: str, contents: str):
                captured_prompts.append(contents)
                if len(captured_prompts) == 1:
                    return SimpleNamespace(text=planner_reply)
                return SimpleNamespace(text=narrator_reply)

            fake_client = SimpleNamespace(
                aio=SimpleNamespace(
                    models=SimpleNamespace(generate_content=AsyncMock(side_effect=fake_generate_content))
                )
            )

            with (
                patch("app.services.script.ingestion_service.get_document_chunks", new=AsyncMock(return_value=chunks)),
                patch("app.services.script.setting.gemini_api_key", "test-key"),
                patch("app.services.script.genai.Client", return_value=fake_client),
            ):
                resp = await svc.generate_script(
                    document_id="doc-99",
                    owner_id="owner-1",
                    instruction=None,
                )

            self.assertEqual(
                resp.instruction,
                "Explain Section 3 methodology plus any linked definitions, lead with Section 3 then prerequisite, enthusiastic tone",
            )
            self.assertEqual([s.chunk_id for s in resp.segments], ["c4", "c3"])
            self.assertEqual(resp.segments[0].page_number, 3)
            self.assertEqual(resp.segments[1].page_number, 2)
            self.assertEqual(len(captured_prompts), 2)
            self.assertIn("USER INSTRUCTIONS", captured_prompts[0])
            self.assertIn("linked_context", captured_prompts[1])
            returned_ids = {s.chunk_id for s in resp.segments}
            self.assertTrue(returned_ids.isdisjoint({"c1", "c2", "c5"}))

    async def test_generate_script_without_instruction_covers_all_chunks(self):
        with tempfile.TemporaryDirectory() as tmp:
            svc = ScriptService(data_dir=Path(tmp))
            chunks = _sample_chunks()
            chunks[0]["content"] = "[User Reading Instruction: legacy]\n\n" + chunks[0]["content"]

            with (
                patch("app.services.script.ingestion_service.get_document_chunks", new=AsyncMock(return_value=chunks)),
                patch("app.services.script.setting.gemini_api_key", ""),
            ):
                resp = await svc.generate_script(
                    document_id="doc-full",
                    owner_id="owner-1",
                    instruction=None,
                )

            self.assertIsNone(resp.instruction)
            self.assertEqual({s.chunk_id for s in resp.segments}, {"c1", "c2", "c3", "c4", "c5"})
            self.assertNotIn("legacy", resp.segments[0].text.lower())

    async def test_upload_and_script_route_lifecycle_with_instruction(self):
        with tempfile.TemporaryDirectory() as tmp:
            temp_svc = ScriptService(data_dir=Path(tmp))
            fake_doc = {
                "id": "doc-route-1",
                "owner_id": "owner-route",
                "filename": "notes.pdf",
                "file_url": "https://example.com/notes.pdf",
                "storage_path": "owner-route/doc-route-1_notes.pdf",
                "file_size": 128,
                "mime_type": "application/pdf",
            }
            chunks = _sample_chunks()

            with (
                patch("app.routes.documents.script_service", temp_svc),
                patch("app.routes.documents.storage_service.upload_and_register", new=AsyncMock(return_value=fake_doc)),
                patch("app.routes.documents.storage_service.get_document", new=AsyncMock(return_value=fake_doc)),
                patch("app.routes.documents.ingestion_service.ingest_document", new=AsyncMock(return_value={})),
                patch("app.services.script.ingestion_service.get_document_chunks", new=AsyncMock(return_value=chunks)),
                patch("app.services.script.setting.gemini_api_key", ""),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    up = await client.post(
                        "/api/documents/upload",
                        headers={"X-Owner-Id": "owner-route"},
                        files={"file": ("notes.pdf", b"%PDF-1.4\n%%EOF\n", "application/pdf")},
                        data={"instruction": "Cover only page 3 methodology and connected notation"},
                    )
                    self.assertEqual(up.status_code, 201)
                    self.assertEqual(up.json()["instruction"], "Cover only page 3 methodology and connected notation")

                    fetched = await client.get("/api/documents/doc-route-1", headers={"X-Owner-Id": "owner-route"})
                    self.assertEqual(fetched.status_code, 200)
                    self.assertEqual(fetched.json()["instruction"], "Cover only page 3 methodology and connected notation")

                    script_res = await client.post(
                        "/api/documents/doc-route-1/script",
                        headers={"X-Owner-Id": "owner-route"},
                        json={"language": "en", "voice_style": "natural"},
                    )
                    self.assertEqual(script_res.status_code, 200)
                    body = script_res.json()
                    self.assertEqual(body["instruction"], "Cover only page 3 methodology and connected notation")
                    seg_ids = {s["chunk_id"] for s in body["segments"]}
                    self.assertEqual(seg_ids, {"c3", "c4"})

                    # Explicit empty instruction clears saved instruction & reverts to full PDF
                    cleared_res = await client.post(
                        "/api/documents/doc-route-1/script",
                        headers={"X-Owner-Id": "owner-route"},
                        json={
                            "language": "en",
                            "voice_style": "natural",
                            "force_regenerate": True,
                            "instruction": "",
                        },
                    )
                    self.assertEqual(cleared_res.status_code, 200)
                    cleared_body = cleared_res.json()
                    self.assertIsNone(cleared_body["instruction"])
                    self.assertEqual({s["chunk_id"] for s in cleared_body["segments"]}, {"c1", "c2", "c3", "c4", "c5"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
