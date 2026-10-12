"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { HighlightLayer } from "./HighlightLayer";
import { MiniMap } from "./MiniMap";
import { ChunkNavigator } from "./ChunkNavigator";
import { LessonPlanView } from "../teach/LessonPlanView";
import { GroundedQaPanel } from "../chat/GroundedQaPanel";
import { SAMPLE_PAGES, SAMPLE_HIGHLIGHTS } from "./SamplePdfData";
import { HighlightItem } from "@/types/pdf";
import type { DocumentChunk, DocumentMeta } from "@/types/api";
import type { SavedSessionData } from "@/lib/storage/indexedDb";

interface PdfViewerProps {
  parsedChunks?: DocumentChunk[];
  documentMeta?: DocumentMeta | null;
  restoredSession?: SavedSessionData | null;
  externalQuestion?: string | null;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  parsedChunks,
  documentMeta,
  restoredSession,
  externalQuestion,
}) => {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(1.0);
  const [spotlightMode, setSpotlightMode] = useState<boolean>(false);
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>("h1-title");
  const [coveredIds, setCoveredIds] = useState<Set<string>>(new Set(["h1-title"]));
  const [rightTab, setRightTab] = useState<"chunks" | "lesson" | "qa">("lesson");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(restoredSession?.sessionId || null);
  const stageRef = useRef<HTMLDivElement>(null);

  const highlights: HighlightItem[] = useMemo(() => {
    if (!parsedChunks || parsedChunks.length === 0) {
      return SAMPLE_HIGHLIGHTS;
    }
    return parsedChunks.map((c) => ({
      id: c.id,
      pageNo: c.page_no,
      rects: c.rects,
      text: c.text,
      label: c.kind === "heading" ? "Heading" : `Chunk #${c.ord + 1}`,
      color: c.kind === "heading" ? "cyan" : (c.ord % 3 === 0 ? "purple" : c.ord % 3 === 1 ? "amber" : "emerald"),
    }));
  }, [parsedChunks]);

  const totalPages = documentMeta ? documentMeta.page_count : SAMPLE_PAGES.length;
  const activePageData = SAMPLE_PAGES.find((p) => p.pageNo === currentPage) || SAMPLE_PAGES[0];
  const pageHighlights = highlights.filter((h) => h.pageNo === currentPage);

  // When document chunks change, initialize active and covered IDs
  useEffect(() => {
    if (highlights.length > 0) {
      setActiveHighlightId(highlights[0].id);
      setCoveredIds(new Set([highlights[0].id]));
      setCurrentPage(highlights[0].pageNo);
    }
  }, [highlights]);

  // When session is restored, jump cursor to saved segment chunk
  useEffect(() => {
    if (restoredSession && restoredSession.segments.length > 0) {
      setRightTab("lesson");
      const targetSeg = restoredSession.segments[restoredSession.segOrd] || restoredSession.segments[0];
      if (targetSeg && targetSeg.chunk_ids && targetSeg.chunk_ids.length > 0) {
        const chunkId = targetSeg.chunk_ids[0];
        const h = highlights.find((item) => item.id === chunkId);
        if (h) {
          handleSelectChunk(chunkId, h.pageNo);
        }
      }
    }
  }, [restoredSession, highlights]);

  // When an external question is submitted (from VoiceBargeInBar), switch to Q&A tab
  useEffect(() => {
    if (externalQuestion) {
      setRightTab("qa");
    }
  }, [externalQuestion]);

  // Ensure active session ID is initialized when documentMeta exists
  useEffect(() => {
    if (!activeSessionId && documentMeta) {
      const fallbacks = ["http://localhost:8000", "http://127.0.0.1:8000"];
      for (const base of fallbacks) {
        fetch(`${base}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ doc_id: documentMeta.id }),
        })
          .then((res) => res.json())
          .then((json) => {
            if (json.data?.id) setActiveSessionId(json.data.id);
          })
          .catch(() => {});
      }
    }
  }, [activeSessionId, documentMeta]);

  // Synchronized Chunk Selection with Smooth Auto-Scroll
  const handleSelectChunk = (id: string, pageNo: number) => {
    if (pageNo !== currentPage) {
      setCurrentPage(pageNo);
    }
    setActiveHighlightId(id);

    // Auto mark as covered when visited
    setCoveredIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    // Auto-scroll PDF stage smoothly to center the selected highlight
    setTimeout(() => {
      const el = document.getElementById(`highlight-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      }
    }, 60);
  };

  const handleToggleCovered = (id: string) => {
    setCoveredIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Zoom handlers
  const handleZoomIn = () => {
    setZoom((prev) => Math.min(2.0, parseFloat((prev + 0.25).toFixed(2))));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(0.5, parseFloat((prev - 0.25).toFixed(2))));
  };

  const handleResetZoom = () => {
    setZoom(1.0);
  };

  // Page handlers
  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

  return (
    <div className="pdf-workspace-card glass-panel" id="pdf-workspace">
      {/* Top Toolbar */}
      <div className="pdf-toolbar">
        {/* Left: Document Info & Page Navigation */}
        <div className="pdf-toolbar-group">
          <button
            id="prev-page-btn"
            className="btn-tool"
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
          >
            ◀ Prev
          </button>
          <span
            id="page-indicator"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.88rem",
              color: "var(--text-primary)",
              padding: "4px 10px",
              background: "rgba(0,0,0,0.3)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            Page {currentPage} of {totalPages}
          </span>
          <button
            id="next-page-btn"
            className="btn-tool"
            onClick={handleNextPage}
            disabled={currentPage >= totalPages}
          >
            Next ▶
          </button>
        </div>

        {/* Center: Zoom Controls */}
        <div className="pdf-toolbar-group">
          <button
            id="zoom-out-btn"
            className="btn-tool"
            onClick={handleZoomOut}
            disabled={zoom <= 0.5}
            title="Zoom Out (Min 50%)"
          >
            🔍 -
          </button>
          <span
            id="zoom-level-badge"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.85rem",
              fontWeight: 600,
              color: "#38bdf8",
              minWidth: "55px",
              textAlign: "center",
            }}
          >
            {Math.round(zoom * 100)}%
          </span>
          <button
            id="zoom-in-btn"
            className="btn-tool"
            onClick={handleZoomIn}
            disabled={zoom >= 2.0}
            title="Zoom In (Max 200%)"
          >
            🔍 +
          </button>
          <button
            id="zoom-reset-btn"
            className="btn-tool"
            onClick={handleResetZoom}
            title="Reset Zoom to 100%"
          >
            Reset
          </button>
        </div>

        {/* Right: Spotlight & Effects Toggles */}
        <div className="pdf-toolbar-group">
          <button
            id="toggle-spotlight-btn"
            className={`btn-tool ${spotlightMode ? "active" : ""}`}
            onClick={() => setSpotlightMode((prev) => !prev)}
          >
            💡 Spotlight {spotlightMode ? "ON" : "OFF"}
          </button>
          <div
            id="zero-drift-badge"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              background: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.4)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.78rem",
              color: "#6ee7b7",
              fontFamily: "var(--font-mono)",
            }}
          >
            <span>✓</span> Step 7 State Machine & Persistence Active
          </div>
        </div>
      </div>

      {/* 3-Column Workspace: MiniMap | PDF Stage | ChunkNavigator */}
      <div style={{ display: "flex", width: "100%", height: "760px", overflow: "hidden" }}>
        {/* Column 1: Mini-Map Sidebar Strip */}
        <MiniMap
          totalPages={totalPages}
          currentPage={currentPage}
          highlights={highlights}
          activeHighlightId={activeHighlightId}
          coveredIds={coveredIds}
          onSelectPage={(pNo) => {
            setCurrentPage(pNo);
            const firstOnPage = highlights.find((h) => h.pageNo === pNo);
            if (firstOnPage) {
              handleSelectChunk(firstOnPage.id, pNo);
            }
          }}
        />

        {/* Column 2: Center PDF Stage Viewport */}
        <div
          ref={stageRef}
          className="pdf-stage"
          id="pdf-stage"
          style={{
            flex: 1,
            overflow: "auto",
            display: "flex",
            justifyContent: "center",
            padding: "32px 24px",
            background: "radial-gradient(circle at 50% 25%, rgba(15, 23, 42, 0.98), #030712)",
          }}
        >
          {/* Scaled PDF Page Sheet */}
          <div
            id="pdf-page-wrapper"
            className="pdf-page-wrapper"
            style={{
              width: "680px",
              height: "920px",
              transform: `scale(${zoom})`,
              transformOrigin: "top center",
              transition: "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {/* Normalized Highlight Layer Overlaid onto Page */}
            <HighlightLayer
              highlights={highlights}
              pageNo={currentPage}
              spotlightMode={spotlightMode}
              activeHighlightId={activeHighlightId}
              onSelectHighlight={(id) => handleSelectChunk(id, currentPage)}
            />

            {/* Rendered Page Content (Document Text Sheet) */}
            <div className="pdf-page-content" id="pdf-rendered-page">
              <h2 className="pdf-doc-title">{documentMeta ? documentMeta.title : activePageData.title}</h2>
              <div className="pdf-doc-subtitle">
                {documentMeta ? `Page ${currentPage} of ${totalPages} • Synchronized Navigation Active` : activePageData.subtitle}
              </div>

              {activePageData.paragraphs.map((p, idx) => (
                <p key={idx} className="pdf-doc-paragraph">
                  {p}
                </p>
              ))}

              <div className="pdf-page-footer">
                <span>{documentMeta ? `Document ID: ${documentMeta.id}` : "RIFT Technical Specification — Foundation Series"}</span>
                <span>Page {currentPage} / {totalPages}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Column 3: Right Column with Tabs (Roadmap vs Lesson Plan) */}
        <div
          style={{
            width: "360px",
            display: "flex",
            flexDirection: "column",
            height: "100%",
            background: "rgba(15, 23, 42, 0.6)",
            borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          {/* Tab Switcher Header */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
              background: "rgba(15, 23, 42, 0.8)",
            }}
          >
            <button
              id="tab-lesson"
              type="button"
              onClick={() => setRightTab("lesson")}
              style={{
                flex: 1,
                padding: "10px 8px",
                border: "none",
                background: rightTab === "lesson" ? "rgba(56, 189, 248, 0.12)" : "transparent",
                borderBottom: rightTab === "lesson" ? "2px solid #38bdf8" : "2px solid transparent",
                color: rightTab === "lesson" ? "#38bdf8" : "#94a3b8",
                fontWeight: 600,
                fontSize: "11.5px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
                transition: "all 0.15s ease",
              }}
            >
              <span>🎓</span> Lesson Plan
            </button>
            <button
              id="tab-qa"
              type="button"
              onClick={() => setRightTab("qa")}
              style={{
                flex: 1,
                padding: "10px 8px",
                border: "none",
                background: rightTab === "qa" ? "rgba(56, 189, 248, 0.12)" : "transparent",
                borderBottom: rightTab === "qa" ? "2px solid #38bdf8" : "2px solid transparent",
                color: rightTab === "qa" ? "#38bdf8" : "#94a3b8",
                fontWeight: 600,
                fontSize: "11.5px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
                transition: "all 0.15s ease",
              }}
            >
              <span>💬</span> Grounded Q&A
            </button>
            <button
              id="tab-roadmap"
              type="button"
              onClick={() => setRightTab("chunks")}
              style={{
                flex: 1,
                padding: "10px 8px",
                border: "none",
                background: rightTab === "chunks" ? "rgba(56, 189, 248, 0.12)" : "transparent",
                borderBottom: rightTab === "chunks" ? "2px solid #38bdf8" : "2px solid transparent",
                color: rightTab === "chunks" ? "#38bdf8" : "#94a3b8",
                fontWeight: 600,
                fontSize: "11.5px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
                transition: "all 0.15s ease",
              }}
            >
              <span>🗺️</span> Roadmap
            </button>
          </div>

          {/* Tab Content */}
          <div style={{ flex: 1, overflow: "hidden" }}>
            {rightTab === "lesson" ? (
              <LessonPlanView
                docId={documentMeta ? documentMeta.id : restoredSession?.docId || null}
                docTitle={documentMeta ? documentMeta.title : restoredSession?.docTitle}
                chunks={parsedChunks || []}
                activeChunkId={activeHighlightId}
                initialSegments={restoredSession?.segments}
                initialSessionId={restoredSession?.sessionId}
                initialSegOrd={restoredSession?.segOrd}
                initialSentIdx={restoredSession?.sentIdx}
                onSessionReady={(sId) => setActiveSessionId(sId)}
                onSelectChunk={(cId) => {
                  const h = highlights.find((item) => item.id === cId);
                  if (h) {
                    handleSelectChunk(cId, h.pageNo);
                  }
                }}
              />
            ) : rightTab === "qa" ? (
              <GroundedQaPanel
                sessionId={activeSessionId}
                docId={documentMeta ? documentMeta.id : restoredSession?.docId || null}
                docTitle={documentMeta ? documentMeta.title : restoredSession?.docTitle}
                activeChunkId={activeHighlightId}
                initialQuestion={externalQuestion}
                onSelectCitation={(chunkId, pageNo) => {
                  handleSelectChunk(chunkId, pageNo);
                }}
                onResumeLesson={() => {
                  setRightTab("lesson");
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(new CustomEvent("rift:resume-lesson"));
                  }
                }}
              />
            ) : (
              <ChunkNavigator
                highlights={highlights}
                activeHighlightId={activeHighlightId}
                coveredIds={coveredIds}
                currentPage={currentPage}
                onSelectHighlight={handleSelectChunk}
                onToggleCovered={handleToggleCovered}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
