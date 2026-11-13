"""Integration tests for multi-thread conversations and local SQLite fallback persistence.

Verifies that conversation listing, creation, renaming, querying, message editing,
retrying, deletion, and persistence across service restarts all work transparently
even when primary Postgres raises DNS/connectivity errors ([Errno 11001] getaddrinfo failed).
"""

import asyncio
import socket
import sys
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from httpx import ASGITransport, AsyncClient
from app.main import app
from app.services.conversation import ConversationService
from app.services.rag import (
    RAGService,
    build_rag_prompts,
    finalize_citations_and_answer,
    parse_length_and_directive,
)


class _BrokenPgEngine:
    """Stub engine simulating Postgres DNS failure ([Errno 11001] getaddrinfo failed)."""

    def connect(self):
        raise socket.gaierror(11001, "getaddrinfo failed")

    def begin(self):
        raise socket.gaierror(11001, "getaddrinfo failed")


async def run_conversation_fallback_tests() -> None:
    """Verify full multi-thread conversation lifecycle against SQLite fallback on PG failure."""
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "conv_test.db"
        svc = ConversationService(local_db_path=db_path)

        try:
            with patch("app.routes.conversations.conversation_service", svc), \
                 patch("app.services.conversation.get_db", return_value=_BrokenPgEngine()), \
                 patch(
                     "app.services.conversation.rag_service.query",
                     new=AsyncMock(
                         return_value={
                             "answer": "Grounded fallback explanation.",
                             "citations": [
                                 {"id": "c1", "label": "Page 1", "page": 1, "source": "pdf"}
                             ],
                         }
                     ),
                 ):
                async with AsyncClient(
                    transport=ASGITransport(app=app),
                    base_url="http://test",
                ) as client:
                    headers = {"X-Owner-Id": "test_conv_owner"}
                    doc_id = "test-doc-conv-001"

                    # 1. Initial list auto-creates 'General Discussion'
                    list_resp = await client.get(
                        f"/api/documents/{doc_id}/conversations",
                        headers=headers,
                    )
                    assert list_resp.status_code == 200, list_resp.text
                    threads = list_resp.json()
                    assert len(threads) == 1
                    assert threads[0]["title"] == "General Discussion"

                    # 2. Explicit new thread creation succeeds (previously crashed with 11001)
                    create_resp = await client.post(
                        f"/api/documents/{doc_id}/conversations",
                        json={"title": "Discussion 2"},
                        headers=headers,
                    )
                    assert create_resp.status_code == 201, create_resp.text
                    thread = create_resp.json()
                    cid = thread["id"]
                    assert thread["title"] == "Discussion 2"
                    assert thread["message_count"] == 0

                    # 3. Query inside created thread stores both user & assistant messages
                    query_resp = await client.post(
                        f"/api/conversations/{cid}/query",
                        json={"question": "Summarize page 1"},
                        headers=headers,
                    )
                    assert query_resp.status_code == 200, query_resp.text
                    qdata = query_resp.json()
                    assert qdata["user_message"]["content"] == "Summarize page 1"
                    assert qdata["assistant_message"]["content"] == "Grounded fallback explanation."
                    assert len(qdata["assistant_message"]["citations"]) == 1

                    # 4. Get conversation detail returns chronological messages
                    detail_resp = await client.get(f"/api/conversations/{cid}", headers=headers)
                    assert detail_resp.status_code == 200, detail_resp.text
                    detail = detail_resp.json()
                    assert len(detail["messages"]) == 2
                    user_msg_id = detail["messages"][0]["id"]

                    # 5. Rename thread via PATCH (verifies UPDATE ... RETURNING)
                    patch_resp = await client.patch(
                        f"/api/conversations/{cid}",
                        json={"title": "Renamed Thread"},
                        headers=headers,
                    )
                    assert patch_resp.status_code == 200, patch_resp.text
                    assert patch_resp.json()["title"] == "Renamed Thread"

                    # 6. Edit user message prunes subsequent turns and creates fresh reply
                    edit_resp = await client.put(
                        f"/api/conversations/{cid}/messages/{user_msg_id}",
                        json={"new_content": "Summarize page 2 instead"},
                        headers=headers,
                    )
                    assert edit_resp.status_code == 200, edit_resp.text
                    edited = edit_resp.json()
                    assert edited["user_message"]["content"] == "Summarize page 2 instead"
                    ai_msg_id = edited["assistant_message"]["id"]

                    # 7. Retry assistant message regenerates reply
                    retry_resp = await client.post(
                        f"/api/conversations/{cid}/messages/{ai_msg_id}/retry",
                        json={},
                        headers=headers,
                    )
                    assert retry_resp.status_code == 200, retry_resp.text

                    # 8. Persistence across service restart on the same SQLite file
                    await svc.close()
                    svc_restarted = ConversationService(local_db_path=db_path)
                    try:
                        persisted = await svc_restarted.get_conversation(cid, "test_conv_owner")
                        assert persisted is not None
                        assert persisted["conversation"]["title"] == "Renamed Thread"
                        assert len(persisted["messages"]) == 2
                    finally:
                        await svc_restarted.close()

                    # Re-attach fresh service instance for cleanup deletes
                    svc2 = ConversationService(local_db_path=db_path)
                    with patch("app.routes.conversations.conversation_service", svc2):
                        try:
                            del_msg_resp = await client.delete(
                                f"/api/conversations/{cid}/messages/{ai_msg_id}",
                                headers=headers,
                            )
                            assert del_msg_resp.status_code == 200, del_msg_resp.text

                            # 9. Cascade delete when deleting a user query removes its response & all turns below
                            cascade_conv_resp = await client.post(
                                f"/api/documents/{doc_id}/conversations",
                                json={"title": "Cascade Test"},
                                headers=headers,
                            )
                            assert cascade_conv_resp.status_code == 201, cascade_conv_resp.text
                            cid2 = cascade_conv_resp.json()["id"]

                            turn_user_ids: list[str] = []
                            for q_text in ("First question", "Second question", "Third question"):
                                t_resp = await client.post(
                                    f"/api/conversations/{cid2}/query",
                                    json={"question": q_text},
                                    headers=headers,
                                )
                                assert t_resp.status_code == 200, t_resp.text
                                turn_user_ids.append(t_resp.json()["user_message"]["id"])

                            # Deleting Second question removes Q2, A2, Q3, A3 -> leaving Q1, A1
                            del_q2 = await client.delete(
                                f"/api/conversations/{cid2}/messages/{turn_user_ids[1]}",
                                headers=headers,
                            )
                            assert del_q2.status_code == 200, del_q2.text
                            assert del_q2.json()["deleted_count"] == 4

                            after_q2 = await client.get(f"/api/conversations/{cid2}", headers=headers)
                            assert after_q2.status_code == 200, after_q2.text
                            remaining_msgs = after_q2.json()["messages"]
                            assert len(remaining_msgs) == 2
                            assert remaining_msgs[0]["id"] == turn_user_ids[0]
                            assert remaining_msgs[0]["content"] == "First question"
                            assert remaining_msgs[1]["role"] == "assistant"

                            # Deleting First question empties the thread cleanly
                            del_q1 = await client.delete(
                                f"/api/conversations/{cid2}/messages/{turn_user_ids[0]}",
                                headers=headers,
                            )
                            assert del_q1.status_code == 200, del_q1.text
                            assert del_q1.json()["deleted_count"] == 2

                            after_q1 = await client.get(f"/api/conversations/{cid2}", headers=headers)
                            assert after_q1.status_code == 200, after_q1.text
                            assert len(after_q1.json()["messages"]) == 0

                            del_conv_resp = await client.delete(
                                f"/api/conversations/{cid}",
                                headers=headers,
                            )
                            assert del_conv_resp.status_code == 200, del_conv_resp.text
                            await client.delete(f"/api/conversations/{cid2}", headers=headers)
                        finally:
                            await svc2.close()
        finally:
            await svc.close()


