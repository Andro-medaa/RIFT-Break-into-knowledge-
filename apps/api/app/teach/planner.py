import json
import logging
import uuid
from typing import List, Optional
from app.core.config import settings
from app.schemas.document import Chunk
from app.schemas.lesson import LessonSegment, MoveType
from app.teach.splitter import split_into_sentences

logger = logging.getLogger(__name__)

VALID_MOVES = {"intro", "explain", "example", "analogy", "recap", "check"}

SYSTEM_PROMPT = """You are a charismatic, world-class private tutor teaching a student from a document.
Your goal is to transform the provided document chunks into an engaging, dynamic spoken lesson plan.

Requirements:
1. Break down the material into a structured sequence of pedagogical moves:
   - 'intro': Set the stage, hook the student's curiosity, explain why this matters.
   - 'explain': Crystal-clear instructional breakdown of the core concept or mechanism.
   - 'example': Walk through a concrete, vivid scenario or application.
   - 'analogy': Use an intuitive, relatable metaphor connecting theory to everyday intuition.
   - 'check': An engaging, inquisitive question or comprehension check for the student.
   - 'recap': Authoritative, satisfying takeaway synthesizing the key insight.
2. The 'script' MUST BE SPOKEN ENGLISH ONLY.
   - Strictly NO markdown formatting (no asterisks, hash headers, bolding).
   - Strictly NO bullet points or numbered lists.
   - Strictly NO brackets or citations like [1] or [c1].
   - Write exactly as you would speak out loud to an eager student sitting beside you.
3. Every segment MUST include 'chunk_ids': the list of exact chunk IDs from the input that this segment covers.
4. All provided chunks should be covered across the lesson segments.

Return a JSON array of objects with keys:
- move: one of "intro", "explain", "example", "analogy", "check", "recap"
- script: spoken text string
- chunk_ids: array of chunk ID strings
"""

def generate_heuristic_lesson(doc_id: str, chunks: List[Chunk], doc_title: str = "Document") -> List[LessonSegment]:
    """
    Deterministic, high-quality charismatic teacher fallback.
    Used when Gemini API key is unset, offline, or during hermetic tests.
    """
    if not chunks:
        return []

    segments: List[LessonSegment] = []
    
    # 1. Intro Move
    first_chunk = chunks[0]
    first_preview = first_chunk.text.strip().replace("\n", " ")[:160]
    intro_script = (
        f"Welcome to this lesson on {doc_title}. Today, we are breaking down the core principles "
        f"starting with our opening section: {first_preview}. Let us explore how these foundational ideas connect together."
    )
    segments.append(
        LessonSegment(
            id=str(uuid.uuid4()),
            doc_id=doc_id,
            ord=0,
            chunk_ids=[first_chunk.id],
            move="intro",
            script=intro_script,
            sentences=split_into_sentences(intro_script),
        )
    )

    # 2. Iterate through chunks with alternating pedagogical moves
    moves_sequence: List[MoveType] = ["explain", "example", "analogy", "check"]
    current_ord = 1

    for i, chunk in enumerate(chunks):
        cleaned_text = chunk.text.strip().replace("\n", " ")
        if not cleaned_text:
            continue

        move: MoveType = moves_sequence[(i) % len(moves_sequence)]
        
        if move == "explain":
            script = (
                f"Notice what is happening in this section. Specifically, {cleaned_text} "
                f"This mechanism is critical because every subsequent step relies on this exact principle."
            )
        elif move == "example":
            script = (
                f"To see this in action, picture how this applies in practice: {cleaned_text} "
                f"When this occurs in a real system, the exact behavior described here unfolds cleanly."
            )
        elif move == "analogy":
            script = (
                f"Think of this like an interconnected puzzle. As the text highlights, {cleaned_text} "
                f"Just like gears turning together, each component balances the other perfectly."
            )
        else: # check
            script = (
                f"Let us pause and consider a quick thought experiment. In this passage, we see that: {cleaned_text} "
                f"How would this change if one of these core assumptions were altered?"
            )

        segments.append(
            LessonSegment(
                id=str(uuid.uuid4()),
                doc_id=doc_id,
                ord=current_ord,
                chunk_ids=[chunk.id],
                move=move,
                script=script,
                sentences=split_into_sentences(script),
            )
        )
        current_ord += 1

    # 3. Recap Move
    all_chunk_ids = [c.id for c in chunks]
    recap_script = (
        f"To wrap up our lesson on {doc_title}, we have journeyed through {len(chunks)} foundational sections. "
        f"Remember the key relationship between these concepts, and keep this framework in mind as you continue exploring."
    )
    segments.append(
        LessonSegment(
            id=str(uuid.uuid4()),
            doc_id=doc_id,
            ord=current_ord,
            chunk_ids=all_chunk_ids,
            move="recap",
            script=recap_script,
            sentences=split_into_sentences(recap_script),
        )
    )

    return segments


