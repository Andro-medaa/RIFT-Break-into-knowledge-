"use client";

import React from "react";
import { CyberNekoSvg } from "./CyberMascotLoader";

export interface CyberNekoProps {
  size?: number;
  mode?: "parsing" | "embedding" | "listening" | "dictating" | "general";
  isSpeaking?: boolean;
  audioEnergy?: number;
  showBadge?: boolean;
  showStatus?: boolean;
  statusText?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * Cyber Neko – The Neon Synth Audio Dictator Cat for RIFT.
 *
 * Inspired by pdf_dictator_rag_buffer_studio.tsx:
 * - DJ studio low-latency headphones with pulsating ear cushions & emitted audio wave ripples
 * - Swooshing animated neon cat tail with fluid curve
 * - Reactive neon whiskers that pulse like an audio frequency equalizer
 * - Cyber cat ears with glowing tips
 * - Blinking visor eyes with specular highlights
 * - Cute ":3" cat mouth with speaking animation when dictating
 * - Stack of indexed PDF knowledge bricks beneath it (VECTOR_INDEX_READY)
 * - Orbiting vector cubes ([0.8], [v], CHUNK) in 3D-like elliptical orbit
 */
export function CyberNeko({
  size = 96,
  mode = "general",
  isSpeaking = false,
  audioEnergy = 0.5,
  showBadge = false,
  showStatus = false,
  statusText,
  className = "",
  style = {},
  onClick,
}: CyberNekoProps) {
  return (
    <div
      className={`cyber-neko-container inline-flex flex-col items-center justify-center select-none ${className}`}
      style={style}
      onClick={onClick}
    >
      <div className="relative flex items-center justify-center group cursor-pointer">
        {/* Soft Ambient Neon Glow Aura */}
        <div
          className="absolute inset-0 rounded-full blur-xl pointer-events-none opacity-40 transition-opacity duration-300 group-hover:opacity-70"
          style={{
            background:
              mode === "dictating" || isSpeaking
                ? "radial-gradient(circle, #00f5d4 0%, transparent 70%)"
                : mode === "embedding"
                ? "radial-gradient(circle, #c084fc 0%, transparent 70%)"
                : "radial-gradient(circle, #38bdf8 0%, transparent 70%)",
          }}
        />

        <CyberNekoSvg
          size={size}
          mode={mode}
          isSpeaking={isSpeaking}
          audioEnergy={audioEnergy}
        />
      </div>

      {showBadge && (
        <span className="mt-1 px-2 py-0.5 rounded-full text-[9.5px] font-mono font-semibold bg-[#00f5d4]/10 border border-[#00f5d4]/30 text-[#00f5d4]">
          CYBER NEKO • {mode.toUpperCase()}
        </span>
      )}

      {showStatus && statusText && (
        <p className="mt-1 text-[11px] font-mono text-[#94a3b8] max-w-[220px] text-center truncate">
          {statusText}
        </p>
      )}
    </div>
  );
}

export default CyberNeko;
