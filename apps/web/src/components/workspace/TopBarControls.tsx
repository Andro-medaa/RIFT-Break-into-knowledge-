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

      {/* ── Voice Engine Toggle: Desktop dual-button vs Mobile minimal slide switch ── */}
      {isMobile ? (
        <button
          type="button"
          onClick={() => setVoiceEngine(voiceEngine === "ai" ? "browser" : "ai")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            background: "rgba(3, 12, 18, 0.90)",
            border: `1px solid ${
              voiceEngine === "ai"
                ? "rgba(0, 245, 212, 0.45)"
                : "rgba(100, 116, 139, 0.3)"
            }`,
            borderRadius: "14px",
            padding: "2px 6px 2px 7px",
            cursor: "pointer",
            transition: "all 0.2s ease",
            boxShadow:
              voiceEngine === "ai"
                ? "0 0 10px rgba(0, 245, 212, 0.25)"
                : "none",
          }}
          title={
            voiceEngine === "ai"
              ? "Voice Mode: AI (Tap to switch to Browser)"
              : "Voice Mode: Browser (Tap to switch to AI)"
          }
        >
          <span
            style={{
              fontSize: "10.5px",
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              color: voiceEngine === "ai" ? "#00f5d4" : "#94a3b8",
              letterSpacing: "0.02em",
              userSelect: "none",
            }}
          >
            {voiceEngine === "ai" ? "AI Voice" : "Native"}
          </span>

          {/* Micro Sliding Pill Switch */}
          <div
            style={{
              width: "28px",
              height: "14px",
              borderRadius: "7px",
              background:
                voiceEngine === "ai"
                  ? "linear-gradient(90deg, rgba(13, 148, 136, 0.8), rgba(0, 245, 212, 0.95))"
                  : "rgba(30, 41, 59, 0.8)",
              border: `1px solid ${
                voiceEngine === "ai"
                  ? "rgba(0, 245, 212, 0.6)"
                  : "rgba(100, 116, 139, 0.4)"
              }`,
              position: "relative",
              transition: "all 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
              boxShadow:
                voiceEngine === "ai"
                  ? "0 0 8px rgba(0, 245, 212, 0.4)"
                  : "none",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "1px",
                left: voiceEngine === "ai" ? "15px" : "1px",
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: voiceEngine === "ai" ? "#020406" : "#64748b",
                boxShadow: voiceEngine === "ai" ? "0 0 4px #00f5d4" : "none",
                transition: "all 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            />
          </div>
        </button>
      ) : (
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
