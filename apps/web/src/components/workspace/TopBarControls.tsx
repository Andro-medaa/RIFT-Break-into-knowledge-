"use client";

import React from "react";
import { Sparkles, Globe, AlertTriangle, X } from "lucide-react";
import { useWorkspace } from "@/lib/workspace";
import RoadmapPopover from "./RoadmapPopover";

export default function TopBarControls({ isMobile = false }: { isMobile?: boolean } = {}) {
  const {
    voiceEngine,
    setVoiceEngine,
    voiceFallbackNotice,
    setVoiceFallbackNotice,
  } = useWorkspace();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", position: "relative" }}>
      {/* ── Temporary Error Warning Notification ── */}
      {voiceFallbackNotice && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "3px 9px",
            borderRadius: "6px",
            background: "rgba(239, 68, 68, 0.16)",
            border: "1px solid rgba(239, 68, 68, 0.45)",
            color: "#fca5a5",
            fontSize: "10.5px",
            fontFamily: "var(--font-mono)",
            animation: "fadeIn 0.2s ease-out",
            boxShadow: "0 2px 10px rgba(239, 68, 68, 0.2)",
            whiteSpace: "nowrap",
          }}
        >
          <AlertTriangle size={11} color="#f87171" style={{ flexShrink: 0 }} />
          <span>{voiceFallbackNotice}</span>
          <button
            onClick={() => setVoiceFallbackNotice(null)}
            style={{
              background: "transparent",
              border: "none",
              color: "#fca5a5",
              cursor: "pointer",
              padding: "0 2px",
              display: "flex",
              alignItems: "center",
            }}
            title="Dismiss notice"
          >
            <X size={10} />
          </button>
        </div>
      )}

      {/* ── Voice Engine Toggle: AI Emotional Voices vs Browser Built-in Voices (Desktop only; on mobile it lives in the expanded script drawer) ── */}
      {!isMobile && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: "rgba(3, 12, 18, 0.85)",
            border: "1px solid rgba(0, 245, 212, 0.22)",
            borderRadius: "8px",
            padding: "2px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.4)",
          }}
        >
          {/* Left Option: AI Emotional Voices */}
          <button
            onClick={() => setVoiceEngine("ai")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "3px 8px",
              borderRadius: "6px",
              fontSize: "10.5px",
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.18s ease",
              border: "none",
              background:
                voiceEngine === "ai"
                  ? "linear-gradient(135deg, rgba(192, 132, 252, 0.35), rgba(0, 245, 212, 0.25))"
                  : "transparent",
              color: voiceEngine === "ai" ? "#00f5d4" : "#64748b",
              boxShadow:
                voiceEngine === "ai"
                  ? "0 0 12px rgba(0, 245, 212, 0.35), inset 0 0 8px rgba(192, 132, 252, 0.2)"
                  : "none",
            }}
            title="Use ElevenLabs neural AI emotional voice synthesis"
          >
            <Sparkles size={11} color={voiceEngine === "ai" ? "#00f5d4" : "#64748b"} />
            <span>AI Emotional Voices</span>
          </button>

          {/* Right Option: Browser Built-in Voices */}
          <button
            onClick={() => setVoiceEngine("browser")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "3px 8px",
              borderRadius: "6px",
              fontSize: "10.5px",
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.18s ease",
              border: "none",
              background:
                voiceEngine === "browser"
                  ? "linear-gradient(135deg, rgba(2, 132, 199, 0.35), rgba(0, 245, 212, 0.25))"
                  : "transparent",
              color: voiceEngine === "browser" ? "#38bdf8" : "#64748b",
              boxShadow:
                voiceEngine === "browser"
                  ? "0 0 12px rgba(56, 189, 248, 0.35), inset 0 0 8px rgba(2, 132, 199, 0.2)"
                  : "none",
            }}
            title="Use browser built-in Web Speech API voice synthesis (zero quota/offline)"
          >
            <Globe size={11} color={voiceEngine === "browser" ? "#38bdf8" : "#64748b"} />
            <span>Browser Built-in Voices</span>
          </button>
        </div>
      )}

      {/* ── Roadmap Popover Pill ── */}
      <RoadmapPopover isMobile={isMobile} />
    </div>
  );
}
