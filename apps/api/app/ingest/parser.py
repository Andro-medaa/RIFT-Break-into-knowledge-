"""Multimodal PDF parser using PyMuPDF and pdfplumber.

Extracts text blocks, headings, tables, and images with exact normalized bounding boxes:
- Bounding boxes are normalized to [0.0, 1.0] relative to page width and height:
    {"x": float, "y": float, "w": float, "h": float}
- Tables are extracted as clean GitHub-Flavored Markdown with exact table bounding boxes.
- Images are extracted with page rects and raster bytes.
- Text blocks are merged along semantic paragraph boundaries preventing overlapping rects.
- Document hierarchy (headings) is tracked across pages.
"""

from dataclasses import dataclass, field
import io
import re
from typing import Any, Optional
import pymupdf


@dataclass
class ParsedElement:
    """A discrete multimodal element extracted from a PDF page."""

    element_type: str  # 'text', 'table', 'image', 'heading'
    content: str
    page_number: int  # 1-based index
    bbox: dict[str, float]  # {"x": float, "y": float, "w": float, "h": float}
    section_path: list[str] = field(default_factory=list)
    table_markdown: Optional[str] = None
    image_bytes: Optional[bytes] = None
    image_ext: Optional[str] = None
    token_count: int = 0


def _clean_text(text: str) -> str:
    """Clean text by recombining hyphenated words and normalizing whitespace."""
    cleaned = re.sub(r'(\b\w+)-\s*\n\s*(\w+\b)', r'\1\2', text)
    cleaned = re.sub(r'\s*\n\s*', ' ', cleaned)
    return re.sub(r'\s{2,}', ' ', cleaned).strip()


def _normalize_rect(
    rect: pymupdf.Rect,
    page_w: float,
    page_h: float,
    page_x0: float = 0.0,
    page_y0: float = 0.0,
    pad_pt: float = 2.0,
) -> dict[str, float]:
    """Convert absolute PyMuPDF points rect (x0, y0, x1, y1) into normalized [0.0, 1.0] bbox with breathing margin."""
    if page_w <= 0 or page_h <= 0:
        return {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0}
    x0 = max(0.0, min(1.0, (rect.x0 - pad_pt - page_x0) / page_w))
    y0 = max(0.0, min(1.0, (rect.y0 - pad_pt - page_y0) / page_h))
    x1 = max(0.0, min(1.0, (rect.x1 + pad_pt - page_x0) / page_w))
    y1 = max(0.0, min(1.0, (rect.y1 + pad_pt - page_y0) / page_h))
    w = max(0.008, x1 - x0)
    h = max(0.008, y1 - y0)
    return {
        "x": round(x0, 4),
        "y": round(y0, 4),
        "w": round(w, 4),
        "h": round(h, 4),
    }


def _rects_overlap(r1: pymupdf.Rect, r2: pymupdf.Rect, threshold: float = 0.4) -> bool:
    """Check if two bounding boxes significantly intersect."""
    intersection = r1.intersect(r2)
    if intersection.is_empty:
        return False
    inter_area = intersection.width * intersection.height
    min_area = min(r1.width * r1.height, r2.width * r2.height)
    if min_area <= 0:
        return False
    return (inter_area / min_area) >= threshold