def test_rag_prompt_formatting_and_instruction_precedence() -> None:
    """Verify preset/directive parsing, adaptive length, and voice-safe Markdown rules."""
    mode, directive = parse_length_and_directive("[Length: Concise]\nAlways reply in 3 bullets")
    assert mode == "concise"
    assert directive == "Always reply in 3 bullets"

    sys_inst, user_prompt = build_rag_prompts(
        question="Compare transformers and RNNs under 50 words",
        context_str="[PDF Source 1 - Page 2]: Transformers use self-attention...",
        instruction="[Length: Concise]\nUse simple terms",
    )
    assert "HIGHEST PRIORITY — USER INSTRUCTIONS" in sys_inst
    assert "CONCISE PRESET" in sys_inst
    assert "Use simple terms" in sys_inst
    assert "VOICE-SAFE MARKDOWN FORMATTING" in sys_inst
    assert "Compare transformers and RNNs under 50 words" in user_prompt

    bal_mode, bal_dir = parse_length_and_directive("Use numbered steps only")
    assert bal_mode is None
    assert bal_dir == "Use numbered steps only"


async def run_instruction_and_reformulation_split_test() -> None:
    """Verify _reformulate_query outputs feed search_query while keeping user's original question & thread instruction."""
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "conv_prompt_test.db"
        svc = ConversationService(local_db_path=db_path)
        mock_rag = AsyncMock(
            return_value={
                "answer": "### Summary\n\n- Point one\n- Point two",
                "citations": [],
            }
        )
        try:
            with patch("app.services.conversation.get_db", return_value=_BrokenPgEngine()), \
                 patch("app.services.conversation.rag_service.query", new=mock_rag), \
                 patch.object(
                     svc,
                     "_reformulate_query",
                     new=AsyncMock(return_value="standalone retrieval keywords only"),
                 ):
                conv = await svc.create_conversation(
                    document_id="doc-format-001",
                    owner_id="owner-fmt",
                    title="Formatting Thread",
                    system_prompt="[Length: Concise]\nAlways highlight formulas",
                )
                cid = conv["id"]

                await svc.query_thread(
                    conversation_id=cid,
                    owner_id="owner-fmt",
                    question="Explain it in 2 short bullet points",
                )
                first_call = mock_rag.await_args_list[-1].kwargs
                assert first_call["question"] == "Explain it in 2 short bullet points"
                assert first_call["search_query"] == "standalone retrieval keywords only"
                assert first_call["instruction"] == "[Length: Concise]\nAlways highlight formulas"

                detail = await svc.get_conversation(cid, "owner-fmt")
                assert detail is not None
                u_id = detail["messages"][0]["id"]
                a_id = detail["messages"][1]["id"]

                await svc.edit_message(
                    conversation_id=cid,
                    message_id=u_id,
                    owner_id="owner-fmt",
                    new_content="Summarize page 3 in a table",
                )
                edit_call = mock_rag.await_args_list[-1].kwargs
                assert edit_call["question"] == "Summarize page 3 in a table"
                assert edit_call["search_query"] == "standalone retrieval keywords only"
                assert edit_call["instruction"] == "[Length: Concise]\nAlways highlight formulas"

                detail2 = await svc.get_conversation(cid, "owner-fmt")
                a_id2 = detail2["messages"][1]["id"]
                assert a_id2 != a_id

                await svc.retry_message(
                    conversation_id=cid,
                    message_id=a_id2,
                    owner_id="owner-fmt",
                )
                retry_call = mock_rag.await_args_list[-1].kwargs
                assert retry_call["question"] == "Summarize page 3 in a table"
                assert retry_call["search_query"] == "standalone retrieval keywords only"
                assert retry_call["instruction"] == "[Length: Concise]\nAlways highlight formulas"
        finally:
            await svc.close()


