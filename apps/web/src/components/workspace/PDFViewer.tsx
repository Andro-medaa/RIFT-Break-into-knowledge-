/**
 * PDFViewer – renders the uploaded PDF using react-pdf.
 *
 * Key features (RIFT-I inspired):
 * - CornerBracket reticles on active bbox
 * - Scanline sweep animation on active bbox
 * - Label pill floating above active/hovered bbox
 * - Cyan active / dashed-hover / faint-idle bbox styles
 * - Mini-Map collapsible sidebar (page thumbnails + bbox overlays)
 * - Spotlight mode (darkens page outside active bbox)
 * - Reading Roadmap progress bar in toolbar
 * - Keyboard shortcuts: ←/→ pages, +/- zoom, S spotlight, M mini-map
 * - Pan mode / text-select mode
 * - Glassmorphism toolbar
 */
"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import {
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Hand,
  MousePointer2,
  Maximize2,
  PanelLeftClose,
  PanelLeftOpen,
  Scan,
} from "lucide-react";
import { useWorkspace } from "@/lib/workspace";
import type { TranscriptParagraph } from "@/lib/workspace";
import type { ScriptSegmentItem } from "@/lib/api";

// Configure PDF.js worker via CDN
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/* ════════════════════════════════════════════════════════════════════════════
   CornerBrackets – 4 L-shaped reticles on active bbox
════════════════════════════════════════════════════════════════════════════ */
function CornerBrackets({ size = 10, t = 2, color = "rgba(34,211,238,0.9)" }: {
  size?: number; t?: number; color?: string;
}) {
  const s: React.CSSProperties = {
    position: "absolute",
    width: size,
    height: size,
    pointerEvents: "none",
  };
  const hBar: React.CSSProperties = {
    position: "absolute",
    height: t,
    width: size,
    background: color,
  };
  const vBar: React.CSSProperties = {
    position: "absolute",
    width: t,
    height: size,
    background: color,
  };

  return (
    <>
      {/* top-left */}
      <div style={{ ...s, top: -1, left: -1 }}>
        <div style={{ ...hBar, top: 0, left: 0 }} />
        <div style={{ ...vBar, top: 0, left: 0 }} />
      </div>
      {/* top-right */}
      <div style={{ ...s, top: -1, right: -1 }}>
        <div style={{ ...hBar, top: 0, right: 0 }} />
        <div style={{ ...vBar, top: 0, right: 0 }} />
      </div>
      {/* bottom-left */}
      <div style={{ ...s, bottom: -1, left: -1 }}>
        <div style={{ ...hBar, bottom: 0, left: 0 }} />
        <div style={{ ...vBar, bottom: 0, left: 0 }} />
      </div>
      {/* bottom-right */}
      <div style={{ ...s, bottom: -1, right: -1 }}>
        <div style={{ ...hBar, bottom: 0, right: 0 }} />
        <div style={{ ...vBar, bottom: 0, right: 0 }} />
      </div>
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   BBoxOverlay
   Renders bounding boxes for paragraphs belonging to a specific page.
   Coordinates are normalised [0-1] → multiplied by 100 for CSS %.
════════════════════════════════════════════════════════════════════════════ */
function BBoxOverlay({
  pageNumber,
  paragraphs,
  scriptSegments,
  activeParagraphId,
  activeBBox,
  onSelect,
  spotlight,
}: {
  pageNumber: number;
  paragraphs: TranscriptParagraph[];
  scriptSegments?: ScriptSegmentItem[];
  activeParagraphId: string | null;
  activeBBox: { page: number; x: number; y: number; w: number; h: number } | null;
  onSelect: (id: string, bbox?: { page: number; x: number; y: number; w: number; h: number }) => void;
  spotlight: boolean;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const withBox = paragraphs.filter(
    (p) =>
      p.bbox &&
      p.bbox.w > 0.001 &&
      p.bbox.h > 0.001 &&
      p.bbox.x >= 0 &&
      p.bbox.y >= 0 &&
      p.bbox.x + p.bbox.w <= 1.01 &&
      p.bbox.y + p.bbox.h <= 1.01
  );

  const isParaActive = (p: TranscriptParagraph) => {
    if (!activeParagraphId) {
      // Only match via explicit activeBBox if no paragraph id is set
      if (activeBBox && p.bbox && p.bbox.page === activeBBox.page) {
        const dx = Math.abs(p.bbox.x - activeBBox.x);
        const dy = Math.abs(p.bbox.y - activeBBox.y);
        const dw = Math.abs(p.bbox.w - activeBBox.w);
        const dh = Math.abs(p.bbox.h - activeBBox.h);
        if (dx < 0.01 && dy < 0.01 && dw < 0.02 && dh < 0.02) return true;
      }
      return false;
    }
    // Exact ID match
    if (p.id === activeParagraphId) return true;
    // If activeParagraphId is a segment id like "seg_{chunk_id}_{idx}", extract chunk_id
    if (activeParagraphId.startsWith("seg_")) {
      const withoutPrefix = activeParagraphId.slice(4);
      const lastUnderscore = withoutPrefix.lastIndexOf("_");
      if (lastUnderscore > 0) {
        const chunkId = withoutPrefix.slice(0, lastUnderscore);
        if (p.id === chunkId) return true;
      }
    }
    return false;
  };

  const activePara = withBox.find(isParaActive);
  const activeSeg = scriptSegments?.find(
    (s) =>
      (s.id === activeParagraphId || s.chunk_id === activeParagraphId) &&
      s.bbox &&
      s.page_number === pageNumber
  );

  const effectiveActiveBbox =
    activePara?.bbox ||
    (activeBBox && activeBBox.page === pageNumber ? activeBBox : null) ||
    (activeSeg?.bbox && activeSeg.page_number === pageNumber ? { page: pageNumber, ...activeSeg.bbox } : null);

  const isDirectActiveBboxOnThisPage =
    activeBBox && activeBBox.page === pageNumber && !withBox.some(isParaActive);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      {/* Spotlight overlay — 4 divs surrounding active bbox, leaving it perfectly clear */}
      {spotlight && effectiveActiveBbox && (() => {
        const padX = 0.012; // ~8-10px breathing margin
        const padY = 0.008; // ~5-6px breathing margin
        const x0 = Math.max(0, effectiveActiveBbox.x - padX) * 100;
        const y0 = Math.max(0, effectiveActiveBbox.y - padY) * 100;
        const x1 = Math.min(100, (effectiveActiveBbox.x + effectiveActiveBbox.w + padX) * 100);
        const y1 = Math.min(100, (effectiveActiveBbox.y + effectiveActiveBbox.h + padY) * 100);
        const overlayStyle: React.CSSProperties = {
          position: "absolute",
          background: "rgba(2, 6, 23, 0.78)",
          backdropFilter: "blur(3px)",
          WebkitBackdropFilter: "blur(3px)",
          zIndex: 11,
          pointerEvents: "none",
        };
        return (
          <>
            {/* Top strip — full width, from top to y0 */}
            <div style={{ ...overlayStyle, top: 0, left: 0, width: "100%", height: `${y0}%` }} />
            {/* Bottom strip — full width, from y1 to bottom */}
            <div style={{ ...overlayStyle, top: `${y1}%`, left: 0, width: "100%", height: `${100 - y1}%` }} />
            {/* Left strip — between y0 and y1, from left edge to x0 */}
            <div style={{ ...overlayStyle, top: `${y0}%`, left: 0, width: `${x0}%`, height: `${y1 - y0}%` }} />
            {/* Right strip — between y0 and y1, from x1 to right edge */}
            <div style={{ ...overlayStyle, top: `${y0}%`, left: `${x1}%`, width: `${100 - x1}%`, height: `${y1 - y0}%` }} />
          </>
        );
      })()}

      {/* Render directly highlighted bbox if citation/segment didn't match existing paragraphs */}
      {isDirectActiveBboxOnThisPage && (
        <div
          style={{
            position: "absolute",
            boxSizing: "border-box",
            left: `calc(${(activeBBox.x * 100).toFixed(3)}% - 6px)`,
            top: `calc(${(activeBBox.y * 100).toFixed(3)}% - 4px)`,
            width: `calc(${(activeBBox.w * 100).toFixed(3)}% + 12px)`,
            height: `calc(${(activeBBox.h * 100).toFixed(3)}% + 8px)`,
            border: "2px solid rgba(34,211,238,0.95)",
            background: "rgba(6,182,212,0.18)",
            borderRadius: "5px",
            boxShadow: "0 0 20px rgba(6,182,212,0.5)",
            zIndex: 30,
            pointerEvents: "none",
          }}
        >
          <CornerBrackets />
          <div
            style={{
              position: "absolute",
              top: activeBBox.y < 0.035 ? "calc(100% + 4px)" : "-24px",
              left: 0,
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 8px",
              borderRadius: "5px",
              background: "rgba(10,15,29,0.95)",
              border: "1px solid rgba(34,211,238,0.55)",
              fontSize: "9.5px",
              color: "#67e8f9",
              fontFamily: "var(--font-mono)",
              whiteSpace: "nowrap",
              zIndex: 35,
              boxShadow: "0 2px 10px rgba(6,182,212,0.3)",
            }}
          >
            <span style={{ color: "#34d399" }}>●</span> Source Citation
          </div>
        </div>
      )}

      {withBox.map((p, idx) => {
        const isActive = isParaActive(p);
        const isHovered = p.id === hoveredId;

        return (
          <div
            key={p.id}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(p.id, p.bbox);
            }}
            onMouseEnter={() => setHoveredId(p.id)}
            onMouseLeave={() => setHoveredId(null)}
            style={{
              position: "absolute",
              boxSizing: "border-box",
              /* Breathing room padding so bbox border never touches or covers text */
              left: `calc(${(p.bbox!.x * 100).toFixed(3)}% - 6px)`,
              top: `calc(${(p.bbox!.y * 100).toFixed(3)}% - 4px)`,
              width: `calc(${(p.bbox!.w * 100).toFixed(3)}% + 12px)`,
              height: `calc(${(p.bbox!.h * 100).toFixed(3)}% + 8px)`,
              border: isActive
                ? "2px solid rgba(34,211,238,0.9)"
                : isHovered
                ? "1.5px dashed rgba(34,211,238,0.85)"
                : "1px solid rgba(56,189,248,0.12)",
              background: isActive
                ? "rgba(6,182,212,0.15)"
                : isHovered
                ? "rgba(6,182,212,0.06)"
                : "transparent",
              borderRadius: "5px",
              cursor: "pointer",
              pointerEvents: "all",
              transition: "all 0.18s ease",
              boxShadow: isActive
                ? "0 0 20px rgba(6,182,212,0.45)"
                : "none",
              overflow: "visible",
              zIndex: isActive ? 25 : isHovered ? 15 : 12,
            }}
          >
            {/* Corner reticles on active */}
            {isActive && <CornerBrackets />}

            {/* Scanline sweep on active */}
            {isActive && (
              <div
                className="scanline-sweep"
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(90deg, transparent, rgba(34,211,238,0.18), transparent)",
                  pointerEvents: "none",
                  overflow: "hidden",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   MiniMap – collapsible 92px sidebar with page thumbnails + bbox dots
════════════════════════════════════════════════════════════════════════════ */
function MiniMap({
  numPages,
  currentPage,
  paragraphs,
  activeParagraphId,
  pdfUrl,
  onPageClick,
}: {
  numPages: number;
  currentPage: number;
  paragraphs: TranscriptParagraph[];
  activeParagraphId: string | null;
  pdfUrl: string | null;
  onPageClick: (n: number) => void;
}) {
  return (
    <div
      style={{
        width: "92px",
        flexShrink: 0,
        height: "100%",
        overflowY: "auto",
        background: "rgba(8,12,22,0.95)",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        padding: "10px 8px",
      }}
    >
      {pdfUrl ? (
        <Document file={pdfUrl} loading={null} error={null}>
          {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => {
            const isCurrentPage = currentPage === pageNum;
            return (
              <button
                type="button"
                key={pageNum}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPageClick(pageNum);
                }}
                style={{
                  width: "76px",
                  borderRadius: "5px",
                  background: isCurrentPage ? "rgba(34,211,238,0.14)" : "rgba(255,255,255,0.03)",
                  border: isCurrentPage
                    ? "2px solid #38bdf8"
                    : "1px solid rgba(255,255,255,0.1)",
                  cursor: "pointer",
                  position: "relative",
                  overflow: "hidden",
                  flexShrink: 0,
                  boxShadow: isCurrentPage ? "0 0 14px rgba(56,189,248,0.45)" : "none",
                  transition: "all 0.15s ease",
                  padding: 0,
                  display: "block",
                  textAlign: "left",
                }}
                title={`Go to page ${pageNum}`}
              >
                <div style={{ pointerEvents: "none" }}>
                  <Page
                    pageNumber={pageNum}
                    width={74}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                  />
                </div>
                {/* Blue Page number badge */}
                <div
                  style={{
                    position: "absolute",
                    bottom: "3px",
                    right: "4px",
                    fontSize: "8.5px",
                    fontWeight: 700,
                    color: "#38bdf8",
                    background: "rgba(10,15,29,0.9)",
                    padding: "1px 5px",
                    borderRadius: "3px",
                    border: "1px solid rgba(56,189,248,0.4)",
                    fontFamily: "var(--font-mono)",
                    textShadow: "0 1px 2px rgba(0,0,0,0.9)",
                    pointerEvents: "none",
                  }}
                >
                  p.{pageNum}
                </div>
              </button>
            );
          })}
        </Document>
      ) : (
        Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
          <button
            type="button"
            key={pageNum}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPageClick(pageNum);
            }}
            style={{
              width: "76px",
              height: "100px",
              borderRadius: "5px",
              background: currentPage === pageNum ? "rgba(34,211,238,0.14)" : "rgba(255,255,255,0.04)",
              border: currentPage === pageNum
                ? "2px solid #38bdf8"
                : "1px solid rgba(255,255,255,0.1)",
              cursor: "pointer",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "11px",
              fontWeight: 600,
              color: "#38bdf8",
              fontFamily: "var(--font-mono)",
              padding: 0,
            }}
          >
            p.{pageNum}
          </button>
        ))
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   CtrlBtn — compact toolbar button
════════════════════════════════════════════════════════════════════════════ */
function CtrlBtn({
  onClick,
  title,
  active,
  disabled,
  children,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "32px",
        height: "32px",
        borderRadius: "8px",
        border: active
          ? "1px solid rgba(34,211,238,0.5)"
          : "1px solid rgba(255, 255, 255, 0.08)",
        background: active
          ? "rgba(6,182,212,0.22)"
          : "rgba(255, 255, 255, 0.05)",
        color: active ? "#38bdf8" : "#cbd5e1",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.35 : 1,
        transition: "all 0.15s ease",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   PDFViewer
════════════════════════════════════════════════════════════════════════════ */
export default function PDFViewer() {
  const {
    pdfUrl,
    paragraphs,
    scriptSegments,
    activeParagraphId,
    activeBBox,
    currentPage,
    numPages,
    zoom,
    panMode,
    setCurrentPage,
    setNumPages,
    setZoom,
    togglePanMode,
    navigateToParagraph,
  } = useWorkspace();

  const outerRef     = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);

  // Mini-map + spotlight state
  const [miniMapOpen, setMiniMapOpen] = useState(false);
  const [spotlight, setSpotlight]     = useState(false);

  /* ── Measure available panel width ── */
  useLayoutEffect(() => {
    if (!outerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = e.contentRect.width;
        if (w > 50) setContainerW(w);
      }
    });
    ro.observe(outerRef.current);
    return () => ro.disconnect();
  }, []);

  /* Auto-fit width: subtract container padding (16px * 2) + 4px scrollbar breathing margin */
  const basePageW = containerW > 50 ? containerW - 36 : 500;
  const pageWidth = Math.max(280, Math.round(basePageW * zoom));

  /* ── Smooth scroll directly to a specific page ── */
  const scrollToPage = useCallback(
    (targetPage: number) => {
      const pageClamped = Math.max(1, Math.min(numPages || 1, targetPage));
      setCurrentPage(pageClamped);
      const pageEl = document.getElementById(`pdf-page-${pageClamped}`);
      const container = containerRef.current;
      if (pageEl && container) {
        const cRect = container.getBoundingClientRect();
        const pRect = pageEl.getBoundingClientRect();
        const currentTopRelative = pRect.top - cRect.top;
        container.scrollTo({
          top: Math.max(0, container.scrollTop + currentTopRelative - 16),
          behavior: "smooth",
        });
      }
    },
    [numPages, setCurrentPage]
  );

  /* ── Identify which page holds the active bbox across paragraphs & scriptSegments ── */
  const activeBboxPage = (() => {
    if (activeBBox) return activeBBox.page;
    if (activeParagraphId) {
      const found = paragraphs.find((p) => p.id === activeParagraphId);
      if (found?.bbox) return found.bbox.page;
      const seg = scriptSegments.find(
        (s) =>
          s.chunk_id === activeParagraphId ||
          s.id === activeParagraphId
      );
      if (seg?.page_number) return seg.page_number;
    }
    return null;
  })();

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft")  scrollToPage(Math.max(1, currentPage - 1));
      if (e.key === "ArrowRight") scrollToPage(Math.min(numPages, currentPage + 1));
      if (e.key === "+" || e.key === "=") setZoom(Math.min(3.0, zoom + 0.1));
      if (e.key === "-")          setZoom(Math.max(0.3, zoom - 0.1));
      if (e.key === "s" || e.key === "S") setSpotlight((v) => !v);
      if (e.key === "m" || e.key === "M") setMiniMapOpen((v) => !v);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [numPages, currentPage, zoom, scrollToPage, setZoom]);

  /* ── Robust smooth auto-scroll to active paragraph or bbox ── */
  useEffect(() => {
    let targetPage: number | undefined;
    let targetBBox: { x: number; y: number; w: number; h: number } | undefined;

    if (activeBBox) {
      targetPage = activeBBox.page;
      targetBBox = activeBBox;
    } else if (activeParagraphId) {
      const found = paragraphs.find(
        (p) => p.id === activeParagraphId
      );
      if (found?.bbox) {
        targetPage = found.bbox.page;
        targetBBox = found.bbox;
      } else {
        const seg = scriptSegments.find(
          (s) =>
            s.chunk_id === activeParagraphId ||
            s.id === activeParagraphId
        );
        if (seg?.bbox && seg.page_number) {
          targetPage = seg.page_number;
          targetBBox = seg.bbox;
        }
      }
    }

    if (!targetPage || !targetBBox) return;

    if (targetPage !== currentPage) {
      setCurrentPage(targetPage);
    }

    const timer = setTimeout(() => {
      const pageEl = document.getElementById(`pdf-page-${targetPage}`);
      const container = containerRef.current;
      if (pageEl && container) {
        const cRect = container.getBoundingClientRect();
        const pRect = pageEl.getBoundingClientRect();
        const bboxYPixels = targetBBox!.y * pRect.height;
        const currentBBoxTopRelative = pRect.top + bboxYPixels - cRect.top;
        const targetScrollTop =
          container.scrollTop + currentBBoxTopRelative - cRect.height / 3;
        container.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: "smooth",
        });
      }
    }, 60);

    return () => clearTimeout(timer);
  }, [activeParagraphId, activeBBox, paragraphs, scriptSegments, currentPage, setCurrentPage]);

  /* ── Pan mode ── */
  const [isDragging, setIsDragging] = useState(false);
  const dragStart   = useRef({ x: 0, y: 0 });
  const scrollStart = useRef({ x: 0, y: 0 });

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!panMode) return;
      setIsDragging(true);
      dragStart.current  = { x: e.clientX, y: e.clientY };
      scrollStart.current = {
        x: containerRef.current?.scrollLeft ?? 0,
        y: containerRef.current?.scrollTop  ?? 0,
      };
    },
    [panMode]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!panMode || !isDragging || !containerRef.current) return;
      containerRef.current.scrollLeft = scrollStart.current.x - (e.clientX - dragStart.current.x);
      containerRef.current.scrollTop  = scrollStart.current.y - (e.clientY - dragStart.current.y);
    },
    [panMode, isDragging]
  );

  const onMouseUp = useCallback(() => setIsDragging(false), []);

  const onDocLoad = useCallback(
    ({ numPages: n }: { numPages: number }) => setNumPages(n),
    [setNumPages]
  );

  const fitToWidth = useCallback(() => setZoom(1.0), [setZoom]);

  return (
    <div
      ref={outerRef}
      className="glass-panel"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "rgba(15, 23, 42, 0.76)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderRadius: "20px",
        overflow: "hidden",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        boxShadow: "0 12px 40px rgba(0, 0, 0, 0.45)",
      }}
    >
      {/* ── Glass Toolbar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "7px 12px",
          background: "rgba(10, 14, 24, 0.82)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.07)",
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        {/* Page navigation */}
        <CtrlBtn
          title="Previous page (←)"
          onClick={() => scrollToPage(currentPage - 1)}
          disabled={currentPage <= 1}
        >
          <ChevronLeft size={15} />
        </CtrlBtn>

        <span
          style={{
            fontSize: "11.5px",
            fontFamily: "var(--font-mono)",
            color: "var(--text-primary)",
            minWidth: "60px",
            textAlign: "center",
            background: "rgba(255, 255, 255, 0.05)",
            padding: "3px 7px",
            borderRadius: "6px",
            border: "1px solid rgba(255, 255, 255, 0.06)",
          }}
        >
          {numPages ? `${currentPage} / ${numPages}` : "—"}
        </span>

        <CtrlBtn
          title="Next page (→)"
          onClick={() => scrollToPage(currentPage + 1)}
          disabled={currentPage >= numPages}
        >
          <ChevronRight size={15} />
        </CtrlBtn>

        <div style={{ width: "1px", height: "18px", background: "rgba(255,255,255,0.1)", margin: "0 2px" }} />

        {/* Zoom */}
        <CtrlBtn title="Zoom out (-)" onClick={() => setZoom(Math.max(0.3, zoom - 0.1))}>
          <ZoomOut size={15} />
        </CtrlBtn>

        <span
          style={{
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            color: "#38bdf8",
            minWidth: "40px",
            textAlign: "center",
          }}
        >
          {Math.round(zoom * 100)}%
        </span>

        <CtrlBtn title="Zoom in (+)" onClick={() => setZoom(Math.min(3.0, zoom + 0.1))}>
          <ZoomIn size={15} />
        </CtrlBtn>

        <CtrlBtn title="Fit to width" onClick={fitToWidth}>
          <Maximize2 size={14} />
        </CtrlBtn>

        <div style={{ width: "1px", height: "18px", background: "rgba(255,255,255,0.1)", margin: "0 2px" }} />

        {/* Pan / Select mode */}
        <CtrlBtn title="Select text mode" onClick={() => panMode && togglePanMode()} active={!panMode}>
          <MousePointer2 size={14} />
        </CtrlBtn>
        <CtrlBtn title="Pan/drag mode" onClick={() => !panMode && togglePanMode()} active={panMode}>
          <Hand size={14} />
        </CtrlBtn>

        <div style={{ width: "1px", height: "18px", background: "rgba(255,255,255,0.1)", margin: "0 2px" }} />

        {/* Spotlight */}
        <CtrlBtn title="Spotlight mode (S)" onClick={() => setSpotlight((v) => !v)} active={spotlight}>
          <Scan size={14} />
        </CtrlBtn>

        {/* Mini-map toggle */}
        <CtrlBtn title="Mini-map (M)" onClick={() => setMiniMapOpen((v) => !v)} active={miniMapOpen}>
          {miniMapOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
        </CtrlBtn>

        <div style={{ flex: 1 }} />
      </div>

      {/* ── Body: scrollable PDF + optional mini-map ── */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
        {/* Scrollable PDF canvas */}
        <div
          ref={containerRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "auto",
            cursor: panMode ? (isDragging ? "grabbing" : "grab") : "text",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
            background: "radial-gradient(circle at 50% 20%, rgba(15,21,37,0.95), #06080d)",
          }}
        >
          {!pdfUrl ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-secondary)",
                fontSize: "14px",
              }}
            >
              No PDF loaded
            </div>
          ) : (
            <Document
              file={pdfUrl}
              onLoadSuccess={onDocLoad}
              loading={
                <div style={{ color: "var(--text-secondary)", fontSize: "14px", padding: "40px" }}>
                  Loading PDF…
                </div>
              }
              error={
                <div style={{ color: "#fb7185", fontSize: "13px", padding: "40px" }}>
                  Failed to load PDF. Check the URL or try re-uploading.
                </div>
              }
            >
              {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
                <PageWrapper
                  key={pageNum}
                  pageNum={pageNum}
                  pageWidth={pageWidth}
                  currentPage={currentPage}
                  paragraphs={paragraphs.filter((p) => p.bbox?.page === pageNum)}
                  scriptSegments={scriptSegments.filter((s) => s.page_number === pageNum)}
                  activeParagraphId={activeParagraphId}
                  activeBBox={activeBBox}
                  activeBboxPage={activeBboxPage}
                  spotlight={spotlight}
                  onSelectPage={scrollToPage}
                  onSelectParagraph={navigateToParagraph}
                />
              ))}
            </Document>
          )}
        </div>

        {/* Mini-map panel */}
        {miniMapOpen && (
          <MiniMap
            numPages={numPages}
            currentPage={currentPage}
            paragraphs={paragraphs}
            activeParagraphId={activeParagraphId}
            pdfUrl={pdfUrl}
            onPageClick={scrollToPage}
          />
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   PageWrapper
════════════════════════════════════════════════════════════════════════════ */
function PageWrapper({
  pageNum,
  pageWidth,
  currentPage,
  paragraphs,
  scriptSegments,
  activeParagraphId,
  activeBBox,
  activeBboxPage,
  spotlight,
  onSelectPage,
  onSelectParagraph,
}: {
  pageNum: number;
  pageWidth: number;
  currentPage: number;
  paragraphs: TranscriptParagraph[];
  scriptSegments?: ScriptSegmentItem[];
  activeParagraphId: string | null;
  activeBBox: { page: number; x: number; y: number; w: number; h: number } | null;
  activeBboxPage: number | null;
  spotlight: boolean;
  onSelectPage: (n: number) => void;
  onSelectParagraph: (id: string, bbox?: { page: number; x: number; y: number; w: number; h: number }) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [renderedSize, setRenderedSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    if (!wrapperRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setRenderedSize({ w: e.contentRect.width, h: e.contentRect.height });
      }
    });
    ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, []);

  const isActivePage = activeBboxPage === pageNum;
  /* Spotlight: if active bbox exists but is on a DIFFERENT page, blur & darken this ENTIRE page */
  const spotlightFullCover = spotlight && activeBboxPage != null && !isActivePage;

  return (
    <div
      ref={wrapperRef}
      id={`pdf-page-${pageNum}`}
      onClick={() => onSelectPage(pageNum)}
      style={{
        position: "relative",
        boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
        borderRadius: "4px",
        overflow: "hidden",
        outline:
          currentPage === pageNum
            ? "2px solid rgba(34,211,238,0.5)"
            : "none",
        marginBottom: "4px",
        flexShrink: 0,
      }}
    >
      <Page
        pageNumber={pageNum}
        width={pageWidth > 0 ? pageWidth : 500}
        renderAnnotationLayer
        renderTextLayer
      />

      {renderedSize.w > 0 && renderedSize.h > 0 && (
        <BBoxOverlay
          pageNumber={pageNum}
          paragraphs={paragraphs}
          scriptSegments={scriptSegments}
          activeParagraphId={activeParagraphId}
          activeBBox={activeBBox}
          onSelect={onSelectParagraph}
          spotlight={spotlight}
        />
      )}

      {/* Spotlight: full-page dark blur on non-active pages */}
      {spotlightFullCover && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(2, 6, 23, 0.78)",
            backdropFilter: "blur(3px)",
            WebkitBackdropFilter: "blur(3px)",
            zIndex: 11,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Page number badge */}
      <div
        style={{
          position: "absolute",
          bottom: "4px",
          right: "8px",
          fontSize: "9.5px",
          color: "rgba(255,255,255,0.4)",
          pointerEvents: "none",
          fontFamily: "var(--font-mono)",
        }}
      >
        {pageNum}
      </div>
    </div>
  );
}
