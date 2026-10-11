/**
 * Normalized coordinate rectangle where x0, y0, x1, y1 are fractions (0..1)
 * relative to page width and height (top-left origin).
 *
 * Contract locked in RIFT architecture:
 * x0 = left / pageWidth
 * y0 = top / pageHeight
 * x1 = right / pageWidth
 * y1 = bottom / pageHeight
 */
export interface NormalizedRect {
  x0: number; // 0..1
  y0: number; // 0..1
  x1: number; // 0..1
  y1: number; // 0..1
}

export type HighlightColor = "cyan" | "amber" | "purple" | "emerald";

export interface HighlightItem {
  id: string;
  pageNo: number; // 1-indexed
  rects: NormalizedRect[];
  text?: string;
  color?: HighlightColor;
  label?: string;
  isActive?: boolean;
}

export interface PdfDocumentMeta {
  numPages: number;
  title: string;
  currentPage: number;
  zoom: number; // 0.5 to 2.0
  spotlightMode: boolean;
}
