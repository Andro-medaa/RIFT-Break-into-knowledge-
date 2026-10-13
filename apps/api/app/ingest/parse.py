import re
import uuid
from typing import List, Dict, Any, Tuple, Optional
from dataclasses import dataclass
import fitz  # PyMuPDF

from app.schemas.document import NormalizedRect, DocumentChunk

@dataclass
class DocumentParsed:
    doc_id: str
    title: str
    page_count: int
    chunks: List[DocumentChunk]
    owner_id: Optional[str] = None

def clean_extracted_text(text: str) -> str:
    """Clean text by recombining hyphenated words across line wraps and normalizing whitespace."""
    # Recombine hyphenated words split across lines: e.g. "geo-\nmetry" -> "geometry"
    cleaned = re.sub(r'(\b\w+)-\s*\n\s*(\w+\b)', r'\1\2', text)
    # Replace internal newlines with single spaces
    cleaned = re.sub(r'\s*\n\s*', ' ', cleaned)
    # Normalize multiple spaces
    cleaned = re.sub(r'\s{2,}', ' ', cleaned)
    return cleaned.strip()

def is_header_or_footer(y0_norm: float, y1_norm: float, text: str) -> bool:
    """Filter repetitive headers and footers outside the main reading body."""
    # Strict margin checks: top 4% or bottom 4% of page
    if y1_norm < 0.04 or y0_norm > 0.96:
        # If it's a short page number or brief title string
        if len(text.strip()) < 40:
            return True
    return False

def parse_pdf_bytes(pdf_bytes: bytes, filename: str = "document.pdf", doc_id: str = "") -> DocumentParsed:
    """Extract text blocks, detect headings, normalize bounding coordinates (0..1),
    and group into pedagogical chunks (100-250 words) preserving sentence boundaries.
    """
    if not doc_id:
        doc_id = str(uuid.uuid4())

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page_count = len(doc)
    
    # Derive title from metadata or filename
    title = doc.metadata.get("title") if doc.metadata else ""
    if not title or not title.strip():
        title = filename.rsplit(".", 1)[0].replace("-", " ").replace("_", " ").title()

    all_raw_blocks: List[Dict[str, Any]] = []

    # First pass: collect all spans with font sizes to determine body font size baseline
    font_sizes: List[float] = []

    for page_idx in range(page_count):
        page = doc[page_idx]
        page_dict = page.get_text("dict")
        page_w = float(page.rect.width)
        page_h = float(page.rect.height)

        if page_w <= 0 or page_h <= 0:
            continue

        for block in page_dict.get("blocks", []):
            if "lines" not in block:
                continue

            for line in block["lines"]:
                for span in line.get("spans", []):
                    span_text = span.get("text", "").strip()
                    if span_text:
                        font_sizes.append(float(span.get("size", 10.0)))

    median_font_size = 11.0
    if font_sizes:
        sorted_sizes = sorted(font_sizes)
        median_font_size = sorted_sizes[len(sorted_sizes) // 2]

    heading_threshold = median_font_size * 1.22

    # Second pass: extract blocks with normalized rects
    for page_idx in range(page_count):
        page = doc[page_idx]
        page_no = page_idx + 1
        page_dict = page.get_text("dict")
        page_w = float(page.rect.width)
        page_h = float(page.rect.height)

        for block in page_dict.get("blocks", []):
            if "lines" not in block:
                continue

            block_text_parts: List[str] = []
            block_max_font_size = 0.0
            block_rect = block.get("bbox", [0, 0, 0, 0])

            for line in block["lines"]:
                for span in line.get("spans", []):
                    t = span.get("text", "")
                    block_text_parts.append(t)
                    block_max_font_size = max(block_max_font_size, float(span.get("size", 0.0)))

            raw_block_text = "".join(block_text_parts)
            clean_text = clean_extracted_text(raw_block_text)

            if not clean_text:
                continue

            # Normalize coordinates relative to page dimensions
            x0_norm = round(max(0.0, min(1.0, float(block_rect[0]) / page_w)), 4)
            y0_norm = round(max(0.0, min(1.0, float(block_rect[1]) / page_h)), 4)
            x1_norm = round(max(0.0, min(1.0, float(block_rect[2]) / page_w)), 4)
            y1_norm = round(max(0.0, min(1.0, float(block_rect[3]) / page_h)), 4)

            # Skip recurring headers or footers
            if is_header_or_footer(y0_norm, y1_norm, clean_text):
                continue

            is_heading = block_max_font_size >= heading_threshold and len(clean_text) < 160

            all_raw_blocks.append({
                "page_no": page_no,
                "text": clean_text,
                "rect": NormalizedRect(x0=x0_norm, y0=y0_norm, x1=x1_norm, y1=y1_norm),
                "is_heading": is_heading,
                "word_count": len(clean_text.split()),
            })

    # Third pass: group into pedagogical chunks (100–250 words)
    # Headings start new chunks; paragraphs merge until ~120-200 words
    chunks: List[DocumentChunk] = []
    chunk_ord = 0

    current_chunk_texts: List[str] = []
    current_chunk_rects: List[NormalizedRect] = []
    current_page_no = 1
    current_word_count = 0
    current_kind = "paragraph"

    def flush_chunk():
        nonlocal chunk_ord, current_chunk_texts, current_chunk_rects, current_page_no, current_word_count, current_kind
        if not current_chunk_texts:
            return

        full_text = " ".join(current_chunk_texts).strip()
        if full_text:
            chunk = DocumentChunk(
                id=f"chunk_{doc_id}_{chunk_ord}",
                doc_id=doc_id,
                ord=chunk_ord,
                page_no=current_page_no,
                rects=list(current_chunk_rects),
                kind=current_kind,
                text=full_text,
                word_count=len(full_text.split()),
            )
            chunks.append(chunk)
            chunk_ord += 1

        current_chunk_texts = []
        current_chunk_rects = []
        current_word_count = 0
        current_kind = "paragraph"

    for b in all_raw_blocks:
        page_no = b["page_no"]
        text = b["text"]
        rect = b["rect"]
        is_heading = b["is_heading"]
        w_count = b["word_count"]

        # If page changes or it's a distinct heading, flush previous chunk
        if page_no != current_page_no or is_heading:
            flush_chunk()
            current_page_no = page_no

        if is_heading:
            current_kind = "heading"
            current_chunk_texts.append(text)
            current_chunk_rects.append(rect)
            current_word_count += w_count
            flush_chunk()
            continue

        # If adding block exceeds ~220 words and we already have > 80 words, flush
        if current_word_count + w_count > 220 and current_word_count >= 80:
            flush_chunk()
            current_page_no = page_no

        current_chunk_texts.append(text)
        current_chunk_rects.append(rect)
        current_word_count += w_count

    # Flush final pending chunk
    flush_chunk()

    doc.close()
    return DocumentParsed(doc_id=doc_id, title=title, page_count=page_count, chunks=chunks)
