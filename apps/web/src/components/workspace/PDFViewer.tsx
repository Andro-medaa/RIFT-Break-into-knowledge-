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
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
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
  Play,
  RotateCw,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { useWorkspace } from "@/lib/workspace";
import type { TranscriptParagraph } from "@/lib/workspace";
import type { ScriptSegmentItem } from "@/lib/api";
import {
  buildFirstBBoxByPage,
  computeBBoxScrollTop,
  isValidBBox,
  type PageFirstBBoxTarget,
} from "@/lib/pdfMiniMap";

// Configure PDF.js worker via CDN
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/* ════════════════════════════════════════════════════════════════════════════
   CornerBrackets – 4 L-shaped reticles on active bbox
════════════════════════════════════════════════════════════════════════════ */
function CornerBrackets({ size = 10, t = 2, color = "rgba(192, 132, 252, 0.95)" }: {
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
function bboxPositionStyle(bbox: { x: number; y: number; w: number; h: number }): React.CSSProperties {
  const left = Math.max(0, Math.min(1, bbox.x));
  const top = Math.max(0, Math.min(1, bbox.y));
  const width = Math.max(0, Math.min(1 - left, bbox.w));
  const height = Math.max(0, Math.min(1 - top, bbox.h));
  return {
    left: `${(left * 100).toFixed(3)}%`,
    top: `${(top * 100).toFixed(3)}%`,
    width: `${(width * 100).toFixed(3)}%`,
    height: `${(height * 100).toFixed(3)}%`,
  };
}

const BBoxItem = memo(function BBoxItem({
  p,
  pageNumber,
  isActive,
  isHovered,
  onSelect,
  onPlayFromParagraph,
  onRepeatParagraph,
  onAskAboutParagraph,
  onMouseEnter,
  onMouseLeave,
}: {
  p: TranscriptParagraph;
  pageNumber: number;
  isActive: boolean;
  isHovered: boolean;
  onSelect: (id: string, bbox?: { page: number; x: number; y: number; w: number; h: number }) => void;
  onPlayFromParagraph: (id: string, bbox?: { page: number; x: number; y: number; w: number; h: number }) => void;
  onRepeatParagraph: (id: string, bbox?: { page: number; x: number; y: number; w: number; h: number }) => void;
  onAskAboutParagraph: (p: { id: string; text: string; bbox?: { page: number; x: number; y: number; w: number; h: number } }) => void;
  onMouseEnter: (id: string) => void;
  onMouseLeave: () => void;
}) {
  const isNearRight = (p.bbox!.x + p.bbox!.w) > 0.88;

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onSelect(p.id, p.bbox);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onPlayFromParagraph(p.id, p.bbox);
      }}
      onMouseEnter={() => onMouseEnter(p.id)}
      onMouseLeave={onMouseLeave}
      style={{
        position: "absolute",
        boxSizing: "border-box",
        ...bboxPositionStyle(p.bbox!),
        border: isActive
          ? "2px solid #c084fc"
          : isHovered
          ? "1.5px dashed rgba(192, 132, 252, 0.85)"
          : "1px solid rgba(168, 85, 247, 0.18)",
        background: isActive
          ? "rgba(168, 85, 247, 0.22)"
          : isHovered
          ? "rgba(168, 85, 247, 0.08)"
          : "transparent",
        borderRadius: "5px",
        cursor: "pointer",
        pointerEvents: "all",
        transition: "border-color 0.14s ease, background-color 0.14s ease, box-shadow 0.14s ease",
        boxShadow: isActive
          ? "0 0 24px rgba(192, 132, 252, 0.7), 0 0 8px rgba(217, 70, 239, 0.5)"
          : "none",
        overflow: "visible",
        zIndex: isActive || isHovered ? 45 : 12,
      }}
    >
      {/* Corner reticles on active */}
      {isActive && <CornerBrackets color="rgba(192, 132, 252, 0.95)" />}

      {/* Scanline sweep on active */}
      {isActive && (
        <div
          className="scanline-sweep"
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(90deg, transparent, rgba(192, 132, 252, 0.35), transparent)",
            pointerEvents: "none",
            overflow: "hidden",
          }}
        />
      )}

      {/* Sleek Vertical Micro-Dock Outside BBox (Appears ONLY on hover - never obscures text inside/above/below) */}
      {isHovered && (
        <div
          onMouseEnter={() => onMouseEnter(p.id)}
          onMouseLeave={onMouseLeave}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: 0,
            left: isNearRight ? "auto" : "100%",
            right: isNearRight ? "100%" : "auto",
            paddingLeft: isNearRight ? 0 : "6px",
            paddingRight: isNearRight ? "6px" : 0,
            display: "flex",
            flexDirection: "column",
            alignItems: isNearRight ? "flex-end" : "flex-start",
            zIndex: 60,
            pointerEvents: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "3px",
              padding: "4px 3px",
              borderRadius: "6px",
              background: "rgba(2, 6, 12, 0.96)",
              border: "1px solid rgba(0, 245, 212, 0.45)",
              boxShadow: "0 4px 18px rgba(0, 0, 0, 0.95), 0 0 10px rgba(0, 245, 212, 0.2)",
              userSelect: "none",
            }}
          >
            {/* Continue / Play */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPlayFromParagraph(p.id, p.bbox);
              }}
              style={{
                width: "20px",
                height: "20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "4px",
                background: "rgba(0, 245, 212, 0.15)",
                border: "1px solid rgba(0, 245, 212, 0.35)",
                color: "#00f5d4",
                cursor: "pointer",
                padding: 0,
                transition: "background-color 0.12s ease, color 0.12s ease",
              }}
              title="Continue reading from here"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#00f5d4";
                e.currentTarget.style.color = "#02060a";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(0, 245, 212, 0.15)";
                e.currentTarget.style.color = "#00f5d4";
              }}
            >
              <Play size={9} fill="currentColor" />
            </button>

            {/* Repeat Single */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRepeatParagraph(p.id, p.bbox);
              }}
              style={{
                width: "20px",
                height: "20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "4px",
                background: "rgba(168, 85, 247, 0.18)",
                border: "1px solid rgba(192, 132, 252, 0.45)",
                color: "#d8b4fe",
                cursor: "pointer",
                padding: 0,
                transition: "background-color 0.12s ease, color 0.12s ease",
              }}
              title="Repeat only this section (saves spot to resume)"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#c084fc";
                e.currentTarget.style.color = "#02060a";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(168, 85, 247, 0.18)";
                e.currentTarget.style.color = "#d8b4fe";
              }}
            >
              <RotateCw size={9} />
            </button>

            {/* Ask RIFT with Reference */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAskAboutParagraph({
                  id: p.id,
                  text: p.text,
                  bbox: p.bbox ? { ...p.bbox, page: p.bbox.page || pageNumber } : { page: pageNumber, x: 0, y: 0, w: 0, h: 0 },
                });
              }}
              style={{
                width: "20px",
                height: "20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "4px",
                background: "rgba(0, 245, 212, 0.08)",
                border: "1px solid rgba(0, 245, 212, 0.25)",
                color: "#00f5d4",
                cursor: "pointer",
                padding: 0,
                transition: "background-color 0.12s ease, border-color 0.12s ease",
              }}
              title="Ask RIFT about this section (sets reference in chat)"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(0, 245, 212, 0.35)";
                e.currentTarget.style.borderColor = "rgba(0, 245, 212, 0.8)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(0, 245, 212, 0.08)";
                e.currentTarget.style.borderColor = "rgba(0, 245, 212, 0.25)";
              }}
            >
              <Sparkles size={9} color="#00f5d4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

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
  const { playFromParagraph, repeatParagraph, askAboutParagraph } = useWorkspace();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleBboxMouseEnter = useCallback((id: string) => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoveredId(id);
  }, []);

  const handleBboxMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
    }
    hoverTimerRef.current = setTimeout(() => {
      setHoveredId(null);
    }, 280);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  const withBox = paragraphs.filter((p) => isValidBBox(p.bbox));

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
            ...bboxPositionStyle(activeBBox),
            border: "2px solid #c084fc",
            background: "rgba(168, 85, 247, 0.22)",
            borderRadius: "5px",
            boxShadow: "0 0 24px rgba(192, 132, 252, 0.7), 0 0 8px rgba(217, 70, 239, 0.5)",
            zIndex: 30,
            pointerEvents: "none",
          }}
        >
          <CornerBrackets color="rgba(192, 132, 252, 0.95)" />
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
              background: "rgba(12, 6, 22, 0.95)",
              border: "1px solid rgba(192, 132, 252, 0.7)",
              fontSize: "9.5px",
              color: "#e9d5ff",
              fontFamily: "var(--font-mono)",
              whiteSpace: "nowrap",
              zIndex: 35,
              boxShadow: "0 2px 12px rgba(168, 85, 247, 0.4)",
            }}
          >
            <span style={{ color: "#d946ef" }}>●</span> Source Citation
          </div>
        </div>
      )}

      {withBox.map((p) => (
        <BBoxItem
          key={p.id}
          p={p}
          pageNumber={pageNumber}
          isActive={isParaActive(p)}
          isHovered={p.id === hoveredId}
          onSelect={onSelect}
          onPlayFromParagraph={playFromParagraph}
          onRepeatParagraph={repeatParagraph}
          onAskAboutParagraph={askAboutParagraph}
          onMouseEnter={handleBboxMouseEnter}
          onMouseLeave={handleBboxMouseLeave}
        />
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   MiniMap – collapsible 92px sidebar with page thumbnails + bbox dots
════════════════════════════════════════════════════════════════════════════ */
function MiniMap({
  numPages,
  currentPage,
  pdfUrl,
  firstBboxByPage,
  onPageClick,
}: {
  numPages: number;
  currentPage: number;
  pdfUrl: string | null;
  firstBboxByPage: Map<number, PageFirstBBoxTarget>;
  onPageClick: (n: number) => void;
}) {
  const renderPageButtons = (withPdfPage: boolean) => (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => {
        const isCurrentPage = currentPage === pageNum;
        const firstTarget = firstBboxByPage.get(pageNum);
        const title = firstTarget
          ? `Go to page ${pageNum} (1st bbox)`
          : `Go to page ${pageNum}`;

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
              minHeight: "98px",
              borderRadius: "6px",
              background: isCurrentPage
                ? "rgba(0, 245, 212, 0.14)"
                : "rgba(255, 255, 255, 0.03)",
              border: isCurrentPage
                ? "2px solid #00f5d4"
                : "1px solid rgba(0, 245, 212, 0.15)",
              cursor: "pointer",
              position: "relative",
              overflow: "hidden",
              flexShrink: 0,
              boxShadow: isCurrentPage
                ? "0 0 16px rgba(0, 245, 212, 0.45)"
                : "none",
              transition: "all 0.15s ease",
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "left",
            }}
            title={title}
            data-first-bbox-id={firstTarget?.id}
          >
            {withPdfPage ? (
              <div style={{ pointerEvents: "none", width: "100%" }}>
                <Page
                  pageNumber={pageNum}
                  width={74}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  loading={
                    <div
                      style={{
                        width: "74px",
                        height: "98px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "10px",
                        fontFamily: "var(--font-mono)",
                        color: "rgba(94, 234, 212, 0.65)",
                      }}
                    >
                      p.{pageNum}
                    </div>
                  }
                  error={null}
                />
              </div>
            ) : (
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: isCurrentPage ? "#00f5d4" : "#5eead4",
                  fontFamily: "var(--font-mono)",
                  pointerEvents: "none",
                }}
              >
                p.{pageNum}
              </span>
            )}

            {/* Highlighted 1st-bbox marker linked to this mini-map page */}
            {firstTarget && (
              <div
                style={{
                  position: "absolute",
                  left: `${Math.max(0, Math.min(96, firstTarget.bbox.x * 100))}%`,
                  top: `${Math.max(0, Math.min(96, firstTarget.bbox.y * 100))}%`,
                  width: `${Math.max(6, Math.min(100, firstTarget.bbox.w * 100))}%`,
                  height: `${Math.max(4, Math.min(100, firstTarget.bbox.h * 100))}%`,
                  border: "1px solid rgba(0, 245, 212, 0.85)",
                  background: isCurrentPage
                    ? "rgba(0, 245, 212, 0.28)"
                    : "rgba(0, 245, 212, 0.16)",
                  borderRadius: "2px",
                  pointerEvents: "none",
                  zIndex: 2,
                }}
              />
            )}

            {/* Teal Page number badge */}
            <div
              style={{
                position: "absolute",
                bottom: "3px",
                right: "4px",
                fontSize: "8.5px",
                fontWeight: 700,
                color: isCurrentPage ? "#00f5d4" : "#5eead4",
                background: "rgba(1, 4, 7, 0.92)",
                padding: "1px 5px",
                borderRadius: "3px",
                border: isCurrentPage
                  ? "1px solid rgba(0, 245, 212, 0.55)"
                  : "1px solid rgba(0, 245, 212, 0.2)",
                fontFamily: "var(--font-mono)",
                textShadow: "0 1px 2px rgba(0,0,0,0.9)",
                pointerEvents: "none",
                zIndex: 3,
              }}
            >
              p.{pageNum}
            </div>
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      style={{
        width: "92px",
        flexShrink: 0,
        height: "100%",
        overflowY: "auto",
        background: "rgba(1, 4, 7, 0.96)",
        borderLeft: "1px solid rgba(0, 245, 212, 0.12)",
        display: "flex",
        flexDirection: "column",
        padding: "10px 8px",
      }}
    >
      {pdfUrl ? (
        <Document
          file={pdfUrl}
          loading={renderPageButtons(false)}
          error={renderPageButtons(false)}
        >
          {renderPageButtons(true)}
        </Document>
      ) : (
        renderPageButtons(false)
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
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "32px",
        height: "32px",
        borderRadius: "8px",
        border: active
          ? "1.5px solid #00f5d4"
          : hovered && !disabled
          ? "1px solid rgba(0, 245, 212, 0.55)"
          : "1px solid rgba(0, 245, 212, 0.16)",
        background: active
          ? "linear-gradient(135deg, rgba(0, 245, 212, 0.28), rgba(13, 148, 136, 0.4))"
          : hovered && !disabled
          ? "rgba(0, 245, 212, 0.12)"
          : "rgba(2, 6, 10, 0.65)",
        color: active
          ? "#00f5d4"
          : hovered && !disabled
          ? "#5eead4"
          : "#cbd5e1",
        boxShadow: active
          ? "0 0 14px rgba(0, 245, 212, 0.45)"
          : hovered && !disabled
          ? "0 0 10px rgba(0, 245, 212, 0.25)"
          : "none",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.35 : 1,
        transition: "background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease",
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
    navigateToBBox,
    savedResumeAnchor,
    resumePreviousPlayback,
    clearResumeAnchor,
  } = useWorkspace();

  const outerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastAutoScrollAnchorRef = useRef<string | null>(null);
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
      } else if (pageEl) {
        pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
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

  /* ── Smooth scroll to a specific bbox on a target page ── */
  const scrollToBBox = useCallback(
    (targetPage: number, bbox: { x: number; y: number }) => {
      const pageEl = document.getElementById(`pdf-page-${targetPage}`);
      const container = containerRef.current;
      if (pageEl && container) {
        const cRect = container.getBoundingClientRect();
        const pRect = pageEl.getBoundingClientRect();
        const targetScrollTop = computeBBoxScrollTop(
          cRect,
          pRect,
          container.scrollTop,
          bbox.y
        );
        container.scrollTo({
          top: targetScrollTop,
          behavior: "smooth",
        });
      } else if (pageEl) {
        pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    []
  );

  /* ── Map each page to its 1st bounding box for mini-map navigation ── */
  const firstBboxByPage = useMemo(
    () => buildFirstBBoxByPage(paragraphs, scriptSegments),
    [paragraphs, scriptSegments]
  );

  const handleMiniMapPageClick = useCallback(
    (targetPage: number) => {
      const pageClamped = Math.max(1, Math.min(numPages || 1, targetPage));
      const firstTarget = firstBboxByPage.get(pageClamped);
      if (firstTarget) {
        lastAutoScrollAnchorRef.current = `${pageClamped}:${firstTarget.bbox.x.toFixed(4)}:${firstTarget.bbox.y.toFixed(4)}:${firstTarget.id}`;
        navigateToBBox(pageClamped, firstTarget.bbox, firstTarget.id);
        scrollToBBox(pageClamped, firstTarget.bbox);
      } else {
        scrollToPage(pageClamped);
      }
    },
    [firstBboxByPage, navigateToBBox, numPages, scrollToBBox, scrollToPage]
  );

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

    if (!targetPage || !targetBBox) {
      if (!activeBBox && !activeParagraphId) {
        lastAutoScrollAnchorRef.current = null;
      }
      return;
    }

    const anchorKey = `${targetPage}:${targetBBox.x.toFixed(4)}:${targetBBox.y.toFixed(4)}:${activeParagraphId ?? ""}`;
    if (lastAutoScrollAnchorRef.current === anchorKey) return;
    lastAutoScrollAnchorRef.current = anchorKey;

    const resolvedPage = targetPage;
    const resolvedBBox = targetBBox;
    const timer = setTimeout(() => {
      setCurrentPage(resolvedPage);
      scrollToBBox(resolvedPage, resolvedBBox);
    }, 60);

    return () => clearTimeout(timer);
  }, [activeParagraphId, activeBBox, paragraphs, scriptSegments, setCurrentPage, scrollToBBox]);

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

  const paragraphsByPage = useMemo(() => {
    const map = new Map<number, TranscriptParagraph[]>();
    for (const p of paragraphs) {
      const pg = p.bbox?.page;
      if (!pg) continue;
      let list = map.get(pg);
      if (!list) {
        list = [];
        map.set(pg, list);
      }
      list.push(p);
    }
    return map;
  }, [paragraphs]);

  const segmentsByPage = useMemo(() => {
    const map = new Map<number, ScriptSegmentItem[]>();
    for (const s of scriptSegments) {
      const pg = s.page_number;
      if (!pg) continue;
      let list = map.get(pg);
      if (!list) {
        list = [];
        map.set(pg, list);
      }
      list.push(s);
    }
    return map;
  }, [scriptSegments]);

  return (
    <div
      ref={outerRef}
      className="glass-panel"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "rgba(2, 6, 10, 0.94)",
        backdropFilter: "none",
        WebkitBackdropFilter: "none",
        borderRadius: "20px",
        overflow: "hidden",
        border: "1px solid rgba(0, 245, 212, 0.14)",
        boxShadow: "0 16px 45px rgba(0, 0, 0, 0.75)",
        contain: "layout paint",
      }}
    >
      {/* ── Glass Toolbar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "7px 12px",
          background: "rgba(1, 4, 7, 0.96)",
          borderBottom: "1px solid rgba(0, 245, 212, 0.12)",
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
            color: "#5eead4",
            minWidth: "60px",
            textAlign: "center",
            background: "rgba(0, 245, 212, 0.08)",
            padding: "3px 8px",
            borderRadius: "6px",
            border: "1px solid rgba(0, 245, 212, 0.2)",
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

        <div style={{ width: "1px", height: "18px", background: "rgba(0, 245, 212, 0.15)", margin: "0 2px" }} />

        {/* Zoom */}
        <CtrlBtn title="Zoom out (-)" onClick={() => setZoom(Math.max(0.3, zoom - 0.1))}>
          <ZoomOut size={15} />
        </CtrlBtn>

        <span
          style={{
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            color: "#00f5d4",
            minWidth: "44px",
            textAlign: "center",
            background: "rgba(0, 245, 212, 0.08)",
            padding: "3px 7px",
            borderRadius: "6px",
            border: "1px solid rgba(0, 245, 212, 0.2)",
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

        <div style={{ width: "1px", height: "18px", background: "rgba(0, 245, 212, 0.15)", margin: "0 2px" }} />

        {/* Pan / Select mode */}
        <CtrlBtn title="Select text mode" onClick={() => panMode && togglePanMode()} active={!panMode}>
          <MousePointer2 size={14} />
        </CtrlBtn>
        <CtrlBtn title="Pan/drag mode" onClick={() => !panMode && togglePanMode()} active={panMode}>
          <Hand size={14} />
        </CtrlBtn>

        <div style={{ width: "1px", height: "18px", background: "rgba(0, 245, 212, 0.15)", margin: "0 2px" }} />

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
            background: "radial-gradient(circle at 50% 15%, rgba(4, 18, 24, 0.85), #020406 80%)",
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
                  paragraphs={paragraphsByPage.get(pageNum) ?? EMPTY_PARAS}
                  scriptSegments={segmentsByPage.get(pageNum) ?? EMPTY_SEGS}
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
            pdfUrl={pdfUrl}
            firstBboxByPage={firstBboxByPage}
            onPageClick={handleMiniMapPageClick}
          />
        )}

        {/* Floating Bookmark Resume Banner (shown when a single bbox repeat was triggered) */}
        {savedResumeAnchor && (
          <div
            style={{
              position: "absolute",
              bottom: "18px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 60,
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 14px",
              borderRadius: "20px",
              background: "rgba(2, 8, 14, 0.96)",
              border: "1px solid rgba(0, 245, 212, 0.55)",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.95), 0 0 16px rgba(0, 245, 212, 0.3)",
              backdropFilter: "blur(16px)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "#00f5d4",
                  boxShadow: "0 0 6px #00f5d4",
                }}
              />
              <span
                style={{
                  fontSize: "11px",
                  color: "#ccfbf1",
                  fontFamily: "var(--font-mono)",
                }}
              >
                Previous spot: Page {savedResumeAnchor.page}
              </span>
            </div>
            <button
              onClick={resumePreviousPlayback}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "3px 10px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #00f5d4, #0d9488)",
                color: "#02060a",
                fontWeight: 700,
                fontSize: "11px",
                border: "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              title="Resume reading from your previous place"
            >
              <RotateCcw size={11} />
              <span>Resume</span>
            </button>
            <button
              onClick={clearResumeAnchor}
              style={{
                border: "none",
                background: "transparent",
                color: "#64748b",
                cursor: "pointer",
                padding: "2px",
                display: "flex",
                alignItems: "center",
              }}
              title="Dismiss bookmark"
            >
              <X size={12} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   PageWrapper
════════════════════════════════════════════════════════════════════════════ */
const EMPTY_PARAS: TranscriptParagraph[] = [];
const EMPTY_SEGS: ScriptSegmentItem[] = [];

const PageWrapper = memo(function PageWrapper({
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
            ? "2px solid rgba(0, 245, 212, 0.55)"
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
});
