"""Semantic structure-aware chunking for multimodal PDF elements.

Preserves exact paragraph, heading, table, and image boundaries with crisp,
non-overlapping bounding boxes, while generating parent-context windows for RAG.
"""

from dataclasses import dataclass, field
from typing import Optional
from app.ingest.parser import ParsedElement


@dataclass
class DocumentChunkData:
    """A semantically chunked unit ready for embedding and pgvector persistence."""

    chunk_index: int
    chunk_type: str  # 'text', 'table', 'image', 'heading'
    content: str
    parent_content: Optional[str]
    page_number: int
    bbox: dict[str, float]
    section_path: list[str] = field(default_factory=list)
    image_url: Optional[str] = None
    image_bytes: Optional[bytes] = None
    image_ext: Optional[str] = None
    ocr_text: Optional[str] = None
    caption: Optional[str] = None
    figure_label: Optional[str] = None
    table_markdown: Optional[str] = None
    token_count: int = 0


class SemanticChunker:
    """Transforms raw parsed multimodal elements into discrete chunks with parent context."""

    def __init__(self, target_tokens: int = 120, max_tokens: int = 250):
        self.target_tokens = target_tokens
        self.max_tokens = max_tokens

    def chunk_elements(self, elements: list[ParsedElement]) -> list[DocumentChunkData]:
        """Convert elements into discrete chunks, maintaining paragraph-level bounding boxes."""
        chunks: list[DocumentChunkData] = []

        for idx, elem in enumerate(elements):
            chunks.append(
                DocumentChunkData(
                    chunk_index=idx,
                    chunk_type=elem.element_type,
                    content=elem.content,
                    parent_content=None,  # Populated in 2nd pass
                    page_number=elem.page_number,
                    bbox=elem.bbox,
                    section_path=elem.section_path,
                    image_url=elem.image_url,
                    image_bytes=elem.image_bytes,
                    image_ext=elem.image_ext,
                    ocr_text=elem.ocr_text,
                    caption=elem.caption,
                    figure_label=elem.figure_label,
                    table_markdown=elem.table_markdown,
                    token_count=elem.token_count,
                )
            )

        # ── 2nd Pass: Populate Parent Context Window ──────────────────────────────
        # Links adjacent paragraphs (previous and next) into parent_content for synthesis
        for i, chk in enumerate(chunks):
            window = []
            if i > 0 and chunks[i - 1].page_number == chk.page_number:
                window.append(chunks[i - 1].content)
            window.append(chk.content)
            if i + 1 < len(chunks) and chunks[i + 1].page_number == chk.page_number:
                window.append(chunks[i + 1].content)
            chk.parent_content = "\n\n---\n\n".join(window)

        return chunks


semantic_chunker = SemanticChunker()
