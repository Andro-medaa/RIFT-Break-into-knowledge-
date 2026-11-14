"use client";

import React, { useState, useEffect, useId } from "react";
import { Sparkles, RefreshCw, Zap, Bot } from "lucide-react";

export interface MascotInfo {
  id: string;
  name: string;
  role: string;
  description: string;
}

export const MASCOT_ROSTER: MascotInfo[] = [
  {
    id: "cyber-neko",
    name: "Cyber Neko",
    role: "Neon Synth Audio Dictator Cat",
    description: "DJ headphones, audio-wave whiskers & floating vector chunks",
  },
  {
    id: "rift-bot",
    name: "RIFT-Bot",
    role: "Autonomous Drone",
    description: "Hovering & scanning neural paths",
  },
  {
    id: "astro-cat",
    name: "Cyber Astro-Cat",
    role: "Cosmic Navigator",
    description: "Pawing through orbital frequencies",
  },
  {
    id: "chibi-scholar",
    name: "Chibi Scholar",
    role: "Quantum Researcher",
    description: "Deciphering high-dimensional papers",
  },
  {
    id: "pixel-mascot",
    name: "8-Bit Matrix Critter",
    role: "Retro Co-Pilot",
    description: "Crunching byte-level matrix packets",
  },
];

export const RAG_PIPELINE_STATUSES: Record<string, string[]> = {
  parsing: [
    "Unrolling PDF scrolls & extracting crisp text layers…",
    "Scanning tables, formulas, and margins at 120 pages/sec…",
    "Ironing out crinkled PDF pages & decoding typography…",
    "Calibrating OCR & document layout trees…",
  ],
  embedding: [
    "Chopping bulky chapters into 512-token kibble chunks…",
    "Polishing high-dimensional vector cubes for cosine similarity…",
    "Sniffing out semantic embeddings into Vector DB…",
    "Turning dense paragraphs into glowing knowledge crystals…",
  ],
  listening: [
    "Ears perked! Listening for your question about the document…",
    "Capturing voice frequencies & matching intent to PDF sections…",
    "Analyzing audio waveform for document query keywords…",
  ],
  dictating: [
    "Dictating verified answer with exact page & section citations!",
    "Streaming neural voice synthesized from PDF knowledge…",
    "Karaoke word-by-word tracking synchronized to audio stream…",
  ],
  general: [
    "Calibrating neural tensors…",
    "Consulting orbital knowledge archives…",
    "Synthesizing multimodal vector embeddings…",
    "Aligning attention heads with PDF document…",
    "Translating LaTeX equations into audio waveforms…",
    "Optimizing cognitive breakdown nodes…",
  ],
};

const DEFAULT_SCI_FI_STATUSES = RAG_PIPELINE_STATUSES.general;