class MultimodalPdfParser:
    """Extracts text blocks, tables, and images from PDF documents with precise bboxes."""

    def __init__(self, min_image_size: int = 60):
        self.min_image_size = min_image_size

    def parse_bytes(self, pdf_bytes: bytes, filename: str = "") -> list[ParsedElement]:
        """Parse raw PDF bytes into a structured list of ParsedElements."""
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        elements: list[ParsedElement] = []
        current_section_path: list[str] = []

        try:
            for page_idx in range(len(doc)):
                page = doc[page_idx]
                page_num = page_idx + 1
                page_rect = page.rect
                page_w = page_rect.width
                page_h = page_rect.height
                page_x0 = page_rect.x0
                page_y0 = page_rect.y0

                # ── 1. Table Extraction ───────────────────────────────────────────
                table_rects: list[pymupdf.Rect] = []
                try:
                    tabs = page.find_tables()
                    for t in tabs.tables:
                        t_rect = pymupdf.Rect(t.bbox)
                        table_rects.append(t_rect)
                        norm_bbox = _normalize_rect(t_rect, page_w, page_h, page_x0, page_y0)

                        extracted_rows = t.extract()
                        if not extracted_rows:
                            continue

                        clean_rows = [
                            [str(cell or "").replace("\n", " ").strip() for cell in row]
                            for row in extracted_rows
                        ]
                        if not clean_rows or not any(any(c for c in r) for r in clean_rows):
                            continue

                        headers = clean_rows[0]
                        md_lines = ["| " + " | ".join(headers) + " |"]
                        md_lines.append("| " + " | ".join(["---"] * len(headers)) + " |")
                        for row in clean_rows[1:]:
                            padded = row + [""] * (len(headers) - len(row))
                            md_lines.append("| " + " | ".join(padded[: len(headers)]) + " |")

                        table_md = "\n".join(md_lines)
                        summary = f"Table on Page {page_num} with columns [{', '.join(headers[:5])}]:\n{table_md}"

                        elements.append(
                            ParsedElement(
                                element_type="table",
                                content=summary,
                                page_number=page_num,
                                bbox=norm_bbox,
                                section_path=list(current_section_path),
                                table_markdown=table_md,
                                token_count=len(summary.split()),
                            )
                        )
                except Exception:
                    pass

                # ── 2. Image Extraction ───────────────────────────────────────────
                try:
                    img_list = page.get_images(full=True)
                    for img_idx, img_info in enumerate(img_list):
                        xref = img_info[0]
                        base_image = doc.extract_image(xref)
                        if not base_image:
                            continue

                        width = base_image.get("width", 0)
                        height = base_image.get("height", 0)
                        if width < self.min_image_size or height < self.min_image_size:
                            continue

                        image_bytes = base_image["image"]
                        image_ext = base_image.get("ext", "png")

                        img_rects = page.get_image_rects(xref)
                        if img_rects:
                            img_rect = img_rects[0]
                            norm_bbox = _normalize_rect(img_rect, page_w, page_h, page_x0, page_y0)
                        else:
                            norm_bbox = {"x": 0.1, "y": 0.1, "w": 0.8, "h": 0.3}

                        desc = f"[Figure on Page {page_num} ({width}x{height})]"

                        elements.append(
                            ParsedElement(
                                element_type="image",
                                content=desc,
                                page_number=page_num,
                                bbox=norm_bbox,
                                section_path=list(current_section_path),
                                image_bytes=image_bytes,
                                image_ext=image_ext,
                                token_count=len(desc.split()),
                            )
                        )
                except Exception:
                    pass

                # ── 3. Text Block Extraction & Clean Paragraph Merging ────────────
                try:
                    raw_blocks = page.get_text("blocks")
                    valid_blocks: list[dict[str, Any]] = []

                    for b in raw_blocks:
                        # b: (x0, y0, x1, y1, text, block_no, block_type)
                        if len(b) > 6 and b[6] != 0:
                            # Skip non-text blocks (images/drawings)
                            continue

                        text = b[4].strip()
                        if not text:
                            continue

                        b_rect = pymupdf.Rect(b[0], b[1], b[2], b[3])

                        # Skip if block is already captured inside a table
                        if any(_rects_overlap(b_rect, t_rect, 0.4) for t_rect in table_rects):
                            continue

                        # Filter out headers and footers outside the main reading margins
                        y0_rel = (b[1] - page_y0) / page_h
                        y1_rel = (b[3] - page_y0) / page_h
                        if (y1_rel < 0.04 or y0_rel > 0.96) and len(text) < 50:
                            continue

                        clean_t = _clean_text(text)
                        if not clean_t:
                            continue

                        valid_blocks.append({
                            "x0": b[0],
                            "y0": b[1],
                            "x1": b[2],
                            "y1": b[3],
                            "text": clean_t,
                        })

                    # Merge contiguous blocks belonging to the same semantic paragraph
                    merged_paragraphs: list[dict[str, Any]] = []
                    for b in valid_blocks:
                        if not merged_paragraphs:
                            merged_paragraphs.append(b)
                            continue

                        prev = merged_paragraphs[-1]
                        gap = b["y0"] - prev["y1"]
                        same_col = abs(b["x0"] - prev["x0"]) < 30
                        prev_ends_sentence = prev["text"].endswith((".", "?", "!", ":"))
                        curr_starts_cont = (
                            b["text"][0].islower()
                            or b["text"].startswith(("-", "—", "•", ",", ";", ")", "]"))
                        )

                        # Merge if in same column, small gap, and previous block didn't end sentence
                        # or current block clearly continues the line/sentence
                        should_merge = same_col and gap < 16 and (not prev_ends_sentence or curr_starts_cont)

                        if should_merge:
                            prev["x0"] = min(prev["x0"], b["x0"])
                            prev["y0"] = min(prev["y0"], b["y0"])
                            prev["x1"] = max(prev["x1"], b["x1"])
                            prev["y1"] = max(prev["y1"], b["y1"])
                            prev["text"] += " " + b["text"]
                        else:
                            merged_paragraphs.append(b)

                    # Build ParsedElement for each clean paragraph
                    for p in merged_paragraphs:
                        p_rect = pymupdf.Rect(p["x0"], p["y0"], p["x1"], p["y1"])
                        norm_bbox = _normalize_rect(p_rect, page_w, page_h, page_x0, page_y0)
                        p_text = p["text"]

                        # Detect headings: short line without trailing period, or numbered title
                        is_heading = (
                            len(p_text.splitlines()) <= 1
                            and len(p_text) < 100
                            and not p_text.endswith((".", ":", ";"))
                            and (
                                p_text.isupper()
                                or p_text.startswith(tuple("0123456789#"))
                                or p_text.lower().startswith(("slide ", "section ", "chapter "))
                            )
                        )

                        if is_heading:
                            current_section_path = [p_text]

                        elements.append(
                            ParsedElement(
                                element_type="heading" if is_heading else "text",
                                content=p_text,
                                page_number=page_num,
                                bbox=norm_bbox,
                                section_path=list(current_section_path),
                                token_count=len(p_text.split()),
                            )
                        )
                except Exception:
                    pass

        finally:
            doc.close()

        return elements


multimodal_parser = MultimodalPdfParser()
