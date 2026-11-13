import type { ScriptSegmentItem } from "./api";
import type { TranscriptParagraph } from "./workspace";

export interface NormalizedBBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PageBBox extends NormalizedBBox {
  page: number;
}

export interface PageFirstBBoxTarget {
  id: string;
  page: number;
  bbox: PageBBox;
  kind: "paragraph" | "segment";
}

/** Validate normalized [0..1] PDF bounding box coordinates. */
export function isValidBBox(bbox?: NormalizedBBox | null): bbox is NormalizedBBox {
  return Boolean(
    bbox &&
      Number.isFinite(bbox.x) &&
      Number.isFinite(bbox.y) &&
      Number.isFinite(bbox.w) &&
      Number.isFinite(bbox.h) &&
      bbox.w > 0.001 &&
      bbox.h > 0.001 &&
      bbox.x >= 0 &&
      bbox.y >= 0 &&
      bbox.x + bbox.w <= 1.01 &&
      bbox.y + bbox.h <= 1.01
  );
}

/** Order bounding boxes top-to-bottom, then left-to-right within the same line. */
export function compareBBoxReadingOrder(a: NormalizedBBox, b: NormalizedBBox): number {
  const dy = a.y - b.y;
  if (Math.abs(dy) > 0.005) return dy;
  return a.x - b.x;
}

/**
 * Link each PDF page number to the 1st valid bounding box on that page.
 * Prefers paragraph bboxes (preserving Transcript sync) and falls back to
 * script segment bboxes for pages without paragraph bboxes.
 */
export function buildFirstBBoxByPage(
  paragraphs: TranscriptParagraph[],
  scriptSegments: ScriptSegmentItem[]
): Map<number, PageFirstBBoxTarget> {
  const byPage = new Map<number, PageFirstBBoxTarget>();

  const paraCandidates = new Map<number, PageFirstBBoxTarget[]>();
  for (const p of paragraphs) {
    const pg = p.bbox?.page;
    if (!pg || !isValidBBox(p.bbox)) continue;
    let list = paraCandidates.get(pg);
    if (!list) {
      list = [];
      paraCandidates.set(pg, list);
    }
    list.push({
      id: p.id,
      page: pg,
      bbox: { page: pg, x: p.bbox.x, y: p.bbox.y, w: p.bbox.w, h: p.bbox.h },
      kind: "paragraph",
    });
  }

  for (const [pg, list] of paraCandidates) {
    list.sort((a, b) => compareBBoxReadingOrder(a.bbox, b.bbox));
    byPage.set(pg, list[0]);
  }

  const segCandidates = new Map<number, PageFirstBBoxTarget[]>();
  for (const s of scriptSegments) {
    const pg = s.page_number;
    if (!pg || byPage.has(pg) || !isValidBBox(s.bbox)) continue;
    let list = segCandidates.get(pg);
    if (!list) {
      list = [];
      segCandidates.set(pg, list);
    }
    list.push({
      id: s.chunk_id || s.id,
      page: pg,
      bbox: { page: pg, x: s.bbox.x, y: s.bbox.y, w: s.bbox.w, h: s.bbox.h },
      kind: "segment",
    });
  }

  for (const [pg, list] of segCandidates) {
    list.sort((a, b) => compareBBoxReadingOrder(a.bbox, b.bbox));
    byPage.set(pg, list[0]);
  }

  return byPage;
}

/**
 * Compute scrollTop for the PDF scroll container so `bboxY` (normalized [0..1])
 * on `pageRect` is positioned cleanly in the upper third of `containerRect`.
 */
export function computeBBoxScrollTop(
  containerRect: { top: number; height: number },
  pageRect: { top: number; height: number },
  containerScrollTop: number,
  bboxY: number
): number {
  const bboxYPixels = bboxY * pageRect.height;
  const currentBBoxTopRelative = pageRect.top + bboxYPixels - containerRect.top;
  const targetScrollTop =
    containerScrollTop + currentBBoxTopRelative - containerRect.height / 3;
  return Math.max(0, targetScrollTop);
}