export interface CyberMascotLoaderProps {
  title?: string;
  subtitle?: string;
  size?: "avatar" | "sm" | "md" | "lg" | "inline";
  initialMascotIndex?: number;
  mode?: "parsing" | "embedding" | "listening" | "dictating" | "general";
  isSpeaking?: boolean;
  audioEnergy?: number;
  showStatusTicker?: boolean;
  showSwitchButton?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/* ══════════════════════════════════════════════════════════════════════
   MASCOT 0: Cyber Neko (Neon Synth Audio Dictator Cat)
   Inspired by pdf_dictator_rag_buffer_studio.tsx
   ══════════════════════════════════════════════════════════════════════ */
export function CyberNekoSvg({
  size = 96,
  mode = "general",
  isSpeaking = false,
  audioEnergy = 0.5,
}: {
  size?: number;
  mode?: "parsing" | "embedding" | "listening" | "dictating" | "general";
  isSpeaking?: boolean;
  audioEnergy?: number;
}) {
  return (
    <svg
      width={size}
      height={Math.round((size * 145) / 160)}
      viewBox="0 0 160 145"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="rift-neko-float"
      style={{ overflow: "visible" }}
    >
      <defs>
        {/* Glow Filters */}
        <filter id="rift-neko-cyan-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3.2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="rift-neko-purple-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        {/* Head Gradient */}
        <linearGradient id="riftNekoHeadGrad" x1="40" y1="35" x2="120" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="60%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#020617" />
        </linearGradient>

        {/* Tail Gradient */}
        <linearGradient id="riftNekoTailGrad" x1="15" y1="60" x2="50" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00f5d4" />
          <stop offset="50%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>

        {/* Headphone Band Gradient */}
        <linearGradient id="riftNekoHpBandGrad" x1="30" y1="20" x2="130" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00f5d4" />
          <stop offset="50%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>

        {/* Book Spine Gradient */}
        <linearGradient id="riftNekoBookGrad" x1="40" y1="110" x2="120" y2="130" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="50%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#090d16" />
        </linearGradient>
      </defs>

      {/* Desk Shadow (Expands and contracts gently with float) */}
      <ellipse cx="80" cy="134" rx="46" ry="7" fill="rgba(0, 0, 0, 0.55)" />

      {/* ── STACK OF INDEXED PDF KNOWLEDGE BOOKS (Under Neko) ── */}
      <g className="rift-neko-bookstack">
        {/* Bottom PDF Brick */}
        <rect
          x="38"
          y="118"
          width="84"
          height="13"
          rx="4"
          fill="url(#riftNekoBookGrad)"
          stroke="#00f5d4"
          strokeWidth="1.6"
        />
        {/* Spine stitches / bookmark ribbon */}
        <line x1="48" y1="120" x2="48" y2="129" stroke="#38bdf8" strokeWidth="1.5" />
        <text
          x="84"
          y="127.5"
          fontSize="6"
          fontWeight="bold"
          fontFamily="monospace"
          fill="#00f5d4"
          letterSpacing="0.08em"
          textAnchor="middle"
        >
          VECTOR_INDEX_READY
        </text>

        {/* Top PDF Brick */}
        <rect
          x="44"
          y="108"
          width="72"
          height="11"
          rx="3.5"
          fill="#090e1a"
          stroke="#c084fc"
          strokeWidth="1.5"
        />
        {/* PDF Bookmark Ribbon hanging down */}
        <path d="M 52 114 L 52 125 L 56 122 L 60 125 L 60 114 Z" fill="#f43f5e" />
        <text
          x="86"
          y="116.5"
          fontSize="5.5"
          fontWeight="bold"
          fontFamily="monospace"
          fill="#c084fc"
          textAnchor="middle"
        >
          RIFT_PDF_RAG
        </text>
      </g>

      {/* ── SWOOSHING NEON CAT TAIL ── */}
      <g className="rift-neko-tail">
        <path
          d="M 44 98 C 16 94 10 65 24 50 C 30 42 38 48 34 56 C 28 64 22 76 42 88"
          fill="none"
          stroke="url(#riftNekoTailGrad)"
          strokeWidth="7"
          strokeLinecap="round"
          filter="url(#rift-neko-cyan-glow)"
        />
      </g>

      {/* ── AUDIO WAVE RIPPLES (Emanating from DJ Headphones) ── */}
      {(mode === "dictating" || mode === "listening" || isSpeaking) && (
        <g className="rift-soundwaves">
          {/* Left Audio Waves */}
          <path
            d="M 18 54 Q 10 66 18 78"
            stroke="#00f5d4"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
            className="rift-soundwave-left-1"
          />
          <path
            d="M 12 48 Q 2 66 12 84"
            stroke="#38bdf8"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
            className="rift-soundwave-left-2"
          />

          {/* Right Audio Waves */}
          <path
            d="M 142 54 Q 150 66 142 78"
            stroke="#00f5d4"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
            className="rift-soundwave-right-1"
          />
          <path
            d="M 148 48 Q 158 66 148 84"
            stroke="#38bdf8"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
            className="rift-soundwave-right-2"
          />
        </g>
      )}

      {/* ── ORBITING VECTOR CHUNKS / DATA CUBES ── */}
      {/* Cube 1: Top-Right Chunk */}
      <g className="rift-vector-cube-1" transform="translate(126, 26)">
        <rect
          x="-9"
          y="-9"
          width="18"
          height="18"
          rx="4.5"
          fill="#06121f"
          stroke="#00f5d4"
          strokeWidth="1.5"
          filter="url(#rift-neko-cyan-glow)"
        />
        <text
          x="0"
          y="3"
          fontSize="6"
          fontWeight="bold"
          fontFamily="monospace"
          fill="#00f5d4"
          textAnchor="middle"
        >
          [0.8]
        </text>
      </g>

      {/* Cube 2: Top-Left Vector Key */}
      <g className="rift-vector-cube-2" transform="translate(22, 28)">
        <rect
          x="-8"
          y="-8"
          width="16"
          height="16"
          rx="4"
          fill="#0b0a1f"
          stroke="#c084fc"
          strokeWidth="1.5"
          filter="url(#rift-neko-purple-glow)"
        />
        <text
          x="0"
          y="2.5"
          fontSize="6"
          fontWeight="bold"
          fontFamily="monospace"
          fill="#c084fc"
          textAnchor="middle"
        >
          [v]
        </text>
      </g>

      {/* Cube 3: Mid-Right Floating Kibble Chunk */}
      {(mode === "embedding" || mode === "parsing" || mode === "general") && (
        <g className="rift-vector-cube-1" transform="translate(136, 88)">
          <rect
            x="-11"
            y="-7"
            width="22"
            height="14"
            rx="3.5"
            fill="#091322"
            stroke="#38bdf8"
            strokeWidth="1.2"
          />
          <text
            x="0"
            y="2.5"
            fontSize="5"
            fontWeight="bold"
            fontFamily="monospace"
            fill="#38bdf8"
            textAnchor="middle"
          >
            CHUNK
          </text>
        </g>
      )}

      {/* ── CYBER CAT EARS (with glowing inner tips) ── */}
      {/* Left Ear */}
      <g className="rift-neko-ear-l">
        <polygon
          points="46,44 32,16 62,34"
          fill="#0f172a"
          stroke="#00f5d4"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <polygon
          points="44,38 35,21 54,32"
          fill="#c084fc"
          opacity="0.85"
          filter="url(#rift-neko-purple-glow)"
        />
      </g>

      {/* Right Ear */}
      <g className="rift-neko-ear-r">
        <polygon
          points="114,44 128,16 98,34"
          fill="#0f172a"
          stroke="#00f5d4"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <polygon
          points="116,38 125,21 106,32"
          fill="#c084fc"
          opacity="0.85"
          filter="url(#rift-neko-purple-glow)"
        />
      </g>

      {/* ── SLEEK CAT HEAD ── */}
      <ellipse
        cx="80"
        cy="68"
        rx="46"
        ry="38"
        fill="url(#riftNekoHeadGrad)"
        stroke="#00f5d4"
        strokeWidth="2.5"
      />

      {/* ── STUDIO DJ HEADPHONES ── */}
      {/* Headphone Arch Band */}
      <path
        d="M 36 62 A 44 44 0 0 1 124 62"
        fill="none"
        stroke="url(#riftNekoHpBandGrad)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      {/* Inner Accent Line on Band */}
      <path
        d="M 40 60 A 40 40 0 0 1 120 60"
        fill="none"
        stroke="#ffffff"
        strokeWidth="1.2"
        opacity="0.6"
        strokeLinecap="round"
      />

      {/* Left Ear Cup */}
      <rect
        x="26"
        y="50"
        width="14"
        height="30"
        rx="7"
        fill="#00f5d4"
        stroke="#ffffff"
        strokeWidth="1.5"
        className="rift-headphone-glow"
      />
      <circle cx="33" cy="65" r="3.5" fill="#020617" />
      <circle cx="33" cy="65" r="1.5" fill="#00f5d4" />

      {/* Right Ear Cup */}
      <rect
        x="120"
        y="50"
        width="14"
        height="30"
        rx="7"
        fill="#00f5d4"
        stroke="#ffffff"
        strokeWidth="1.5"
        className="rift-headphone-glow"
      />
      <circle cx="127" cy="65" r="3.5" fill="#020617" />
      <circle cx="127" cy="65" r="1.5" fill="#00f5d4" />

      {/* ── GLOWING CYBER VISOR EYES ── */}
      <g className="rift-eyes-blink">
        {/* Left Visor Eye */}
        <ellipse
          cx="64"
          cy="64"
          rx="10"
          ry="8"
          fill="#00f5d4"
          filter="url(#rift-neko-cyan-glow)"
        />
        <circle cx="61.5" cy="61.5" r="2.8" fill="#ffffff" />
        <circle cx="66" cy="65.5" r="1.2" fill="#ffffff" />

        {/* Right Visor Eye */}
        <ellipse
          cx="96"
          cy="64"
          rx="10"
          ry="8"
          fill="#00f5d4"
          filter="url(#rift-neko-cyan-glow)"
        />
        <circle cx="93.5" cy="61.5" r="2.8" fill="#ffffff" />
        <circle cx="98" cy="65.5" r="1.2" fill="#ffffff" />
      </g>

      {/* Cute Anime Cheek Blush */}
      <ellipse cx="51" cy="74" rx="4.5" ry="2.2" fill="#f43f5e" opacity="0.65" filter="url(#rift-neko-cyan-glow)" />
      <ellipse cx="109" cy="74" rx="4.5" ry="2.2" fill="#f43f5e" opacity="0.65" filter="url(#rift-neko-cyan-glow)" />

      {/* ── REACTIVE NEON WHISKERS (Equalizer Pulse) ── */}
      <g stroke="#38bdf8" strokeWidth="1.8" strokeLinecap="round" opacity="0.9">
        {/* Left Whiskers */}
        <g className="rift-neko-whiskers-left">
          <line x1="48" y1="72" x2="22" y2="68" />
          <line x1="48" y1="78" x2="22" y2="80" />
        </g>
        {/* Right Whiskers */}
        <g className="rift-neko-whiskers-right">
          <line x1="112" y1="72" x2="138" y2="68" />
          <line x1="112" y1="78" x2="138" y2="80" />
        </g>
      </g>

      {/* ── CUTE ":3" NOSE & MOUTH ── */}
      {/* Pink Triangular Nose */}
      <polygon points="77,75 83,75 80,78" fill="#f472b6" />

      {/* Cute ":3" Mouth Curve */}
      <path
        d="M 72 80 Q 76 84 80 80 Q 84 84 88 80"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />

      {/* Synchronized Voice/Talking Mouth Opening */}
      {(mode === "dictating" || isSpeaking) && (
        <ellipse
          cx="80"
          cy="84"
          rx="5.5"
          ry="3.5"
          fill="#c084fc"
          stroke="#00f5d4"
          strokeWidth="1"
          className="rift-neko-mouth-talking"
        />
      )}
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   MASCOT 1: RIFT-Bot (Cute Floating Cyber Drone)
   ══════════════════════════════════════════════════════════════════════ */
function RiftBotSvg({ size = 96 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="rift-mascot-float"
      style={{ overflow: "visible" }}
    >
      <defs>
        {/* Glow Filters */}
        <filter id="rift-cyan-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="rift-intense-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        {/* Chassis Gradients */}
        <linearGradient id="riftBotChassis" x1="20" y1="20" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="50%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#020617" />
        </linearGradient>

        <linearGradient id="riftBotVisor" x1="30" y1="40" x2="90" y2="65" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#031622" />
          <stop offset="100%" stopColor="#020813" />
        </linearGradient>

        <linearGradient id="riftTealGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00f5d4" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>

      {/* Orbital holographic rings */}
      <g className="rift-mascot-orbit">
        <ellipse
          cx="60"
          cy="60"
          rx="52"
          ry="16"
          stroke="rgba(0, 245, 212, 0.28)"
          strokeWidth="1.2"
          strokeDasharray="4 6"
          transform="rotate(-20 60 60)"
        />
        <circle cx="20" cy="46" r="3" fill="#00f5d4" filter="url(#rift-cyan-glow)" />
        <circle cx="100" cy="74" r="2.2" fill="#c084fc" filter="url(#rift-cyan-glow)" />
      </g>

      {/* Levitation Wave Rings (Bottom) */}
      <g className="rift-levitation-emitter">
        <ellipse cx="60" cy="104" rx="24" ry="6" stroke="#00f5d4" strokeWidth="1.5" className="rift-pulse-ring-1" />
        <ellipse cx="60" cy="104" rx="16" ry="4" stroke="#00f5d4" strokeWidth="1.5" className="rift-pulse-ring-2" />
      </g>

      {/* Thruster Ion Cone */}
      <path
        d="M 50 88 Q 60 102 70 88 Z"
        fill="url(#riftTealGrad)"
        opacity="0.85"
        filter="url(#rift-cyan-glow)"
        className="rift-thruster-flicker"
      />

      {/* Bot Antennas */}
      {/* Left Antenna */}
      <line x1="42" y1="34" x2="30" y2="18" stroke="#00f5d4" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="28" cy="16" r="4.5" fill="#00f5d4" filter="url(#rift-intense-glow)" />
      <circle cx="28" cy="16" r="2" fill="#ffffff" />

      {/* Right Antenna */}
      <line x1="78" y1="34" x2="90" y2="18" stroke="#00f5d4" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="92" cy="16" r="4.5" fill="#c084fc" filter="url(#rift-intense-glow)" />
      <circle cx="92" cy="16" r="2" fill="#ffffff" />

      {/* Floating Robot Body */}
      <rect
        x="30"
        y="30"
        width="60"
        height="58"
        rx="26"
        fill="url(#riftBotChassis)"
        stroke="#00f5d4"
        strokeWidth="2"
      />

      {/* Futuristic Side Ear Pods */}
      <rect x="23" y="46" width="8" height="20" rx="4" fill="#0f172a" stroke="#00f5d4" strokeWidth="1.5" />
      <rect x="89" y="46" width="8" height="20" rx="4" fill="#0f172a" stroke="#00f5d4" strokeWidth="1.5" />

      {/* Dark Curved Visor Glass */}
      <rect
        x="36"
        y="40"
        width="48"
        height="32"
        rx="14"
        fill="url(#riftBotVisor)"
        stroke="rgba(0, 245, 212, 0.4)"
        strokeWidth="1.2"
      />

      {/* Visor Glass Arc Reflection */}
      <path
        d="M 40 44 Q 60 48 80 44"
        stroke="rgba(255, 255, 255, 0.3)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Animated Visor Eyes (Happy glowing cyan arcs ^ _ ^ with blink) */}
      <g className="rift-eyes-blink" filter="url(#rift-cyan-glow)">
        {/* Left Eye */}
        <path
          d="M 44 55 Q 50 49 56 55"
          stroke="#00f5d4"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        {/* Right Eye */}
        <path
          d="M 64 55 Q 70 49 76 55"
          stroke="#00f5d4"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
      </g>

      {/* Cute Visor Blush */}
      <circle cx="42" cy="62" r="2.5" fill="#f43f5e" opacity="0.6" filter="url(#rift-cyan-glow)" />
      <circle cx="78" cy="62" r="2.5" fill="#f43f5e" opacity="0.6" filter="url(#rift-cyan-glow)" />

      {/* Visor Laser Scan Beam */}
      <line
        x1="40"
        y1="56"
        x2="52"
        y2="56"
        stroke="#ffffff"
        strokeWidth="1"
        opacity="0.75"
        className="rift-visor-scanner"
      />

      {/* Chest Cyber Core Badge */}
      <polygon
        points="60,74 65,81 55,81"
        fill="#00f5d4"
        filter="url(#rift-cyan-glow)"
        className="rift-core-pulse"
      />
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   MASCOT 2: Cyber Astro-Cat (Cosmic Feline Assistant)
   ══════════════════════════════════════════════════════════════════════ */
function CyberAstroCatSvg({ size = 96 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="rift-mascot-float"
      style={{ overflow: "visible" }}
    >
      <defs>
        <filter id="cat-cyan-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <linearGradient id="catHelmetGlass" x1="30" y1="20" x2="90" y2="85" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0b1b2d" />
          <stop offset="50%" stopColor="#040d18" />
          <stop offset="100%" stopColor="#02050b" />
        </linearGradient>
      </defs>

      {/* Floating Stardust / Orbitals */}
      <circle cx="22" cy="35" r="2" fill="#00f5d4" filter="url(#cat-cyan-glow)" className="rift-stardust-1" />
      <circle cx="98" cy="42" r="2.5" fill="#f472b6" filter="url(#cat-cyan-glow)" className="rift-stardust-2" />
      <circle cx="26" cy="85" r="1.8" fill="#c084fc" filter="url(#cat-cyan-glow)" />
      <circle cx="94" cy="88" r="2" fill="#00f5d4" filter="url(#cat-cyan-glow)" />

      {/* Cat Cyber Ears on Helmet */}
      {/* Left Ear */}
      <g className="rift-cat-ear-left">
        <polygon
          points="32,32 46,14 52,34"
          fill="#0f172a"
          stroke="#00f5d4"
          strokeWidth="2"
        />
        <polygon points="36,30 46,19 50,31" fill="#c084fc" opacity="0.8" filter="url(#cat-cyan-glow)" />
      </g>

      {/* Right Ear */}
      <g className="rift-cat-ear-right">
        <polygon
          points="88,32 74,14 68,34"
          fill="#0f172a"
          stroke="#00f5d4"
          strokeWidth="2"
        />
        <polygon points="84,30 74,19 70,31" fill="#c084fc" opacity="0.8" filter="url(#cat-cyan-glow)" />
      </g>

      {/* Helmet Outer Sphere */}
      <circle
        cx="60"
        cy="56"
        r="36"
        fill="url(#catHelmetGlass)"
        stroke="#00f5d4"
        strokeWidth="2"
        filter="url(#cat-cyan-glow)"
      />

      {/* Helmet Glass Curved Sheen */}
      <path
        d="M 36 44 A 28 28 0 0 1 84 44"
        stroke="rgba(255, 255, 255, 0.45)"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Kitten Face inside helmet */}
      {/* Big Cute Anime Kitten Eyes */}
      <g className="rift-eyes-blink">
        {/* Left Eye */}
        <circle cx="48" cy="54" r="7" fill="#0f172a" stroke="#00f5d4" strokeWidth="1.5" />
        <circle cx="48" cy="54" r="5" fill="#00f5d4" filter="url(#cat-cyan-glow)" />
        <circle cx="46" cy="52" r="2" fill="#ffffff" />
        <circle cx="50" cy="56" r="1" fill="#ffffff" />

        {/* Right Eye */}
        <circle cx="72" cy="54" r="7" fill="#0f172a" stroke="#00f5d4" strokeWidth="1.5" />
        <circle cx="72" cy="54" r="5" fill="#00f5d4" filter="url(#cat-cyan-glow)" />
        <circle cx="70" cy="52" r="2" fill="#ffffff" />
        <circle cx="74" cy="56" r="1" fill="#ffffff" />
      </g>

      {/* Kitten Cute Nose & Mouth */}
      <polygon points="60,61 58,59 62,59" fill="#f472b6" />
      <path
        d="M 56 64 Q 60 67 60 64 Q 60 67 64 64"
        stroke="#00f5d4"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Cute Cheek Blush */}
      <ellipse cx="42" cy="62" rx="3.5" ry="2" fill="#fb7185" opacity="0.75" />
      <ellipse cx="78" cy="62" rx="3.5" ry="2" fill="#fb7185" opacity="0.75" />

      {/* Holographic Digital Whiskers */}
      <line x1="38" y1="58" x2="26" y2="55" stroke="#00f5d4" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
      <line x1="38" y1="62" x2="25" y2="64" stroke="#00f5d4" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
      <line x1="82" y1="58" x2="94" y2="55" stroke="#00f5d4" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
      <line x1="82" y1="62" x2="95" y2="64" stroke="#00f5d4" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />

      {/* Space Collar */}
      <rect x="42" y="88" width="36" height="8" rx="4" fill="#0f172a" stroke="#00f5d4" strokeWidth="1.5" />
      <circle cx="60" cy="92" r="2.5" fill="#00f5d4" filter="url(#cat-cyan-glow)" />

      {/* Cute Kitten Waving Paw */}
      <g className="rift-cat-paw-wave">
        <ellipse cx="88" cy="80" rx="7" ry="6" fill="#0f172a" stroke="#00f5d4" strokeWidth="1.5" />
        <circle cx="86" cy="78" r="1.5" fill="#f472b6" />
        <circle cx="89" cy="77" r="1.5" fill="#f472b6" />
        <circle cx="91" cy="79" r="1.5" fill="#f472b6" />
        <ellipse cx="88" cy="82" rx="2.5" ry="1.8" fill="#f472b6" />
      </g>
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   MASCOT 3: Chibi Cyber-Scholar (AI Knowledge Specialist)
   ══════════════════════════════════════════════════════════════════════ */
function ChibiCyberScholarSvg({ size = 96 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="rift-mascot-float"
      style={{ overflow: "visible" }}
    >
      <defs>
        <filter id="scholar-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <linearGradient id="scholarCoat" x1="40" y1="65" x2="80" y2="105" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#090d16" />
        </linearGradient>
      </defs>

      {/* Floating Holographic Blueprint / Tablet */}
      <g className="rift-holo-tablet">
        <rect
          x="66"
          y="62"
          width="36"
          height="28"
          rx="4"
          fill="rgba(0, 245, 212, 0.12)"
          stroke="#00f5d4"
          strokeWidth="1.5"
          transform="rotate(8 84 76)"
          filter="url(#scholar-glow)"
        />
        {/* Hologram Code Lines / Math Symbols */}
        <line x1="72" y1="68" x2="86" y2="68" stroke="#00f5d4" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="72" y1="73" x2="94" y2="73" stroke="#38bdf8" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="72" y1="78" x2="82" y2="78" stroke="#c084fc" strokeWidth="1.2" strokeLinecap="round" />
        {/* Tiny sum symbol */}
        <text x="88" y="85" fill="#00f5d4" fontSize="8" fontFamily="monospace" fontWeight="bold">∑</text>
      </g>

      {/* Cyber Cape / High-Collar Coat */}
      <path
        d="M 36 68 L 30 96 L 60 92 L 90 96 L 84 68 Z"
        fill="url(#scholarCoat)"
        stroke="#00f5d4"
        strokeWidth="1.5"
      />
      <line x1="60" y1="68" x2="60" y2="92" stroke="#00f5d4" strokeWidth="1.5" strokeDasharray="3 3" />

      {/* Chibi Head / Face */}
      <circle cx="60" cy="46" r="24" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />

      {/* Cute Anime Hair with Cyber Strands */}
      <path
        d="M 38 42 C 40 24, 80 24, 82 42 C 84 32, 60 20, 38 42 Z"
        fill="#0f172a"
      />
      {/* Hair Bangs & Cyan Cyber Accent Highlights */}
      <path d="M 44 32 L 48 44 L 54 34 L 60 46 L 66 34 L 72 44 L 76 32" stroke="#00f5d4" strokeWidth="1.8" fill="#0f172a" />

      {/* Oversized Glowing Cyber Goggles (Pushed slightly up or on eyes) */}
      <g filter="url(#scholar-glow)">
        {/* Goggle Strap */}
        <rect x="34" y="38" width="52" height="4" rx="2" fill="#00f5d4" opacity="0.6" />
        {/* Left Lens */}
        <rect x="38" y="34" width="18" height="15" rx="5" fill="#02141a" stroke="#00f5d4" strokeWidth="2" />
        <line x1="42" y1="39" x2="52" y2="39" stroke="#00f5d4" strokeWidth="1.5" />
        <line x1="42" y1="43" x2="48" y2="43" stroke="#00f5d4" strokeWidth="1.5" />

        {/* Right Lens (HUD Eye Display) */}
        <rect x="64" y="34" width="18" height="15" rx="5" fill="#02141a" stroke="#c084fc" strokeWidth="2" />
        <circle cx="73" cy="41" r="3.5" stroke="#c084fc" strokeWidth="1.2" />
        <line x1="73" y1="36" x2="73" y2="46" stroke="#c084fc" strokeWidth="1" strokeDasharray="1 2" />
      </g>

      {/* Cute Cheeks */}
      <circle cx="44" cy="54" r="2.5" fill="#f43f5e" opacity="0.65" />
      <circle cx="76" cy="54" r="2.5" fill="#f43f5e" opacity="0.65" />

      {/* Cute Determined Mouth (•̀ᴗ•́) */}
      <path d="M 57 56 Q 60 59 63 56" stroke="#f8fafc" strokeWidth="1.5" strokeLinecap="round" fill="none" />

      {/* Floating Knowledge Sparkles */}
      <polygon points="26,48 29,42 32,48 29,54" fill="#00f5d4" filter="url(#scholar-glow)" className="rift-stardust-1" />
      <polygon points="94,36 96,32 98,36 96,40" fill="#c084fc" filter="url(#scholar-glow)" className="rift-stardust-2" />
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   MASCOT 4: Retro 8-Bit Matrix Mascot (Cyber Matrix Critter)
   ══════════════════════════════════════════════════════════════════════ */
function RetroPixelMascotSvg({ size = 96 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="rift-mascot-pixel-bounce"
      style={{ overflow: "visible", shapeRendering: "crispEdges" }}
    >
      <defs>
        <filter id="pixel-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Pixel Antenna Crown */}
      <rect x="57" y="16" width="6" height="6" fill="#00f5d4" filter="url(#pixel-glow)" />
      <rect x="57" y="22" width="6" height="6" fill="#0f172a" stroke="#00f5d4" strokeWidth="1" />

      {/* Main 8-Bit Pixel Body */}
      {/* Row 1 */}
      <rect x="42" y="28" width="36" height="6" fill="#0f172a" stroke="#00f5d4" strokeWidth="1.2" />
      {/* Row 2 */}
      <rect x="36" y="34" width="48" height="6" fill="#00f5d4" opacity="0.2" />
      {/* Row 3 - 8 */}
      <rect x="30" y="40" width="60" height="36" fill="#090d16" stroke="#00f5d4" strokeWidth="1.5" />

      {/* Floating 8-Bit Bits around */}
      <rect x="18" y="42" width="5" height="5" fill="#00f5d4" filter="url(#pixel-glow)" />
      <rect x="22" y="66" width="4" height="4" fill="#c084fc" />
      <rect x="96" y="38" width="5" height="5" fill="#38bdf8" />
      <rect x="94" y="62" width="6" height="6" fill="#00f5d4" filter="url(#pixel-glow)" />

      {/* Pixel Eyes (Animated Blink) */}
      <g className="rift-pixel-eyes" filter="url(#pixel-glow)">
        {/* Left Eye */}
        <rect x="42" y="48" width="8" height="12" fill="#00f5d4" />
        <rect x="44" y="50" width="4" height="4" fill="#ffffff" />

        {/* Right Eye */}
        <rect x="70" y="48" width="8" height="12" fill="#00f5d4" />
        <rect x="72" y="50" width="4" height="4" fill="#ffffff" />
      </g>

      {/* Pixel Blush */}
      <rect x="36" y="64" width="6" height="4" fill="#f43f5e" opacity="0.8" />
      <rect x="78" y="64" width="6" height="4" fill="#f43f5e" opacity="0.8" />

      {/* Pixel Cute Mouth */}
      <rect x="54" y="64" width="12" height="4" fill="#00f5d4" />

      {/* Pixel Feet (Cute Tentacles / Legs) */}
      <rect x="34" y="78" width="8" height="8" fill="#00f5d4" />
      <rect x="48" y="78" width="8" height="8" fill="#00f5d4" />
      <rect x="64" y="78" width="8" height="8" fill="#00f5d4" />
      <rect x="78" y="78" width="8" height="8" fill="#00f5d4" />

      {/* Retro scanline grid */}
      <line x1="30" y1="46" x2="90" y2="46" stroke="rgba(0, 245, 212, 0.15)" strokeWidth="1" />
      <line x1="30" y1="58" x2="90" y2="58" stroke="rgba(0, 245, 212, 0.15)" strokeWidth="1" />
      <line x1="30" y1="70" x2="90" y2="70" stroke="rgba(0, 245, 212, 0.15)" strokeWidth="1" />
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT: CyberMascotLoader
   ══════════════════════════════════════════════════════════════════════ */
export function CyberMascotLoader({
  title,
  subtitle,
  size = "md",
  initialMascotIndex,
  mode = "general",
  isSpeaking = false,
  audioEnergy = 0.5,
  showStatusTicker = true,
  showSwitchButton = true,
  className = "",
  style = {},
}: CyberMascotLoaderProps) {
  // Deterministic mascot index for SSR to prevent hydration mismatch; randomized on client
  const [mascotIndex, setMascotIndex] = useState<number>(() => {
    if (typeof initialMascotIndex === "number") {
      return (initialMascotIndex % MASCOT_ROSTER.length + MASCOT_ROSTER.length) % MASCOT_ROSTER.length;
    }
    return 0;
  });

  // Randomize companion on the client after initial hydration
  useEffect(() => {
    if (typeof initialMascotIndex !== "number") {
      setMascotIndex(Math.floor(Math.random() * MASCOT_ROSTER.length));
    }
  }, [initialMascotIndex]);

  // Context-aware dynamic sci-fi & RAG status line rotator
  const activeStatuses = RAG_PIPELINE_STATUSES[mode] || DEFAULT_SCI_FI_STATUSES;
  const [statusIndex, setStatusIndex] = useState<number>(0);

  useEffect(() => {
    if (!showStatusTicker) return;
    const interval = setInterval(() => {
      setStatusIndex((prev) => (prev + 1) % activeStatuses.length);
    }, 2600);
    return () => clearInterval(interval);
  }, [showStatusTicker, activeStatuses.length]);

  const currentMascot = MASCOT_ROSTER[mascotIndex];

  const handleNextMascot = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setMascotIndex((prev) => (prev + 1) % MASCOT_ROSTER.length);
  };

  // Dimensions based on size
  const mascotPixelSize =
    size === "lg" ? 116 : size === "md" ? 84 : size === "sm" ? 58 : size === "avatar" ? 48 : 34;

  const renderMascotSvg = () => {
    switch (currentMascot.id) {
      case "cyber-neko":
        return (
          <CyberNekoSvg
            size={mascotPixelSize}
            mode={mode}
            isSpeaking={isSpeaking}
            audioEnergy={audioEnergy}
          />
        );
      case "rift-bot":
        return <RiftBotSvg size={mascotPixelSize} />;
      case "astro-cat":
        return <CyberAstroCatSvg size={mascotPixelSize} />;
      case "chibi-scholar":
        return <ChibiCyberScholarSvg size={mascotPixelSize} />;
      case "pixel-mascot":
        return <RetroPixelMascotSvg size={mascotPixelSize} />;
      default:
        return (
          <CyberNekoSvg
            size={mascotPixelSize}
            mode={mode}
            isSpeaking={isSpeaking}
            audioEnergy={audioEnergy}
          />
        );
    }
  };

  // Pure mascot avatar (e.g. inside circular button or compact indicator)
  if (size === "avatar") {
    return (
      <div
        className={`cyber-mascot-avatar flex items-center justify-center cursor-pointer ${className}`}
        style={style}
        onClick={handleNextMascot}
        title={`Companion: ${currentMascot.name} (Click to switch)`}
      >
        {renderMascotSvg()}
      </div>
    );
  }

  // Compact inline variant (e.g. inside a small alert or inline status row)
  if (size === "inline") {
    return (
      <div
        className={`cyber-mascot-inline flex items-center gap-3 px-3 py-1.5 rounded-lg border border-[#00f5d4]/20 bg-[#060c18]/80 text-xs text-[#94a3b8] ${className}`}
        style={style}
      >
        <div className="flex-shrink-0 cursor-pointer" onClick={handleNextMascot} title="Click to cycle companion">
          {renderMascotSvg()}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-[#f0fdfa] flex items-center gap-1.5 text-xs">
            <Sparkles size={11} className="text-[#00f5d4]" />
            {title || currentMascot.name}
          </span>
          <span className="text-[11px] text-[#00f5d4]/80 font-mono truncate">
            {subtitle || activeStatuses[statusIndex % activeStatuses.length]}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`cyber-mascot-hud-card relative select-none flex flex-col items-center justify-center text-center ${className}`}
      style={{
        padding: size === "lg" ? "32px 28px" : size === "md" ? "24px 20px" : "16px 14px",
        borderRadius: "20px",
        background: "radial-gradient(ellipse at 50% 30%, rgba(6, 24, 38, 0.75), rgba(3, 8, 18, 0.85))",
        border: "1px solid rgba(0, 245, 212, 0.22)",
        boxShadow: "0 12px 36px -8px rgba(0, 0, 0, 0.6), 0 0 24px rgba(0, 245, 212, 0.08)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        maxWidth: size === "lg" ? "440px" : size === "md" ? "360px" : "280px",
        width: "100%",
        margin: "0 auto",
        ...style,
      }}
    >
      {/* Embedded High-Performance CSS Animations */}
      <style>{`
        @keyframes riftMascotFloat {
          0%, 100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-8px) rotate(1deg);
          }
        }
        .rift-mascot-float {
          animation: riftMascotFloat 3s ease-in-out infinite;
        }

        /* ── CYBER NEKO SIGNATURE ANIMATIONS ── */
        @keyframes riftNekoFloatAnim {
          0%, 100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-7px) rotate(1.2deg);
          }
        }
        .rift-neko-float {
          animation: riftNekoFloatAnim 3.2s ease-in-out infinite;
          transform-origin: 80px 72px;
        }

        @keyframes riftNekoTailSwishAnim {
          0%, 100% {
            transform: rotate(0deg);
          }
          50% {
            transform: rotate(-16deg) translate(-2px, -3px);
          }
        }
        .rift-neko-tail {
          transform-origin: 44px 98px;
          animation: riftNekoTailSwishAnim 2.4s ease-in-out infinite;
        }

        @keyframes riftNekoWhiskerPulseAnim {
          0%, 100% { transform: scaleX(1); opacity: 0.8; }
          50% { transform: scaleX(1.22); opacity: 1; }
        }
        .rift-neko-whiskers-left {
          transform-origin: 48px 75px;
          animation: riftNekoWhiskerPulseAnim 1.4s ease-in-out infinite;
        }
        .rift-neko-whiskers-right {
          transform-origin: 112px 75px;
          animation: riftNekoWhiskerPulseAnim 1.4s ease-in-out infinite 0.2s;
        }

        @keyframes riftNekoEarTwitchLeftAnim {
          0%, 82%, 100% { transform: rotate(0deg); }
          86% { transform: rotate(-7deg); }
          90% { transform: rotate(3deg); }
        }
        .rift-neko-ear-l {
          transform-origin: 46px 44px;
          animation: riftNekoEarTwitchLeftAnim 4.6s ease-in-out infinite;
        }

        @keyframes riftNekoEarTwitchRightAnim {
          0%, 82%, 100% { transform: rotate(0deg); }
          88% { transform: rotate(7deg); }
          92% { transform: rotate(-3deg); }
        }
        .rift-neko-ear-r {
          transform-origin: 114px 44px;
          animation: riftNekoEarTwitchRightAnim 4.6s ease-in-out infinite 0.3s;
        }

        @keyframes riftHeadphonePulseAnim {
          0%, 100% { filter: drop-shadow(0 0 3px #00f5d4); opacity: 0.9; }
          50% { filter: drop-shadow(0 0 10px #00f5d4); opacity: 1; }
        }
        .rift-headphone-glow {
          animation: riftHeadphonePulseAnim 1.8s ease-in-out infinite;
        }

        @keyframes riftNekoSoundWaveLeftAnim {
          0% { transform: scale(0.6) translateX(0); opacity: 0.9; }
          100% { transform: scale(1.4) translateX(-10px); opacity: 0; }
        }
        .rift-soundwave-left-1 {
          transform-origin: 26px 65px;
          animation: riftNekoSoundWaveLeftAnim 1.8s cubic-bezier(0.2, 0.8, 0.4, 1) infinite;
        }
        .rift-soundwave-left-2 {
          transform-origin: 26px 65px;
          animation: riftNekoSoundWaveLeftAnim 1.8s cubic-bezier(0.2, 0.8, 0.4, 1) 0.7s infinite;
        }

        @keyframes riftNekoSoundWaveRightAnim {
          0% { transform: scale(0.6) translateX(0); opacity: 0.9; }
          100% { transform: scale(1.4) translateX(10px); opacity: 0; }
        }
        .rift-soundwave-right-1 {
          transform-origin: 126px 65px;
          animation: riftNekoSoundWaveRightAnim 1.8s cubic-bezier(0.2, 0.8, 0.4, 1) infinite;
        }
        .rift-soundwave-right-2 {
          transform-origin: 126px 65px;
          animation: riftNekoSoundWaveRightAnim 1.8s cubic-bezier(0.2, 0.8, 0.4, 1) 0.7s infinite;
        }

        @keyframes riftNekoMouthTalkAnim {
          0%, 100% { transform: scaleY(0.4); opacity: 0.6; }
          50% { transform: scaleY(1.3); opacity: 1; }
        }
        .rift-neko-mouth-talking {
          transform-origin: 80px 84px;
          animation: riftNekoMouthTalkAnim 0.35s ease-in-out infinite;
        }

        @keyframes riftVectorCubeOrbit1Anim {
          0%, 100% { transform: translate(0px, 0px) rotate(0deg); }
          50% { transform: translate(-6px, -8px) rotate(16deg); }
        }
        .rift-vector-cube-1 {
          animation: riftVectorCubeOrbit1Anim 3.4s ease-in-out infinite;
        }

        @keyframes riftVectorCubeOrbit2Anim {
          0%, 100% { transform: translate(0px, 0px) rotate(0deg); }
          50% { transform: translate(8px, 6px) rotate(-14deg); }
        }
        .rift-vector-cube-2 {
          animation: riftVectorCubeOrbit2Anim 4s ease-in-out infinite 0.4s;
        }

        @keyframes riftPixelBounce {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-6px);
          }
        }
        .rift-mascot-pixel-bounce {
          animation: riftPixelBounce 1.2s steps(4) infinite;
        }

        @keyframes riftEyesBlink {
          0%, 88%, 94%, 100% {
            opacity: 1;
            transform: scaleY(1);
          }
          90%, 92% {
            opacity: 0.15;
            transform: scaleY(0.1);
          }
        }
        .rift-eyes-blink {
          transform-origin: 80px 64px;
          animation: riftEyesBlink 4.2s infinite;
        }

        @keyframes riftPulseRingAnim {
          0% {
            transform: scale(0.7);
            opacity: 0.8;
          }
          100% {
            transform: scale(1.5);
            opacity: 0;
          }
        }
        .rift-pulse-ring-1 {
          transform-origin: 60px 104px;
          animation: riftPulseRingAnim 2s cubic-bezier(0.2, 0.8, 0.4, 1) infinite;
        }
        .rift-pulse-ring-2 {
          transform-origin: 60px 104px;
          animation: riftPulseRingAnim 2s cubic-bezier(0.2, 0.8, 0.4, 1) 1s infinite;
        }

        @keyframes riftThrusterFlicker {
          0%, 100% { opacity: 0.9; transform: scaleY(1); }
          50% { opacity: 0.6; transform: scaleY(0.85); }
        }
        .rift-thruster-flicker {
          transform-origin: 60px 88px;
          animation: riftThrusterFlicker 0.4s ease-in-out infinite;
        }

        @keyframes riftVisorScan {
          0%, 100% { transform: translateX(0); opacity: 0.2; }
          50% { transform: translateX(20px); opacity: 0.85; }
        }
        .rift-visor-scanner {
          animation: riftVisorScan 1.8s ease-in-out infinite;
        }

        @keyframes riftCorePulse {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.15); opacity: 0.4; }
        }
        .rift-core-pulse {
          transform-origin: 60px 78px;
          animation: riftCorePulse 1.6s ease-in-out infinite;
        }

        @keyframes riftCatPawWaveAnim {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(-16deg); }
        }
        .rift-cat-paw-wave {
          transform-origin: 88px 84px;
          animation: riftCatPawWaveAnim 1.6s ease-in-out infinite;
        }

        @keyframes riftEarTwitchLeft {
          0%, 82%, 100% { transform: rotate(0deg); }
          86% { transform: rotate(-8deg); }
          90% { transform: rotate(4deg); }
        }
        .rift-cat-ear-left {
          transform-origin: 46px 34px;
          animation: riftEarTwitchLeft 4.5s ease-in-out infinite;
        }

        @keyframes riftEarTwitchRight {
          0%, 82%, 100% { transform: rotate(0deg); }
          88% { transform: rotate(8deg); }
          92% { transform: rotate(-4deg); }
        }
        .rift-cat-ear-right {
          transform-origin: 74px 34px;
          animation: riftEarTwitchRight 4.5s ease-in-out infinite;
        }

        @keyframes riftStardustFloat {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-4px); opacity: 0.9; }
        }
        .rift-stardust-1 { animation: riftStardustFloat 2.2s ease-in-out infinite; }
        .rift-stardust-2 { animation: riftStardustFloat 2.8s ease-in-out infinite 0.7s; }

        @keyframes riftStatusTickerFade {
          0% { opacity: 0; transform: translateY(3px); }
          12% { opacity: 1; transform: translateY(0); }
          88% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-3px); }
        }
        .rift-status-ticker {
          animation: riftStatusTickerFade 2.6s ease-in-out infinite;
        }
      `}</style>

      {/* Cybernetic HUD Corner Brackets */}
      <div className="absolute top-2 left-2 text-[#00f5d4]/40 font-mono text-[9px] pointer-events-none">⌜</div>
      <div className="absolute top-2 right-2 text-[#00f5d4]/40 font-mono text-[9px] pointer-events-none">⌝</div>
      <div className="absolute bottom-2 left-2 text-[#00f5d4]/40 font-mono text-[9px] pointer-events-none">⌞</div>
      <div className="absolute bottom-2 right-2 text-[#00f5d4]/40 font-mono text-[9px] pointer-events-none">⌟</div>

      {/* Interactive Mascot Stage */}
      <div
        className="relative group cursor-pointer transition-transform duration-200 hover:scale-105 active:scale-95 flex items-center justify-center"
        onClick={handleNextMascot}
        title="Click to switch mascot companion"
      >
        {/* Soft Ambient Neon Aura behind Mascot */}
        <div
          className="absolute inset-0 rounded-full blur-xl pointer-events-none opacity-40 transition-opacity group-hover:opacity-75"
          style={{
            background:
              mascotIndex % 2 === 0
                ? "radial-gradient(circle, #00f5d4 0%, transparent 70%)"
                : "radial-gradient(circle, #c084fc 0%, transparent 70%)",
          }}
        />

        {/* Mascot SVG */}
        <div className="relative z-10">{renderMascotSvg()}</div>
      </div>

      {/* Mascot Companion Badge & Switcher */}
      {showSwitchButton && (
        <button
          type="button"
          onClick={handleNextMascot}
          className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono text-[#00f5d4] bg-[#00f5d4]/10 border border-[#00f5d4]/25 hover:bg-[#00f5d4]/20 hover:border-[#00f5d4]/50 transition-colors"
          title="Click to summon another companion"
        >
          <Bot size={11} className="text-[#00f5d4]" />
          <span>{currentMascot.name}</span>
          <RefreshCw size={9} className="text-[#00f5d4]/60 ml-0.5 group-hover:rotate-180 transition-transform" />
        </button>
      )}

      {/* Primary Title */}
      <div className="mt-3 flex items-center justify-center gap-1.5">
        <Sparkles size={size === "lg" ? 16 : 14} className="text-[#00f5d4] flex-shrink-0 animate-pulse" />
        <h3
          style={{
            fontSize: size === "lg" ? "15px" : size === "md" ? "13px" : "12px",
            fontWeight: 600,
            color: "#f0fdfa",
            margin: 0,
            letterSpacing: "0.01em",
          }}
        >
          {title || "Processing Request…"}
        </h3>
      </div>

      {/* Subtitle / Description */}
      {subtitle ? (
        <p
          style={{
            fontSize: size === "lg" ? "12px" : "11px",
            color: "#94a3b8",
            marginTop: "4px",
            marginBottom: "0px",
            maxWidth: "300px",
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </p>
      ) : null}

      {/* Dynamic Sci-Fi Status Ticker */}
      {showStatusTicker && (
        <div
          className="mt-2.5 flex items-center justify-center gap-1.5 text-[11px] font-mono text-[#00f5d4]/85 bg-[#00f5d4]/5 border border-[#00f5d4]/15 rounded-md px-3 py-1 w-full max-w-[320px]"
          style={{ minHeight: "26px" }}
        >
          <Zap size={10} className="text-[#00f5d4] flex-shrink-0 animate-pulse" />
          <span key={statusIndex} className="rift-status-ticker truncate">
            {DEFAULT_SCI_FI_STATUSES[statusIndex]}
          </span>
        </div>
      )}
    </div>
  );
}

export default CyberMascotLoader;
