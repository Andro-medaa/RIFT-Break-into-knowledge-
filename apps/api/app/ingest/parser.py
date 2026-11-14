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
    min_dim: float = 0.008,
) -> dict[str, float]:
    """Convert absolute PyMuPDF points rect (x0, y0, x1, y1) into normalized [0.0, 1.0] bbox."""
    if page_w <= 0 or page_h <= 0:
        return {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0}
    x0 = max(0.0, min(1.0, (rect.x0 - pad_pt - page_x0) / page_w))
    y0 = max(0.0, min(1.0, (rect.y0 - pad_pt - page_y0) / page_h))
    x1 = max(0.0, min(1.0, (rect.x1 + pad_pt - page_x0) / page_w))
    y1 = max(0.0, min(1.0, (rect.y1 + pad_pt - page_y0) / page_h))
    w = min(1.0 - x0, max(min_dim, x1 - x0))
    h = min(1.0 - y0, max(min_dim, y1 - y0))
    return {
        "x": round(x0, 4),
        "y": round(y0, 4),
        "w": round(w, 4),
        "h": round(h, 4),
    }


def _cap_horizontal_padding(
    ax0: float,
    ay0: float,
    ax1: float,
    ay1: float,
    pad_l: float,
    pad_r: float,
    nx0: float,
    ny0: float,
    nx1: float,
    ny1: float,
    *,
    factor: float,
    max_pad_y: float,
    min_gap: float,
    touch_tol: float,
) -> tuple[float, float]:
    """Shrink left/right padding when a neighbor overlaps this box's vertical band."""
    if (ny0 - max_pad_y) < (ay1 + max_pad_y) and (ay0 - max_pad_y) < (ny1 + max_pad_y):
        if nx0 >= ax1 - touch_tol and nx1 > ax1:
            pad_r = min(pad_r, max(0.0, (nx0 - ax1 - min_gap) * factor))
        if nx1 <= ax0 + touch_tol and nx0 < ax0:
            pad_l = min(pad_l, max(0.0, (ax0 - nx1 - min_gap) * factor))
    return pad_l, pad_r


def _cap_vertical_padding(
    ax0: float,
    ay0: float,
    ax1: float,
    ay1: float,
    pad_l: float,
    pad_r: float,
    pad_t: float,
    pad_b: float,
    nx0: float,
    ny0: float,
    nx1: float,
    ny1: float,
    *,
    factor: float,
    min_gap: float,
    touch_tol: float,
    peer_pad_l: float = 0.0,
    peer_pad_r: float = 0.0,
) -> tuple[float, float]:
    """Shrink top/bottom padding when horizontally padded ranges overlap a neighbor."""
    if (nx0 - peer_pad_l) < (ax1 + pad_r) and (ax0 - pad_l) < (nx1 + peer_pad_r):
        if ny0 >= ay1 - touch_tol and ny1 > ay1:
            pad_b = min(pad_b, max(0.0, (ny0 - ay1 - min_gap) * factor))
        if ny1 <= ay0 + touch_tol and ny0 < ay0:
            pad_t = min(pad_t, max(0.0, (ay0 - ny1 - min_gap) * factor))
    return pad_t, pad_b


