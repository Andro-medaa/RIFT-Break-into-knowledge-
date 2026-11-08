"use client";

import React, { useState } from "react";
import { HighlightItem } from "@/types/pdf";

interface ChunkNavigatorProps {
  highlights: HighlightItem[];
  activeHighlightId: string | null;
  coveredIds: Set<string>;
  currentPage: number;
  onSelectHighlight: (id: string, pageNo: number) => void;
  onToggleCovered: (id: string) => void;
}

export const ChunkNavigator: React.FC<ChunkNavigatorProps> = ({
  highlights,
  activeHighlightId,
  coveredIds,
  currentPage,
  onSelectHighlight,
  onToggleCovered,
}) => {
  const [filterCurrentPage, setFilterCurrentPage] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const displayedHighlights = highlights.filter((h) => {
    if (filterCurrentPage && h.pageNo !== currentPage) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        Boolean(h.text && h.text.toLowerCase().includes(q)) ||
        Boolean(h.label && h.label.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const totalCount = highlights.length;
  const coveredCount = highlights.filter((h) => coveredIds.has(h.id)).length;
  const progressPct = totalCount > 0 ? Math.round((coveredCount / totalCount) * 100) : 0;

  return (
    <div
      id="chunk-navigator-panel"
      className="chunk-navigator"
      style={{
        display: "flex",
        flexDirection: "column",
        width: "320px",
        flexShrink: 0,
        background: "rgba(10, 14, 24, 0.75)",
        borderLeft: "1px solid var(--border-subtle)",
        maxHeight: "750px",
      }}
    >
      {/* Header & Progress Bar */}
      <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border-subtle)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.03em" }}>
            📑 LESSON ROADMAP
          </span>
          <span style={{ fontSize: "0.78rem", color: "#67e8f9", fontFamily: "var(--font-mono)" }}>
            {coveredCount}/{totalCount} ({progressPct}%)
          </span>
        </div>

        {/* Progress Track */}
        <div style={{ width: "100%", height: "4px", background: "rgba(255, 255, 255, 0.1)", borderRadius: "2px", overflow: "hidden" }}>
          <div
            id="lesson-progress-bar"
            style={{
              width: `${progressPct}%`,
              height: "100%",
              background: "var(--gradient-brand)",
              transition: "width 0.3s ease",
            }}
          />
        </div>

        {/* Filter Toggle */}
        <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
          <button
            id="filter-all-chunks-btn"
            onClick={() => setFilterCurrentPage(false)}
            style={{
              flex: 1,
              padding: "4px 8px",
              borderRadius: "4px",
              fontSize: "0.74rem",
              fontWeight: 600,
              border: !filterCurrentPage ? "1px solid var(--accent-cyan)" : "1px solid var(--border-subtle)",
              background: !filterCurrentPage ? "rgba(6, 182, 212, 0.15)" : "transparent",
              color: !filterCurrentPage ? "#67e8f9" : "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            All Chunks ({totalCount})
          </button>
          <button
            id="filter-page-chunks-btn"
            onClick={() => setFilterCurrentPage(true)}
            style={{
              flex: 1,
              padding: "4px 8px",
              borderRadius: "4px",
              fontSize: "0.74rem",
              fontWeight: 600,
              border: filterCurrentPage ? "1px solid var(--accent-cyan)" : "1px solid var(--border-subtle)",
              background: filterCurrentPage ? "rgba(6, 182, 212, 0.15)" : "transparent",
              color: filterCurrentPage ? "#67e8f9" : "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            Page {currentPage} Only
          </button>
        </div>

        {/* Step 11: Hybrid Chunk Search Bar */}
        <div style={{ marginTop: "10px" }}>
          <input
            id="input-chunk-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔍 Search chunks (Hybrid/BM25)..."
            style={{
              width: "100%",
              padding: "6px 10px",
              borderRadius: "4px",
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              color: "#f8fafc",
              fontSize: "0.75rem",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
      </div>

      {/* Chunk Items List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {displayedHighlights.map((hl) => {
          const isActive = hl.id === activeHighlightId;
          const isCovered = coveredIds.has(hl.id);

          return (
            <div
              key={hl.id}
              id={`chunk-item-${hl.id}`}
              onClick={() => onSelectHighlight(hl.id, hl.pageNo)}
              style={{
                padding: "12px 14px",
                borderRadius: "var(--radius-sm)",
                background: isActive ? "rgba(6, 182, 212, 0.12)" : isCovered ? "rgba(16, 185, 129, 0.06)" : "rgba(255, 255, 255, 0.03)",
                border: isActive
                  ? "1px solid var(--accent-cyan)"
                  : isCovered
                  ? "1px solid rgba(16, 185, 129, 0.3)"
                  : "1px solid var(--border-subtle)",
                boxShadow: isActive ? "0 0 12px rgba(6, 182, 212, 0.25)" : "none",
                cursor: "pointer",
                transition: "all 0.18s ease",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: "3px",
                      background: hl.color === "cyan" ? "rgba(6, 182, 212, 0.2)" : "rgba(139, 92, 246, 0.2)",
                      color: hl.color === "cyan" ? "#67e8f9" : "#d8b4fe",
                      textTransform: "uppercase",
                    }}
                  >
                    {hl.label || "Chunk"}
                  </span>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    P.{hl.pageNo}
                  </span>
                </div>

                {/* Mark as read/covered button */}
                <button
                  id={`mark-covered-${hl.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleCovered(hl.id);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    color: isCovered ? "#34d399" : "var(--text-muted)",
                    padding: "2px 4px",
                  }}
                  title={isCovered ? "Mark as unread" : "Mark as read"}
                >
                  {isCovered ? "✓" : "○"}
                </button>
              </div>

              {/* Text Snippet Preview */}
              <p
                style={{
                  fontSize: "0.78rem",
                  color: isActive ? "#f8fafc" : "var(--text-secondary)",
                  lineHeight: 1.45,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {hl.text || "No preview text"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
