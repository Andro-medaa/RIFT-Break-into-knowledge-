"use client";

import React from "react";
import { HighlightItem, HighlightColor } from "@/types/pdf";

interface HighlightLayerProps {
  highlights: HighlightItem[];
  pageNo: number;
  spotlightMode: boolean;
  activeHighlightId: string | null;
  onSelectHighlight?: (id: string) => void;
}

const COLOR_STYLES: Record<HighlightColor, { bg: string; border: string; glow: string; text: string }> = {
  cyan: {
    bg: "rgba(6, 182, 212, 0.20)",
    border: "rgba(6, 182, 212, 0.85)",
    glow: "0 0 16px rgba(6, 182, 212, 0.55)",
    text: "#67e8f9",
  },
  amber: {
    bg: "rgba(245, 158, 11, 0.22)",
    border: "rgba(245, 158, 11, 0.90)",
    glow: "0 0 16px rgba(245, 158, 11, 0.55)",
    text: "#fde68a",
  },
  purple: {
    bg: "rgba(139, 92, 246, 0.22)",
    border: "rgba(139, 92, 246, 0.85)",
    glow: "0 0 16px rgba(139, 92, 246, 0.55)",
    text: "#d8b4fe",
  },
  emerald: {
    bg: "rgba(16, 185, 129, 0.20)",
    border: "rgba(16, 185, 129, 0.85)",
    glow: "0 0 16px rgba(16, 185, 129, 0.55)",
    text: "#6ee7b7",
  },
};

export const HighlightLayer: React.FC<HighlightLayerProps> = ({
  highlights,
  pageNo,
  spotlightMode,
  activeHighlightId,
  onSelectHighlight,
}) => {
  const pageHighlights = highlights.filter((h) => h.pageNo === pageNo);

  return (
    <div
      className="highlight-overlay-container"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      {/* Spotlight mode backdrop: dim non-active areas if active highlight exists */}
      {spotlightMode && activeHighlightId && (
        <div
          className="spotlight-dimmer"
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(3, 7, 18, 0.55)",
            backdropFilter: "blur(1px)",
            transition: "opacity 0.3s ease",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
      )}

      {/* Render all normalized rectangles for this page */}
      {pageHighlights.map((hl) => {
        const isActive = hl.id === activeHighlightId;
        const colorCfg = COLOR_STYLES[hl.color || "cyan"];

        return hl.rects.map((rect, idx) => {
          const rectKey = `${hl.id}-rect-${idx}`;

          const style: React.CSSProperties = {
            position: "absolute",
            left: `${rect.x0 * 100}%`,
            top: `${rect.y0 * 100}%`,
            width: `${(rect.x1 - rect.x0) * 100}%`,
            height: `${(rect.y1 - rect.y0) * 100}%`,
            backgroundColor: colorCfg.bg,
            border: `2px solid ${colorCfg.border}`,
            borderRadius: "6px",
            boxShadow: isActive ? colorCfg.glow : "none",
            pointerEvents: "auto",
            cursor: "pointer",
            transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            zIndex: isActive ? 20 : 5,
            animation: isActive ? "highlightPulse 1.8s infinite ease-in-out" : "none",
          };

          return (
            <div
              key={rectKey}
              id={`highlight-${hl.id}`}
              style={style}
              className={`highlight-box ${isActive ? "active-highlight" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onSelectHighlight?.(hl.id);
              }}
              title={hl.label ? `${hl.label}: ${hl.text}` : hl.text}
            >
              {/* Floating label tag */}
              {hl.label && (
                <div
                  style={{
                    position: "absolute",
                    top: "-22px",
                    left: "0",
                    background: "rgba(10, 15, 29, 0.95)",
                    border: `1px solid ${colorCfg.border}`,
                    color: colorCfg.text,
                    fontSize: "0.68rem",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: "4px",
                    whiteSpace: "nowrap",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                    pointerEvents: "none",
                    letterSpacing: "0.03em",
                  }}
                >
                  {hl.label}
                </div>
              )}
            </div>
          );
        });
      })}
    </div>
  );
};
