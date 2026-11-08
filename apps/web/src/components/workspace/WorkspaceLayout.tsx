/**
 * WorkspaceLayout – 3-panel RIFT workspace with drag-resizable panels.
 *
 *  ┌─────────────────────┠───┠────────────────┐
 *  │                     ║ ← drag → ║ Transcript │
 *  │   PDF Viewer        ║   ║            │
 *  │                     ║   ╠────────────┤
 *  │                     ║   ║ RAG / Q&A  │
 *  └─────────────────────┠───┠────────────┘
 *
 * All three panels are freely resizable by dragging the dividers.
 * Default split: PDF 60% | right column 40%  (transcript 55% | RAG 45%)
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { pdfjs } from "react-pdf";
import { getDocumentChunks } from "@/lib/api";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";
import type { TranscriptParagraph } from "@/lib/workspace";
import { CheckCircle2 } from "lucide-react";
import PDFViewer from "./PDFViewer";
import TranscriptPanel from "./TranscriptPanel";
import RAGPanel from "./RAGPanel";

/* ═══════════════════════════════════════════════════════════════════════════════
   Auto-extract transcript paragraphs from PDF via PDF.js or Backend Chunks
════════════════════════════════════════════════════════════════════════════════ */
function TranscriptExtractor({ documentId }: { documentId?: string }) {
  const { pdfUrl, setParagraphs } = useWorkspace();

  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;

    async function extract() {
      // 1. Try backend chunks first (they have accurate bboxes from the ingestion pipeline)
      if (documentId) {
        try {
          const backendChunks = await getDocumentChunks(documentId);
          if (!cancelled && backendChunks && backendChunks.length > 0) {
            const paras: TranscriptParagraph[] = backendChunks.map((c, i) => ({
              id: c.id,
              index: i,
              text: c.content || (c as any).table_markdown || `[Section ${i + 1}]`,
              bbox: c.bbox
                ? {
                    page: c.page_number ?? 1,
                    x: typeof c.bbox.x === "number" ? c.bbox.x : parseFloat(String(c.bbox.x)),
                    y: typeof c.bbox.y === "number" ? c.bbox.y : parseFloat(String(c.bbox.y)),
                    w: typeof c.bbox.w === "number" ? c.bbox.w : parseFloat(String(c.bbox.w)),
                    h: typeof c.bbox.h === "number" ? c.bbox.h : parseFloat(String(c.bbox.h)),
                  }
                : undefined,
            }));
            setParagraphs(paras);
            return;
          }
        } catch {
          /* fall through to client extraction */
        }
      }

      // 2. Client-side fallback: extract text runs from PDF.js and build
      //    bounding boxes that are accurate relative to each page viewport.
      try {
        const pdf = await pdfjs.getDocument({ url: pdfUrl! }).promise;
        const paras: TranscriptParagraph[] = [];
        let globalIdx = 0;

        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const viewport = page.getViewport({ scale: 1 });
          const content = await page.getTextContent();

          // 1. Extract each text item with its exact screen-space rectangle
          interface TextItemRect {
            str: string;
            x0: number;
            y0: number;
            x1: number;
            y1: number;
            height: number;
          }

          const items: TextItemRect[] = [];
          for (const rawItem of content.items) {
            if (!("str" in rawItem) || !(rawItem as { str: string }).str.trim()) continue;
            const it = rawItem as {
              str: string;
              transform: number[];
              width: number;
              height: number;
            };
            const itemH = Math.abs(it.height) || Math.hypot(it.transform[2], it.transform[3]) || 12;
            const tx = it.transform[4];
            const ty = it.transform[5];

            let vx0 = tx;
            let vy0 = viewport.height - ty - itemH;
            let vx1 = tx + it.width;
            let vy1 = viewport.height - ty;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const vp = viewport as any;
            if (typeof vp.convertToViewportRectangle === "function") {
              try {
                const rect = vp.convertToViewportRectangle([tx, ty, tx + it.width, ty + itemH]);
                if (Array.isArray(rect) && rect.length === 4) {
                  [vx0, vy0, vx1, vy1] = rect;
                }
              } catch {}
            } else if (typeof vp.convertToViewportPoint === "function") {
              try {
                const p0 = vp.convertToViewportPoint(tx, ty + itemH);
                const p1 = vp.convertToViewportPoint(tx + it.width, ty);
                if (Array.isArray(p0) && Array.isArray(p1)) {
                  [vx0, vy0] = p0;
                  [vx1, vy1] = p1;
                }
              } catch {}
            }

            const left = Math.max(0, Math.min(vx0, vx1));
            const top = Math.max(0, Math.min(vy0, vy1));
            const right = Math.min(viewport.width, Math.max(vx0, vx1));
            const bottom = Math.min(viewport.height, Math.max(vy0, vy1));

            if (right - left <= 0 || bottom - top <= 0) continue;

            items.push({
              str: it.str,
              x0: left,
              y0: top,
              x1: right,
              y1: bottom,
              height: bottom - top,
            });
          }

          if (items.length === 0) continue;

          // 2. Sort items: top-to-bottom, then left-to-right
          items.sort((a, b) => {
            const yDiff = a.y0 - b.y0;
            if (Math.abs(yDiff) > 4) return yDiff;
            return a.x0 - b.x0;
          });

          // 3. Group items into visual lines (same horizontal baseline, respecting columns)
          interface VisualLine {
            x0: number;
            y0: number;
            x1: number;
            y1: number;
            text: string;
          }
          const lines: VisualLine[] = [];

          for (const item of items) {
            const line = lines.find(
              (l) =>
                Math.abs(item.y0 - l.y0) <= Math.max(item.height, 12) * 0.45 &&
                item.x0 >= l.x0 - 10 &&
                item.x0 - l.x1 <= 35
            );

            if (line) {
              line.text += " " + item.str.trim();
              line.x0 = Math.min(line.x0, item.x0);
              line.x1 = Math.max(line.x1, item.x1);
              line.y0 = Math.min(line.y0, item.y0);
              line.y1 = Math.max(line.y1, item.y1);
            } else {
              lines.push({
                x0: item.x0,
                y0: item.y0,
                x1: item.x1,
                y1: item.y1,
                text: item.str.trim(),
              });
            }
          }

          // Sort lines by reading order
          lines.sort((a, b) => {
            const yDiff = a.y0 - b.y0;
            if (Math.abs(yDiff) > 6) return yDiff;
            return a.x0 - b.x0;
          });

          // 4. Merge lines into semantic paragraphs
          const mergedParas: VisualLine[] = [];
          for (const line of lines) {
            if (mergedParas.length === 0) {
              mergedParas.push({ ...line });
              continue;
            }
            const prev = mergedParas[mergedParas.length - 1];
            const gap = line.y0 - prev.y1;
            const sameCol = Math.abs(line.x0 - prev.x0) < 30;
            const prevEndsSentence = /[.?!:]\s*$/.test(prev.text);
            const currStartsCont = /^[a-z0-9—–•\-,;\]\)]/.test(line.text);
            const isHeading = prev.text.length < 80 && !prevEndsSentence && (gap > 8 || line.text.length > 80);

            const shouldMerge =
              sameCol &&
              gap >= -2 &&
              gap < 14 &&
              (!prevEndsSentence || currStartsCont) &&
              !isHeading;

            if (shouldMerge) {
              prev.x0 = Math.min(prev.x0, line.x0);
              prev.x1 = Math.max(prev.x1, line.x1);
              prev.y0 = Math.min(prev.y0, line.y0);
              prev.y1 = Math.max(prev.y1, line.y1);
              prev.text += " " + line.text;
            } else {
              mergedParas.push({ ...line });
            }
          }

          // 5. Convert to normalized TranscriptParagraphs
          for (const m of mergedParas) {
            const cleanText = m.text.replace(/\s+/g, " ").trim();
            if (cleanText.length < 3) continue;

            // Filter out recurring header/footer elements
            const ny = m.y0 / viewport.height;
            const nBottom = m.y1 / viewport.height;
            if ((ny < 0.04 || nBottom > 0.96) && cleanText.length < 40) continue;

            // Small breathing room in point space so bounding box doesn't touch or clip glyphs
            const nx = Math.max(0, Math.min(1, (m.x0 - 2) / viewport.width));
            const normY = Math.max(0, Math.min(1, (m.y0 - 2) / viewport.height));
            const nw = Math.max(0.01, Math.min(1 - nx, (m.x1 - m.x0 + 4) / viewport.width));
            const nh = Math.max(0.01, Math.min(1 - normY, (m.y1 - m.y0 + 4) / viewport.height));

            paras.push({
              id: `p-${globalIdx}`,
              index: globalIdx,
              text: cleanText,
              bbox: {
                page: p,
                x: Math.round(nx * 10000) / 10000,
                y: Math.round(normY * 10000) / 10000,
                w: Math.round(nw * 10000) / 10000,
                h: Math.round(nh * 10000) / 10000,
              },
            });
            globalIdx++;
          }
        }

        if (!cancelled) setParagraphs(paras);
      } catch (err) {
        console.warn("Transcript extraction failed:", err);
      }
    }

    extract();
    return () => { cancelled = true; };
  }, [pdfUrl, setParagraphs, documentId]);

  return null;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Column Divider (drag left ↔ right to resize adjacent columns)