def plan_lesson(
    doc_id: str,
    chunks: List[Chunk],
    doc_title: str = "Document",
    force_fallback: bool = False
) -> List[LessonSegment]:
    """
    Plans a structured pedagogical lesson from document chunks using Gemini 2.5 Flash,
    with automatic graceful fallback to the heuristic teacher generator.
    """
    if not chunks:
        return []

    api_key = settings.GEMINI_API_KEY.strip()
    if force_fallback or not api_key:
        logger.info("Using heuristic lesson planner (API key not configured or fallback forced)")
        return generate_heuristic_lesson(doc_id, chunks, doc_title)

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)

        chunks_payload = [
            {"id": c.id, "kind": c.kind, "page_no": c.page_no, "text": c.text[:400]}
            for c in chunks[:12] # Limit prompt context for fast responsive generation
        ]

        prompt_content = (
            f"Document Title: {doc_title}\n\n"
            f"Here are the document chunks to teach:\n"
            f"{json.dumps(chunks_payload, indent=2)}\n\n"
            f"Generate the complete structured spoken lesson plan according to the pedagogical moves."
        )

        # Attempt with gemini-2.5-flash or gemini-2.0-flash / gemini-1.5-flash
        model_name = "gemini-2.5-flash"
        
        response = client.models.generate_content(
            model=model_name,
            contents=prompt_content,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
                temperature=0.7,
            ),
        )

        response_text = response.text.strip()
        parsed_json = json.loads(response_text)
        if isinstance(parsed_json, dict) and "segments" in parsed_json:
            raw_segments = parsed_json["segments"]
        elif isinstance(parsed_json, list):
            raw_segments = parsed_json
        else:
            raise ValueError(f"Unexpected JSON response structure: {type(parsed_json)}")

        segments: List[LessonSegment] = []
        for ord_idx, item in enumerate(raw_segments):
            move = item.get("move", "explain")
            if move not in VALID_MOVES:
                move = "explain"
            
            script = item.get("script", "").strip()
            chunk_ids = item.get("chunk_ids", [])
            # Validate chunk_ids
            valid_chunk_ids = [cid for cid in chunk_ids if any(c.id == cid for c in chunks)]
            if not valid_chunk_ids and chunks:
                valid_chunk_ids = [chunks[min(ord_idx, len(chunks) - 1)].id]

            sentences = split_into_sentences(script)

            segments.append(
                LessonSegment(
                    id=str(uuid.uuid4()),
                    doc_id=doc_id,
                    ord=ord_idx,
                    chunk_ids=valid_chunk_ids,
                    move=move, # type: ignore
                    script=script,
                    sentences=sentences,
                )
            )

        if segments:
            logger.info("Successfully generated %d lesson segments via Gemini %s", len(segments), model_name)
            return segments

    except Exception as exc:
        logger.warning("Gemini generation failed (%s). Falling back to heuristic teacher.", str(exc))

    return generate_heuristic_lesson(doc_id, chunks, doc_title)
