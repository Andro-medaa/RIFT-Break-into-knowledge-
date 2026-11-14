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
import { CheckCircle2, MessageSquare } from "lucide-react";
import { useIsMobile } from "@/lib/useIsMobile";
import PDFViewer from "./PDFViewer";
import TranscriptPanel from "./TranscriptPanel";
import RAGPanel from "./RAGPanel";
import RoadmapPopover from "./RoadmapPopover";
import TopBarControls from "./TopBarControls";

interface PageBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function capHorizontalPadding(
  a: PageBox,
  pad: { l: number; r: number },
  n: PageBox,
  factor: number,
  maxPadY: number,
  minGap: number,
  touchTol: number
) {
  const yOverlaps =
    n.y0 - maxPadY < a.y1 + maxPadY && a.y0 - maxPadY < n.y1 + maxPadY;
  if (!yOverlaps) return;
  if (n.x0 >= a.x1 - touchTol && n.x1 > a.x1) {
    pad.r = Math.min(pad.r, Math.max(0, (n.x0 - a.x1 - minGap) * factor));
  }
  if (n.x1 <= a.x0 + touchTol && n.x0 < a.x0) {
    pad.l = Math.min(pad.l, Math.max(0, (a.x0 - n.x1 - minGap) * factor));
  }
}

function capVerticalPadding(
  a: PageBox,
  pad: { l: number; r: number; t: number; b: number },
  n: PageBox,
  factor: number,
  minGap: number,
  touchTol: number,
  peerPadL = 0,
  peerPadR = 0
) {
  const xOverlaps = n.x0 - peerPadL < a.x1 + pad.r && a.x0 - pad.l < n.x1 + peerPadR;
  if (!xOverlaps) return;
  if (n.y0 >= a.y1 - touchTol && n.y1 > a.y1) {
    pad.b = Math.min(pad.b, Math.max(0, (n.y0 - a.y1 - minGap) * factor));
  }
  if (n.y1 <= a.y0 + touchTol && n.y0 < a.y0) {
    pad.t = Math.min(pad.t, Math.max(0, (a.y0 - n.y1 - minGap) * factor));
  }
}

/**
 * Expand each text box dynamically into free surrounding whitespace while capping expansion
 * so neighboring chunks and surrounding text obstacles are never overlapped or covered.
 */