def normalize_context_aware_rects(
    text_rects: list[pymupdf.Rect],
    page_w: float,
    page_h: float,
    page_x0: float = 0.0,
    page_y0: float = 0.0,
    obstacle_rects: Optional[list[pymupdf.Rect]] = None,
) -> list[dict[str, float]]:
    """Expand text rects symmetrically within available whitespace without covering neighbor text."""
    if not text_rects:
        return []
    if page_w <= 0 or page_h <= 0:
        return [{"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0} for _ in text_rects]

    max_pad_x = max(2.0, 0.0082 * page_w)
    max_pad_y = max(1.5, 0.0055 * page_w)
    min_gap = max(0.8, 0.0024 * page_w)
    touch_tol = max(1.0, 0.003 * page_w)
    page_x1 = page_x0 + page_w
    page_y1 = page_y0 + page_h
    obstacles = obstacle_rects or []

    # Initialise outward margin caps clamped to the page boundaries.
    pads_l = [min(max_pad_x, max(0.0, r.x0 - page_x0)) for r in text_rects]
    pads_r = [min(max_pad_x, max(0.0, page_x1 - r.x1)) for r in text_rects]
    pads_t = [min(max_pad_y, max(0.0, r.y0 - page_y0)) for r in text_rects]
    pads_b = [min(max_pad_y, max(0.0, page_y1 - r.y1)) for r in text_rects]

    # Pass 1: resolve horizontal padding first so adjacent columns do not falsely cap vertical pad.
    for i, a in enumerate(text_rects):
        pl, pr = pads_l[i], pads_r[i]
        for j, b in enumerate(text_rects):
            if i == j:
                continue
            pl, pr = _cap_horizontal_padding(
                a.x0, a.y0, a.x1, a.y1, pl, pr, b.x0, b.y0, b.x1, b.y1,
                factor=0.5, max_pad_y=max_pad_y, min_gap=min_gap, touch_tol=touch_tol,
            )
        for obs in obstacles:
            pl, pr = _cap_horizontal_padding(
                a.x0, a.y0, a.x1, a.y1, pl, pr, obs.x0, obs.y0, obs.x1, obs.y1,
                factor=1.0, max_pad_y=max_pad_y, min_gap=min_gap, touch_tol=touch_tol,
            )
        pads_l[i], pads_r[i] = pl, pr

    # Pass 2: resolve vertical padding using actual padded horizontal intervals.
    for i, a in enumerate(text_rects):
        pl, pr, pt, pb = pads_l[i], pads_r[i], pads_t[i], pads_b[i]
        for j, b in enumerate(text_rects):
            if i == j:
                continue
            pt, pb = _cap_vertical_padding(
                a.x0, a.y0, a.x1, a.y1, pl, pr, pt, pb, b.x0, b.y0, b.x1, b.y1,
                factor=0.5, min_gap=min_gap, touch_tol=touch_tol,
                peer_pad_l=pads_l[j], peer_pad_r=pads_r[j],
            )
        for obs in obstacles:
            pt, pb = _cap_vertical_padding(
                a.x0, a.y0, a.x1, a.y1, pl, pr, pt, pb, obs.x0, obs.y0, obs.x1, obs.y1,
                factor=1.0, min_gap=min_gap, touch_tol=touch_tol,
            )
        pads_t[i], pads_b[i] = pt, pb

    return [
        _normalize_rect(
            pymupdf.Rect(
                r.x0 - pads_l[i],
                r.y0 - pads_t[i],
                r.x1 + pads_r[i],
                r.y1 + pads_b[i],
            ),
            page_w,
            page_h,
            page_x0,
            page_y0,
            pad_pt=0.0,
            min_dim=0.002,
        )
        for i, r in enumerate(text_rects)
    ]


def extract_page_text_blocks_with_bboxes(page: pymupdf.Page) -> list[tuple[int, str, dict[str, float]]]:
    """Extract cleaned text blocks from a page with surrounding-text-aware padded bboxes."""
    page_rect = page.rect
    pw = page_rect.width or 1.0
    ph = page_rect.height or 1.0
    px0 = page_rect.x0
    py0 = page_rect.y0

    kept: list[tuple[int, str, pymupdf.Rect]] = []
    obstacles: list[pymupdf.Rect] = []
    for b_idx, b in enumerate(page.get_text("blocks")):
        if len(b) > 6 and b[6] != 0:
            if len(b) >= 4:
                obstacles.append(pymupdf.Rect(float(b[0]), float(b[1]), float(b[2]), float(b[3])))
            continue
        if len(b) >= 5 and b[4] and b[4].strip():
            txt = b[4].strip()
            rect = pymupdf.Rect(float(b[0]), float(b[1]), float(b[2]), float(b[3]))
            if len(txt) < 8 and not any(ch.isalpha() for ch in txt):
                obstacles.append(rect)
                continue
            kept.append((b_idx, txt, rect))

    if not kept:
        return []

    # Clean text and merge horizontally adjacent equation/formula blocks into single unified bboxes
    cleaned_kept: list[tuple[int, str, pymupdf.Rect]] = []
    for b_idx, txt, rect in kept:
        # Strip raw Unicode math decorator brackets (⏞, ⏟) that look like weird faces
        txt = re.sub(r'[\u23de\u23df\u23dc\u23dd\u23b4\u23b5]', '', txt)
        # Expand common squashed PDF subscripts (e.g. Hstatic -> H_static, Hdynamic -> H_dynamic, zstatic -> z_static)
        txt = re.sub(r'\b([A-Za-z])(?:_)?(static|dynamic|total|ortho|jepa|mae|sim|loss|pred|target|init|corr|cov|var)\b', r'\1_\2', txt)
        txt = re.sub(r'\s*\n\s*', ' ', txt)
        txt = re.sub(r'\s{2,}', ' ', txt).strip()
        if not txt:
            obstacles.append(rect)
            continue
        cleaned_kept.append((b_idx, txt, rect))

    merged_kept: list[tuple[int, str, pymupdf.Rect]] = []
    math_op_regex = r'[=+\-–·\(\)\[\]\{\}\\\/^_∑∫ϵλε\u0370-\u03ff]'
    for b_idx, txt, rect in cleaned_kept:
        if not merged_kept:
            merged_kept.append((b_idx, txt, rect))
            continue
        prev_idx, prev_txt, prev_rect = merged_kept[-1]

        # Check if prev and curr belong to the same equation / line:
        y_overlap = min(prev_rect.y1, rect.y1) - max(prev_rect.y0, rect.y0)
        min_h = max(1.0, min(prev_rect.height, rect.height))
        same_y = (y_overlap / min_h) > 0.35 or abs(prev_rect.y0 - rect.y0) < 8.0

        h_gap = rect.x0 - prev_rect.x1
        adjacent_h = -6.0 <= h_gap <= 55.0

        is_math = bool(re.search(math_op_regex, prev_txt) or re.search(math_op_regex, txt) or re.match(r'^[=+\-–·\*\/\.]', txt))

        if same_y and adjacent_h and is_math:
            merged_rect = pymupdf.Rect(
                min(prev_rect.x0, rect.x0),
                min(prev_rect.y0, rect.y0),
                max(prev_rect.x1, rect.x1),
                max(prev_rect.y1, rect.y1),
            )
            merged_kept[-1] = (prev_idx, f"{prev_txt} {txt}".strip(), merged_rect)
        else:
            merged_kept.append((b_idx, txt, rect))

    if not merged_kept:
        return []

    bboxes = normalize_context_aware_rects(
        [r for _, _, r in merged_kept],
        pw,
        ph,
        px0,
        py0,
        obstacle_rects=obstacles,
    )
    return [(b_idx, txt, bbox) for (b_idx, txt, _), bbox in zip(merged_kept, bboxes)]


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
                image_rects: list[pymupdf.Rect] = []
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
                            image_rects.append(img_rect)
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
                    obstacle_rects: list[pymupdf.Rect] = [
                        pymupdf.Rect(r.x0 - 2.0, r.y0 - 2.0, r.x1 + 2.0, r.y1 + 2.0)
                        for r in (*table_rects, *image_rects)
                    ]

                    for b in raw_blocks:
                        b_rect = pymupdf.Rect(b[0], b[1], b[2], b[3])
                        # b: (x0, y0, x1, y1, text, block_no, block_type)
                        if len(b) > 6 and b[6] != 0:
                            # Skip non-text blocks (images/drawings) while treating them as obstacles
                            obstacle_rects.append(b_rect)
                            continue

                        text = b[4].strip()
                        if not text:
                            continue

                        # Skip if block is already captured inside a table
                        if any(_rects_overlap(b_rect, t_rect, 0.4) for t_rect in table_rects):
                            continue

                        # Filter out headers and footers outside the main reading margins
                        y0_rel = (b[1] - page_y0) / page_h
                        y1_rel = (b[3] - page_y0) / page_h
                        if (y1_rel < 0.04 or y0_rel > 0.96) and len(text) < 50:
                            obstacle_rects.append(b_rect)
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

                    # Build ParsedElement for each clean paragraph with surrounding-text-aware padding
                    p_rects = [pymupdf.Rect(p["x0"], p["y0"], p["x1"], p["y1"]) for p in merged_paragraphs]
                    norm_bboxes = normalize_context_aware_rects(
                        p_rects,
                        page_w,
                        page_h,
                        page_x0,
                        page_y0,
                        obstacle_rects=obstacle_rects,
                    )
                    for p, norm_bbox in zip(merged_paragraphs, norm_bboxes):
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