def test_finalize_citations_and_conditional_tavily_prompts() -> None:
    """Verify inline bracket citation renumbering, protection of code/links, and Tavily prompt rules."""
    sys_inst, _ = build_rag_prompts(
        question="What are the latest benchmarks?",
        context_str="[Source 1] (PDF Page 2): Local claim.",
        web_search_enabled=True,
    )
    assert "search_internet_tavily" in sys_inst
    assert "WITHOUT calling `search_internet_tavily`" in sys_inst

    candidates = [
        {"id": "cit-0", "number": 1, "label": "§ Page 1", "source": "pdf", "page": 1},
        {"id": "cit-1", "number": 2, "label": "§ Page 2", "source": "pdf", "page": 2},
        {"id": "web-3", "number": 3, "label": "🌐 Benchmark", "source": "web", "url": "https://example.com"},
    ]
    raw_ans = (
        "Claim A [3, 1]. Also see `[2]` and `[Link 1](https://example.com)` plus out-of-range [9].\n"
        "```python\nx = arr[1]\n```"
    )
    cleaned, final_cits = finalize_citations_and_answer(raw_ans, candidates)
    assert cleaned.startswith("Claim A [1][2].")
    assert "`[2]`" in cleaned
    assert "[Link 1](https://example.com)" in cleaned
    assert "arr[1]" in cleaned
    assert [c["id"] for c in final_cits] == ["web-3", "cit-0"]
    assert [c["number"] for c in final_cits] == [1, 2]

    # When answer comes from general/internal knowledge without citing PDF or calling web, return NO citations
    pdf_only_candidates = [
        {"id": "cit-0", "number": 1, "label": "§ Page 1", "source": "pdf", "page": 1, "bbox": {"x": 0.1, "y": 0.1, "w": 0.3, "h": 0.1}},
    ]
    cleaned_internal, internal_cits = finalize_citations_and_answer(
        "Water is composed of two hydrogen atoms and one oxygen atom (H2O).",
        pdf_only_candidates,
    )
    assert cleaned_internal == "Water is composed of two hydrogen atoms and one oxygen atom (H2O)."
    assert internal_cits == []


