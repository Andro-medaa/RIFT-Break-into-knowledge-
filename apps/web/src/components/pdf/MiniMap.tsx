"use client";

import React from "react";
import { HighlightItem } from "@/types/pdf";

interface MiniMapProps {
  totalPages: number;
  currentPage: number;
  highlights: HighlightItem[];
  activeHighlightId: string | null;
  coveredIds: Set<string>;
  onSelectPage: (pageNo: number) => void;
}

export const MiniMap: React.FC<MiniMapProps> = ({
  totalPages,
  currentPage,
  highlights,
  activeHighlightId,
  coveredIds,
  onSelectPage,
}) => {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <aside
      id="pdf-minimap-strip"
      className="minimap-strip"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        padding: "16px 12px",
        background: "rgba(10, 14, 24, 0.75)",
        borderRight: "1px solid var(--border-subtle)",
        width: "140px",
        flexShrink: 0,
        overflowY: "auto",
        maxHeight: "750px",
        userSelect: "none",
      }}
    >
      <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", textAlign: "center", letterSpacing: "0.05em" }}>
        Mini-Map
      </div>

      {pages.map((pNo) => {
        const isCurrentPage = pNo === currentPage;
        const pageHighlights = highlights.filter((h) => h.pageNo === pNo);

        return (
          <div
            key={pNo}
            id={`minimap-thumb-p${pNo}`}
            onClick={() => onSelectPage(pNo)}
            style={{
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {/* Thumbnail Canvas Page Card */}
            <div
              className={`minimap-thumb ${isCurrentPage ? "active-page-thumb" : ""}`}
              style={{
                width: "90px",
                height: "122px",
                background: "#0f172a",
                border: isCurrentPage ? "2px solid var(--accent-cyan)" : "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: "4px",
                position: "relative",
                overflow: "hidden",
                boxShadow: isCurrentPage ? "0 0 16px rgba(6, 182, 212, 0.45)" : "0 4px 12px rgba(0, 0, 0, 0.4)",
                transition: "all 0.2s ease",
              }}
            >
              {/* Miniature Document Lines simulation */}
              <div style={{ position: "absolute", top: "10px", left: "8px", right: "8px", height: "3px", background: "rgba(255,255,255,0.18)", borderRadius: "1px" }} />
              <div style={{ position: "absolute", top: "18px", left: "8px", right: "18px", height: "2px", background: "rgba(255,255,255,0.08)", borderRadius: "1px" }} />
              <div style={{ position: "absolute", top: "24px", left: "8px", right: "12px", height: "2px", background: "rgba(255,255,255,0.08)", borderRadius: "1px" }} />
              <div style={{ position: "absolute", top: "30px", left: "8px", right: "14px", height: "2px", background: "rgba(255,255,255,0.08)", borderRadius: "1px" }} />

              {/* Render Miniature Normalized Rectangles */}
              {pageHighlights.map((hl) => {
                const isActive = hl.id === activeHighlightId;
                const isCovered = coveredIds.has(hl.id);

                return hl.rects.map((rect, idx) => {
                  let fillColor = "rgba(148, 163, 184, 0.35)";
                  let borderColor = "transparent";

                  if (isActive) {
                    fillColor = "rgba(6, 182, 212, 0.75)";
                    borderColor = "#38bdf8";
                  } else if (isCovered) {
                    fillColor = "rgba(16, 185, 129, 0.55)";
                    borderColor = "#10b981";
                  }

                  return (
                    <div
                      key={`${hl.id}-mrect-${idx}`}
                      style={{
                        position: "absolute",
                        left: `${rect.x0 * 100}%`,
                        top: `${rect.y0 * 100}%`,
                        width: `${(rect.x1 - rect.x0) * 100}%`,
                        height: `${(rect.y1 - rect.y0) * 100}%`,
                        backgroundColor: fillColor,
                        border: borderColor !== "transparent" ? `1px solid ${borderColor}` : "none",
                        borderRadius: "1px",
                        boxShadow: isActive ? "0 0 8px rgba(6, 182, 212, 0.8)" : "none",
                        zIndex: isActive ? 10 : 2,
                      }}
                    />
                  );
                });
              })}
            </div>

            {/* Page Label & Indicators */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: isCurrentPage ? 700 : 500,
                  color: isCurrentPage ? "#38bdf8" : "var(--text-secondary)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                Page {pNo}
              </span>
              {pageHighlights.some((h) => coveredIds.has(h.id)) && (
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: "var(--accent-emerald)",
                    display: "inline-block",
                  }}
                  title="Contains covered content"
                />
              )}
            </div>
          </div>
        );
      })}
    </aside>
  );
};