════════════════════════════════════════════════════════════════════════════════ */
function ColumnDivider({
  onDrag,
}: {
  onDrag: (delta: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const lastPos = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(true);
      lastPos.current = e.clientX;

      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - lastPos.current;
        lastPos.current = ev.clientX;
        onDrag(delta);
      };

      const onUp = () => {
        setDragging(false);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [onDrag]
  );

  const isActive = hovered || dragging;

  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "6px",
        height: "100%",
        flexShrink: 0,
        cursor: "col-resize",
        position: "relative",
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.15s ease",
      }}
    >
      {/* visual indicator track */}
      <div
        style={{
          width: isActive ? "3px" : "1.5px",
          height: isActive ? "80%" : "50%",
          borderRadius: "9999px",
          background: isActive
            ? "rgba(139, 92, 246, 0.9)"
            : "rgba(255, 255, 255, 0.12)",
          boxShadow: isActive ? "0 0 10px rgba(139, 92, 246, 0.7)" : "none",
          transition: "all 0.15s ease",
        }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Inner layout – 3 vertical columns: PDF Viewer | Transcript | RAG Q&A
════════════════════════════════════════════════════════════════════════════════ */
function Layout({ documentId }: { documentId?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { paragraphs, activeParagraphId } = useWorkspace();

  /* Reading roadmap: coverage = how many paragraphs have been activated / total */
  const withBoxCount = paragraphs.filter((p) => p.bbox && p.bbox.w > 0.001).length;
  const activeIdx    = paragraphs.findIndex((p) => p.id === activeParagraphId);
  const coveragePct  = withBoxCount > 0 ? Math.round(((activeIdx + 1) / withBoxCount) * 100) : 0;

  // Column proportions (sum to 1.0): [PDF, Transcript, RAG]
  const [colWidths, setColWidths] = useState<[number, number, number]>([0.42, 0.29, 0.29]);

  /* Drag handler between col 0 (PDF) and col 1 (Transcript) */
  const onDragDivider0 = useCallback((delta: number) => {
    if (!containerRef.current) return;
    const totalW = containerRef.current.offsetWidth;
    const deltaPct = delta / totalW;

    setColWidths(([w0, w1, w2]) => {
      let newW0 = w0 + deltaPct;
      let newW1 = w1 - deltaPct;

      const minW = 0.18;
      const maxW = 0.65;

      if (newW0 < minW) {
        newW1 -= (minW - newW0);
        newW0 = minW;
      } else if (newW0 > maxW) {
        newW1 += (newW0 - maxW);
        newW0 = maxW;
      }

      if (newW1 < minW) {
        newW0 -= (minW - newW1);
        newW1 = minW;
      }

      return [newW0, newW1, w2];
    });
  }, []);

  /* Drag handler between col 1 (Transcript) and col 2 (RAG) */
  const onDragDivider1 = useCallback((delta: number) => {
    if (!containerRef.current) return;
    const totalW = containerRef.current.offsetWidth;
    const deltaPct = delta / totalW;

    setColWidths(([w0, w1, w2]) => {
      let newW1 = w1 + deltaPct;
      let newW2 = w2 - deltaPct;

      const minW = 0.18;
      const maxW = 0.60;

      if (newW1 < minW) {
        newW2 -= (minW - newW1);
        newW1 = minW;
      } else if (newW1 > maxW) {
        newW2 += (newW1 - maxW);
        newW1 = maxW;
      }

      if (newW2 < minW) {
        newW1 -= (minW - newW2);
        newW2 = minW;
      }

      return [w0, newW1, newW2];
    });
  }, []);

  const w0 = `${(colWidths[0] * 100).toFixed(2)}%`;
  const w1 = `${(colWidths[1] * 100).toFixed(2)}%`;
  const w2 = `${(colWidths[2] * 100).toFixed(2)}%`;

  /* ── Portal target for Roadmap in ChatPageContent top bar ── */
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = document.getElementById("rift-topbar-right");
    if (el) setPortalTarget(el);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", minHeight: 0 }}>
      {/* ── Roadmap portal → rendered into top bar ── */}
      {portalTarget && withBoxCount > 0 && createPortal(
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <CheckCircle2 size={12} color="#06b6d4" />
          <span
            style={{
              fontSize: "9.5px",
              fontFamily: "var(--font-mono)",
              color: "#67e8f9",
              letterSpacing: "0.08em",
            }}
          >
            ROADMAP
          </span>
          <div
            style={{
              width: "70px",
              height: "4px",
              borderRadius: "2px",
              background: "rgba(255,255,255,0.08)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${coveragePct}%`,
                height: "100%",
                background: "linear-gradient(90deg, #06b6d4, #10b981)",
                borderRadius: "2px",
                transition: "width 0.4s ease",
              }}
            />
          </div>
          <span
            style={{
              fontSize: "9.5px",
              fontFamily: "var(--font-mono)",
              color: "#10b981",
            }}
          >
            {coveragePct}%
          </span>
        </div>,
        portalTarget
      )}

    <div
      ref={containerRef}
      style={{
        display: "flex",
        flexDirection: "row",
        height: "100%",
        width: "100%",
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
        userSelect: "none",
        gap: 0,
      }}
    >
      {/* ── Column 1: PDF Viewer ── */}
      <div
        style={{
          width: w0,
          flexShrink: 0,
          height: "100%",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <PDFViewer />
      </div>

      {/* ── Divider 0 (between PDF and Transcript) ── */}
      <ColumnDivider onDrag={onDragDivider0} />

      {/* ── Column 2: Transcript Panel ── */}
      <div
        style={{
          width: w1,
          flexShrink: 0,
          height: "100%",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <TranscriptPanel />
      </div>

      {/* ── Divider 1 (between Transcript and RAG) ── */}
      <ColumnDivider onDrag={onDragDivider1} />

      {/* ── Column 3: RAG / Q&A Panel ── */}
      <div
        style={{
          width: w2,
          flexShrink: 0,
          height: "100%",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <RAGPanel />
      </div>

      {/* Silent transcript extractor */}
      <TranscriptExtractor documentId={documentId} />
    </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Exported component – wraps in provider
════════════════════════════════════════════════════════════════════════════════ */
export default function WorkspaceLayout({
  pdfUrl,
  documentId,
}: {
  pdfUrl: string;
  documentId?: string;
}) {
  return (
    <WorkspaceProvider initialPdfUrl={pdfUrl} initialDocumentId={documentId}>
      <Layout documentId={documentId} />
    </WorkspaceProvider>
  );
}