async def run_conditional_tavily_tool_loop_test() -> None:
    """Verify model decides whether to call Tavily (no call when PDF suffices; executes tool & cites web when requested)."""
    rag = RAGService()
    sample_chunks = [
        {
            "id": "p1",
            "page_number": 3,
            "chunk_type": "text",
            "content": "The internal benchmark reaches 95% accuracy on dataset A.",
            "bbox": {"x": 0.1, "y": 0.2, "w": 0.5, "h": 0.08},
            "section_path": ["Results"],
        }
    ]

    class _FakeResp:
        def __init__(self, text=None, function_calls=None, content=None):
            self.text = text
            self.function_calls = function_calls or []
            self.candidates = [type("Cand", (), {"content": content})()] if content else []

    class _FakeFunctionCall:
        def __init__(self, name, args):
            self.name = name
            self.args = args

    # Case A: PDF is sufficient -> model returns direct answer without calling Tavily
    mock_generate_direct = AsyncMock(
        return_value=_FakeResp(text="Dataset A reaches 95% accuracy [1].")
    )
    mock_client_a = type(
        "FakeClientA",
        (),
        {"aio": type("Aio", (), {"models": type("M", (), {"generate_content": mock_generate_direct})()})()},
    )()
    mock_tavily_a = AsyncMock(return_value=[])
    with patch("app.services.rag.setting.gemini_api_key", "fake-gemini-key"), \
         patch("app.services.rag.setting.tavily_api_key", "tvly-fake-test-key"), \
         patch("app.services.rag.genai.Client", return_value=mock_client_a), \
         patch.object(rag, "_search_tavily", new=mock_tavily_a):
        ans_a, cits_a = await rag._generate_answer(
            question="What accuracy is reported on dataset A?",
            chunks=sample_chunks,
            web_search_enabled=True,
        )
        assert mock_tavily_a.await_count == 0
        assert ans_a == "Dataset A reaches 95% accuracy [1]."
        assert len(cits_a) == 1
        assert cits_a[0]["source"] == "pdf"
        assert cits_a[0]["number"] == 1
        assert cits_a[0]["bbox"] is not None

    # Case B: Model decides to invoke search_internet_tavily -> combines PDF [1] + Web [2]
    mock_generate_tool = AsyncMock(
        side_effect=[
            _FakeResp(
                function_calls=[
                    _FakeFunctionCall(
                        "search_internet_tavily",
                        {"query": "dataset A 2026 external baseline", "max_results": 2},
                    )
                ],
                content={"role": "model", "parts": []},
            ),
            _FakeResp(
                text="Dataset A reaches 95% internally [1], compared to 91% in external baselines [2]."
            ),
        ]
    )
    mock_client_b = type(
        "FakeClientB",
        (),
        {"aio": type("Aio", (), {"models": type("M", (), {"generate_content": mock_generate_tool})()})()},
    )()
    mock_tavily_b = AsyncMock(
        return_value=[
            {
                "title": "External Leaderboard",
                "url": "https://example.org/leaderboard",
                "content": "External baseline achieved 91% on dataset A.",
            }
        ]
    )
    with patch("app.services.rag.setting.gemini_api_key", "fake-gemini-key"), \
         patch("app.services.rag.setting.tavily_api_key", "tvly-fake-test-key"), \
         patch("app.services.rag.genai.Client", return_value=mock_client_b), \
         patch.object(rag, "_search_tavily", new=mock_tavily_b):
        ans_b, cits_b = await rag._generate_answer(
            question="Compare dataset A accuracy with external 2026 baselines",
            chunks=sample_chunks,
            web_search_enabled=True,
        )
        assert mock_tavily_b.await_count == 1
        assert ans_b == "Dataset A reaches 95% internally [1], compared to 91% in external baselines [2]."
        assert len(cits_b) == 2
        assert cits_b[0]["source"] == "pdf"
        assert cits_b[0]["number"] == 1
        assert cits_b[1]["source"] == "web"
        assert cits_b[1]["number"] == 2
        assert cits_b[1]["url"] == "https://example.org/leaderboard"
        # Verify Gemini Developer API role requirement: function responses must use role='user', never role='tool'
        second_call_contents = mock_generate_tool.await_args_list[1].kwargs["contents"]
        assert any(
            getattr(c, "role", None) == "user"
            and any(getattr(p, "function_response", None) is not None for p in (getattr(c, "parts", None) or []))
            for c in second_call_contents
        )
        assert not any(getattr(c, "role", None) == "tool" for c in second_call_contents)

    # Case C: Answer uses internal LLM knowledge (neither PDF cited nor Tavily called) -> zero citations attached
    mock_generate_internal = AsyncMock(
        return_value=_FakeResp(
            text="Water consists of two hydrogen atoms covalently bonded to one oxygen atom (H₂O)."
        )
    )
    mock_client_c = type(
        "FakeClientC",
        (),
        {"aio": type("Aio", (), {"models": type("M", (), {"generate_content": mock_generate_internal})()})()},
    )()
    mock_tavily_c = AsyncMock(return_value=[])
    with patch("app.services.rag.setting.gemini_api_key", "fake-gemini-key"), \
         patch("app.services.rag.setting.tavily_api_key", "tvly-fake-test-key"), \
         patch("app.services.rag.genai.Client", return_value=mock_client_c), \
         patch.object(rag, "_search_tavily", new=mock_tavily_c):
        ans_c, cits_c = await rag._generate_answer(
            question="What is the composition of water?",
            chunks=sample_chunks,
            web_search_enabled=True,
        )
        assert mock_tavily_c.await_count == 0
        assert "hydrogen" in ans_c.lower()
        assert cits_c == []


def test_conversations_sqlite_fallback() -> None:
    """Pytest entrypoint."""
    test_rag_prompt_formatting_and_instruction_precedence()
    test_finalize_citations_and_conditional_tavily_prompts()
    asyncio.run(run_conversation_fallback_tests())
    asyncio.run(run_instruction_and_reformulation_split_test())
    asyncio.run(run_conditional_tavily_tool_loop_test())


if __name__ == "__main__":
    test_rag_prompt_formatting_and_instruction_precedence()
    test_finalize_citations_and_conditional_tavily_prompts()
    asyncio.run(run_conversation_fallback_tests())
    asyncio.run(run_instruction_and_reformulation_split_test())
    asyncio.run(run_conditional_tavily_tool_loop_test())
    print("ALL CONVERSATION & RAG FORMATTING TESTS PASSED!")

