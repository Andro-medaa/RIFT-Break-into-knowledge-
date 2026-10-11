"use client";

import React, { useState } from "react";
import { HighlightLayer } from "./HighlightLayer";
import { SAMPLE_PAGES, SAMPLE_HIGHLIGHTS } from "./SamplePdfData";

export const PdfViewer: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(1.0);
  const [spotlightMode, setSpotlightMode] = useState<boolean>(false);
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>("h1-title");

  const totalPages = SAMPLE_PAGES.length;
  const activePageData = SAMPLE_PAGES.find((p) => p.pageNo === currentPage) || SAMPLE_PAGES[0];
  const pageHighlights = SAMPLE_HIGHLIGHTS.filter((h) => h.pageNo === currentPage);

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
            <span>✓</span> Normalized Scale Lock
          </div>
        </div>
      </div>

      {/* Highlights Bar for Active Page */}
      <div
        style={{
          padding: "10px 24px",
          background: "rgba(13, 17, 27, 0.9)",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          overflowX: "auto",
        }}
      >
        <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
          Page {currentPage} Highlights:
        </span>
        {pageHighlights.map((hl) => {
          const isActive = hl.id === activeHighlightId;
          return (
            <button
              key={hl.id}
              id={`select-hl-${hl.id}`}
              onClick={() => setActiveHighlightId(hl.id)}
              style={{
                padding: "4px 10px",
                borderRadius: "var(--radius-sm)",
                border: `1px solid ${isActive ? "var(--accent-cyan)" : "var(--border-subtle)"}`,
                background: isActive ? "rgba(6, 182, 212, 0.2)" : "rgba(255, 255, 255, 0.04)",
                color: isActive ? "#67e8f9" : "var(--text-secondary)",
                fontSize: "0.78rem",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
              }}
            >
              {hl.label || hl.id}
            </button>
          );
        })}
      </div>

      {/* Main Viewport / Stage */}
      <div className="pdf-stage" id="pdf-stage">
        {/* Scaled PDF Page Sheet */}
        <div
          id="pdf-page-wrapper"
          className="pdf-page-wrapper"
          style={{
            width: "680px",
            height: "920px",
            transform: `scale(${zoom})`,
          }}
        >
          {/* Normalized Highlight Layer Overlaid onto Page */}
          <HighlightLayer
            highlights={SAMPLE_HIGHLIGHTS}
            pageNo={currentPage}
            spotlightMode={spotlightMode}
            activeHighlightId={activeHighlightId}
            onSelectHighlight={(id) => setActiveHighlightId(id)}
          />

          {/* Rendered Page Content (Document Text Sheet) */}
          <div className="pdf-page-content" id="pdf-rendered-page">
            <h2 className="pdf-doc-title">{activePageData.title}</h2>
            <div className="pdf-doc-subtitle">{activePageData.subtitle}</div>

            {activePageData.paragraphs.map((p, idx) => (
              <p key={idx} className="pdf-doc-paragraph">
                {p}
              </p>
            ))}

            <div className="pdf-page-footer">
              <span>RIFT Technical Specification — Foundation Series</span>
              <span>Page {activePageData.pageNo} / {totalPages}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