export function computeContextAwareNormBBoxes(
  boxes: PageBox[],
  obstacles: PageBox[],
  pageW: number,
  pageH: number
): Array<{ x: number; y: number; w: number; h: number }> {
  if (boxes.length === 0) return [];
  if (pageW <= 0 || pageH <= 0) {
    return boxes.map(() => ({ x: 0, y: 0, w: 1, h: 1 }));
  }

  const maxPadX = Math.max(2.0, 0.0082 * pageW);
  const maxPadY = Math.max(1.5, 0.0055 * pageW);
  const minGap = Math.max(0.8, 0.0024 * pageW);
  const touchTol = Math.max(1.0, 0.003 * pageW);

  const pads = boxes.map((r) => ({
    l: Math.min(maxPadX, Math.max(0, r.x0)),
    r: Math.min(maxPadX, Math.max(0, pageW - r.x1)),
    t: Math.min(maxPadY, Math.max(0, r.y0)),
    b: Math.min(maxPadY, Math.max(0, pageH - r.y1)),
  }));

  // Pass 1: horizontal caps so adjacent columns remain horizontally isolated.
  for (let i = 0; i < boxes.length; i++) {
    for (let j = 0; j < boxes.length; j++) {
      if (i === j) continue;
      capHorizontalPadding(boxes[i], pads[i], boxes[j], 0.5, maxPadY, minGap, touchTol);
    }
    for (const obs of obstacles) {
      capHorizontalPadding(boxes[i], pads[i], obs, 1.0, maxPadY, minGap, touchTol);
    }
  }

  // Pass 2: vertical caps using actual Pass-1 padded horizontal intervals.
  for (let i = 0; i < boxes.length; i++) {
    for (let j = 0; j < boxes.length; j++) {
      if (i === j) continue;
      capVerticalPadding(
        boxes[i],
        pads[i],
        boxes[j],
        0.5,
        minGap,
        touchTol,
        pads[j].l,
        pads[j].r
      );
    }
    for (const obs of obstacles) {
      capVerticalPadding(boxes[i], pads[i], obs, 1.0, minGap, touchTol);
    }
  }

  return boxes.map((r, i) => {
    const p = pads[i];
    const nx = Math.max(0, Math.min(1, (r.x0 - p.l) / pageW));
    const ny = Math.max(0, Math.min(1, (r.y0 - p.t) / pageH));
    const nx1 = Math.max(nx, Math.min(1, (r.x1 + p.r) / pageW));
    const ny1 = Math.max(ny, Math.min(1, (r.y1 + p.b) / pageH));
    const nw = Math.min(1 - nx, Math.max(0.002, nx1 - nx));
    const nh = Math.min(1 - ny, Math.max(0.002, ny1 - ny));
    return {
      x: Math.round(nx * 10000) / 10000,
      y: Math.round(ny * 10000) / 10000,
      w: Math.round(nw * 10000) / 10000,
      h: Math.round(nh * 10000) / 10000,
    };
  });
}

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
              chunkType: c.chunk_type,
              imageUrl: c.image_url,
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
            const descender = itemH * 0.2;
            const tx = it.transform[4];
            const ty = it.transform[5];

            let vx0 = tx;
            let vy0 = viewport.height - ty - itemH;
            let vx1 = tx + it.width;
            let vy1 = viewport.height - ty + descender;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const vp = viewport as any;
            if (typeof vp.convertToViewportRectangle === "function") {
              try {
                const rect = vp.convertToViewportRectangle([tx, ty - descender, tx + it.width, ty + itemH]);
                if (Array.isArray(rect) && rect.length === 4) {
                  [vx0, vy0, vx1, vy1] = rect;
                }
              } catch {}
            } else if (typeof vp.convertToViewportPoint === "function") {
              try {
                const p0 = vp.convertToViewportPoint(tx, ty + itemH);
                const p1 = vp.convertToViewportPoint(tx + it.width, ty - descender);
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
            // Strip raw Unicode math decorator brackets (⏞, ⏟) that look like faces
            line.text = line.text.replace(/[\u23de\u23df\u23dc\u23dd\u23b4\u23b5]/g, "");

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

            // Math equation horizontal term continuation (e.g. term1 + term2 + term3 on same equation line)
            const isMathLine =
              /[=+\-–·\(\)\[\]\{\}\\\/^_∑∫ϵλε\u0370-\u03ff]/.test(prev.text) ||
              /[=+\-–·\(\)\[\]\{\}\\\/^_∑∫ϵλε\u0370-\u03ff]/.test(line.text) ||
              /^[=+\-–·\*\/\.]/.test(line.text);
            const sameBaseline = Math.abs(line.y0 - prev.y0) < 10;
            const adjacentH = line.x0 >= prev.x0 - 10 && line.x0 - prev.x1 <= 55;

            const shouldMerge =
              (sameCol &&
                gap >= -6 &&
                gap < 14 &&
                (!prevEndsSentence || currStartsCont) &&
                !isHeading) ||
              (isMathLine && sameBaseline && adjacentH);

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

          // 5. Filter noise into fixed obstacles and pad kept paragraphs cleanly around surrounding text
          const keptParas: Array<{ text: string; box: PageBox }> = [];
          const obstacles: PageBox[] = [];
          for (const m of mergedParas) {
            const cleanText = m.text
              .replace(/[\u23de\u23df\u23dc\u23dd\u23b4\u23b5]/g, "")
              .replace(/\b([A-Za-z])(?:_)?(static|dynamic|total|ortho|jepa|mae|sim|loss|pred|target|init|corr|cov|var)\b/gi, "$1_$2")
              .replace(/\s+/g, " ")
              .trim();
            const box: PageBox = { x0: m.x0, y0: m.y0, x1: m.x1, y1: m.y1 };
            if (cleanText.length < 3) {
              obstacles.push(box);
              continue;
            }

            // Filter out recurring header/footer elements while keeping their rects as padding obstacles
            const ny = m.y0 / viewport.height;
            const nBottom = m.y1 / viewport.height;
            if ((ny < 0.04 || nBottom > 0.96) && cleanText.length < 40) {
              obstacles.push(box);
              continue;
            }

            keptParas.push({ text: cleanText, box });
          }

          const normBoxes = computeContextAwareNormBBoxes(
            keptParas.map((k) => k.box),
            obstacles,
            viewport.width,
            viewport.height
          );
          for (let i = 0; i < keptParas.length; i++) {
            paras.push({
              id: `p-${globalIdx}`,
              index: globalIdx,
              text: keptParas[i].text,
              bbox: {
                page: p,
                ...normBoxes[i],
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
            ? "rgba(0, 245, 212, 0.9)"
            : "rgba(255, 255, 255, 0.12)",
          boxShadow: isActive ? "0 0 12px rgba(0, 245, 212, 0.8)" : "none",
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
  const isMobile = useIsMobile(768);
  const [mobileSheet, setMobileSheet] = useState<"none" | "script" | "chat">("none");

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
      {/* ── Top bar controls portal → rendered into top bar where roadmap text exists ── */}
      {portalTarget && createPortal(<TopBarControls isMobile={isMobile} />, portalTarget)}

      {isMobile ? (
        /* ════════════════════════════════════════════════════════════════════════════
           Mobile Layout (< 768px):
           • PDF Viewer is default view (100% of workspace)
           • Bottom floating row: one-liner script bar + round Chat FAB button
           • Draggable upper border expands script drawer (unlocks scrolling & controls)
           • Chat opens full-screen sheet; tapping citation returns to PDF bbox
        ════════════════════════════════════════════════════════════════════════════ */
        <div
          ref={containerRef}
          style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            width: "100%",
            minHeight: 0,
            minWidth: 0,
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* Default Full-Screen PDF Canvas */}
          <div
            style={{
              width: "100%",
              height: "100%",
              minHeight: 0,
              overflow: "hidden",
              position: "relative",
            }}
          >
            <PDFViewer />
          </div>

          {/* Dimmed backdrop when script drawer is expanded */}
          {mobileSheet === "script" && (
            <div
              onClick={() => setMobileSheet("none")}
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0, 0, 0, 0.65)",
                backdropFilter: "blur(2px)",
                WebkitBackdropFilter: "blur(2px)",
                zIndex: 38,
                animation: "fadeIn 0.2s ease-out",
              }}
            />
          )}

          {/* Vertical Playback Controls Container (permanently mounted in DOM so portal never disconnects) */}
          <div
            id="rift-mobile-vertical-playback"
            style={{
              position: "absolute",
              right: "12px",
              bottom: "74px",
              zIndex: 46,
              display:
                mobileSheet === "chat" || mobileSheet === "script"
                  ? "none"
                  : "block",
            }}
          />

          {/* Script Section: Collapsed One-Liner or Expanded 76vh Drawer */}
          <div
            style={{
              position: "absolute",
              left: mobileSheet === "script" ? 0 : "10px",
              right: mobileSheet === "script" ? 0 : "66px",
              bottom: mobileSheet === "script" ? 0 : "12px",
              height: mobileSheet === "script" ? "76vh" : "56px",
              zIndex: mobileSheet === "script" ? 45 : 39,
              transition:
                "height 0.28s cubic-bezier(0.16, 1, 0.3, 1), bottom 0.25s ease, left 0.25s ease, right 0.25s ease",
              borderRadius: mobileSheet === "script" ? "20px 20px 0 0" : "16px",
              overflow: "hidden",
              boxShadow:
                mobileSheet === "script"
                  ? "0 -10px 40px rgba(0, 0, 0, 0.9), 0 0 25px rgba(0, 245, 212, 0.15)"
                  : "0 8px 30px rgba(0, 0, 0, 0.8)",
              display: mobileSheet === "chat" ? "none" : "block",
            }}
          >
            <TranscriptPanel
              isMobile={true}
              isExpanded={mobileSheet === "script"}
              onToggleMobileExpand={() =>
                setMobileSheet((prev) => (prev === "script" ? "none" : "script"))
              }
              onOpenChat={() => setMobileSheet("chat")}
            />
          </div>

          {/* Round Chat FAB Button docked beside the script bar */}
          {mobileSheet !== "chat" && (
            <button
              type="button"
              onClick={() => {
                // If script section is expanded, it shrinks and chat section expands
                setMobileSheet("chat");
              }}
              style={{
                position: "absolute",
                right: "10px",
                bottom: "16px",
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background:
                  "linear-gradient(135deg, rgba(0, 245, 212, 0.95), rgba(13, 148, 136, 0.95))",
                border: "1.5px solid #00f5d4",
                boxShadow:
                  "0 4px 20px rgba(0, 245, 212, 0.45), 0 0 14px rgba(0, 245, 212, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "#020406",
                zIndex: 46,
                transition: "all 0.15s ease",
              }}
              title="Open Ask RIFT AI Chat"
            >
              <MessageSquare size={21} fill="#020406" />
            </button>
          )}

          {/* Full-Screen Chat Modal */}
          {mobileSheet === "chat" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 50,
                background: "rgba(2, 6, 10, 0.98)",
                display: "flex",
                flexDirection: "column",
                animation: "fadeIn 0.2s ease-out",
              }}
            >
              <RAGPanel
                isMobile={true}
                onCloseMobile={() => setMobileSheet("none")}
                onCitationClickClose={() => {
                  // Jump back to PDF viewer focused on that bbox or image bbox!
                  setMobileSheet("none");
                }}
              />
            </div>
          )}

          {/* Silent transcript extractor */}
          <TranscriptExtractor documentId={documentId} />
        </div>
      ) : (
        /* ════════════════════════════════════════════════════════════════════════════
           Desktop Layout (>= 768px):
           • 3 vertical columns: PDF Viewer | Transcript | RAG Q&A
           • Draggable splitters between columns
        ════════════════════════════════════════════════════════════════════════════ */
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
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Exported component – wraps in provider
════════════════════════════════════════════════════════════════════════════════ */
export default function WorkspaceLayout({
  pdfUrl,
  documentId,
  initialInstruction,
}: {
  pdfUrl: string;
  documentId?: string;
  initialInstruction?: string | null;
}) {
  return (
    <WorkspaceProvider
      initialPdfUrl={pdfUrl}
      initialDocumentId={documentId}
      initialInstruction={initialInstruction}
    >
      <Layout documentId={documentId} />
    </WorkspaceProvider>
  );
}
