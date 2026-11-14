import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileText, Sparkles, Mic, MicOff, Volume2, Play, Pause, Code2,
  Check, Copy, RefreshCw, Sliders, BookOpen, Cpu, Layers,
  Wand2, Search, Database, MessageSquareQuote, ShieldCheck, Zap
} from 'lucide-react';

// ============================================================================
// WITTY RAG BUFFER MESSAGES & PRESET CITATIONS
// ============================================================================
const RAG_STATUS_MESSAGES = {
  parsing: [
    "Unrolling ancient PDF scrolls & extracting crisp text layers...",
    "Scanning tables, footnotes, and tiny margins at 120 pages/sec...",
    "Ironing out crinkled PDF pages & decoding fonts..."
  ],
  embedding: [
    "Chopping bulky chapters into bite-sized 512-token kibble chunks...",
    "Polishing high-dimensional vector cubes for cosine similarity...",
    "Sniffing out page 42 & indexing semantic embeddings into Vector DB...",
    "Turning dense paragraphs into glowing knowledge crystals..."
  ],
  listening: [
    "Ears perked! Listening for your question about the document...",
    "Capturing voice frequencies & matching intent to PDF sections..."
  ],
  dictating: [
    "Dictating verified answer with exact page & section citations!"
  ]
};

const MASCOT_PROFILES = [
  {
    id: 'owl',
    name: 'Professor Hoot',
    role: 'Scholarly PDF Archivist Owl',
    badge: 'Best for Academic & Legal RAG',
    desc: 'Wears round brass spectacles and a miniature scholar cap. Flips glowing PDF pages with his wings and hoots word-by-word with precision.'
  },
  {
    id: 'shiba',
    name: 'Inspector Shiba',
    role: 'Semantic Vector Detective Doge',
    badge: 'Best for Search & Discovery RAG',
    desc: 'Sniffs through floating PDF chunks with a glowing magnifying glass, wags his tail during vector indexing, and barks out cited insights.'
  },
  {
    id: 'cat',
    name: 'Cyber Neko',
    role: 'Neon Synth Audio Dictator Cat',
    badge: 'Best for Modern SaaS & Voice AI',
    desc: 'Rocks low-latency studio headphones atop a stack of PDFs. Ear tips and whiskers pulse directly to FFT voice waveforms.'
  }
];

const COLOR_THEMES = [
  { name: 'Indigo Dictator', primary: '#6366f1', secondary: '#a855f7', accent: '#38bdf8', glow: 'rgba(99, 102, 241, 0.45)' },
  { name: 'Emerald Scholar', primary: '#10b981', secondary: '#059669', accent: '#34d399', glow: 'rgba(16, 185, 129, 0.45)' },
  { name: 'Amber Shiba', primary: '#f59e0b', secondary: '#ea580c', accent: '#fbbf24', glow: 'rgba(245, 158, 11, 0.45)' },
  { name: 'Cyber Rose', primary: '#ec4899', secondary: '#8b5cf6', accent: '#f472b6', glow: 'rgba(236, 72, 153, 0.45)' }
];

// ============================================================================
// STANDALONE DROP-IN CODE GENERATOR FOR EXPORT TAB
// ============================================================================
const generateExportCode = (mascotId, theme) => `import React, { useState, useEffect } from 'react';

/**
 * PDF Dictator RAG - Cute Mascot Buffer & Voice Dictation Component
 * Mascot Preset: ${mascotId.toUpperCase()} | Primary Accent: ${theme.primary}
 * States: 'parsing' | 'embedding' | 'listening' | 'dictating'
 */
export function PdfDictatorMascot({ 
  state = 'embedding', 
  audioEnergy = 0.65, 
  fileName = 'Research_Paper.pdf',
  citation = 'Page 14, Section 3.2',
  statusText = 'Chunking PDF & indexing vectors...'
}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let raf;
    const loop = () => {
      setTick(t => t + 0.06);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const bounceY = Math.sin(tick * (state === 'embedding' ? 2.4 : 1.4)) * 6;
  const mouthOpen = state === 'dictating' ? Math.max(2, Math.abs(Math.sin(tick * 3.5)) * 14 * audioEnergy) : 2;
  const earAngle = state === 'listening' ? Math.sin(tick * 2.5) * 10 : Math.sin(tick) * 3;

  return (
    <div className="relative flex flex-col items-center justify-center p-6 rounded-3xl bg-slate-950 border border-slate-800 text-white shadow-2xl overflow-hidden">
      {/* Ambient Aura */}
      <div 
        className="absolute w-56 h-56 rounded-full blur-3xl pointer-events-none transition-all duration-300"
        style={{ 
          background: '${theme.glow}',
          transform: \`scale(\${1 + audioEnergy * 0.45})\`
        }}
      />

      {/* Floating RAG Vector Cubes & PDF Pages */}
      <svg viewBox="0 0 320 260" className="w-72 h-60 relative z-10 overflow-visible">
        {/* Voice & Buffer Ripple Rings */}
        <circle
          cx="160" cy="130"
          r={78 + Math.sin(tick * 2) * 6 + audioEnergy * 18}
          fill="none"
          stroke="${theme.primary}"
          strokeWidth="2"
          strokeDasharray={state === 'embedding' ? "8 6" : "none"}
          opacity="0.45"
        />

        {/* Orbiting Vector Cubes during Chunking/Embedding */}
        {state === 'embedding' && [0, 1, 2, 3].map((i) => {
          const angle = tick * 0.9 + (i * Math.PI) / 2;
          const ox = 160 + Math.cos(angle) * 88;
          const oy = 125 + Math.sin(angle) * 38;
          return (
            <g key={i} transform={\`translate(\${ox}, \${oy})\`}>
              <rect x="-10" y="-10" width="20" height="20" rx="5" fill="${theme.primary}" opacity="0.85" />
              <text x="0" y="3" fontSize="8" fill="#fff" textAnchor="middle" fontFamily="monospace">[v]</text>
            </g>
          );
        })}

        {/* Animated Mascot Body */}
        <g transform={\`translate(160, \${135 + bounceY})\`}>
          {/* Body / Head */}
          <circle cx="0" cy="0" r="46" fill="#1e293b" stroke="${theme.primary}" strokeWidth="3.5" />
          {/* Perky Ears */}
          <polygon points="-38,-26 -18,-44 -28,-64" fill="${theme.primary}" transform={\`rotate(\${-earAngle})\`} />
          <polygon points="38,-26 18,-44 28,-64" fill="${theme.primary}" transform={\`rotate(\${earAngle})\`} />
          {/* Expressive Eyes */}
          <circle cx="-16" cy="-6" r="6" fill="#fff" />
          <circle cx="16" cy="-6" r="6" fill="#fff" />
          {/* Synchronized Speaking Beak / Mouth */}
          <rect x="-10" y="8" width="20" height={4 + mouthOpen} rx="5" fill="${theme.accent}" />
        </g>
      </svg>

      {/* Status & Citation Pill */}
      <div className="relative z-10 text-center mt-2">
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 border border-indigo-500/40 text-indigo-300">
          {state.toUpperCase()} • {fileName}
        </span>
        <p className="text-sm text-slate-300 mt-2 font-medium">{statusText}</p>
        {state === 'dictating' && (
          <p className="text-xs text-emerald-400 mt-1">Cited Source: {citation}</p>
        )}
      </div>
    </div>
  );
}`;

// ============================================================================
// MAIN APPLICATION COMPONENT
// ============================================================================
export default function App() {
  // 1. Core RAG & Voice Pipeline State: 'parsing' | 'embedding' | 'listening' | 'dictating'
  const [ragState, setRagState] = useState('embedding');
  const [selectedMascot, setSelectedMascot] = useState('owl'); // 'owl' | 'shiba' | 'cat'
  const [themeIdx, setThemeIdx] = useState(0);
  const activeTheme = COLOR_THEMES[themeIdx];

  // 2. Auto Cycle & Speed Controls
  const [autoCycle, setAutoCycle] = useState(false);
  const [animSpeed, setAnimSpeed] = useState(1.0);
  const [bufferProgress, setBufferProgress] = useState(64);
  const [statusMessageIndex, setStatusMessageIndex] = useState(0);

  // 3. Document & Word-by-Word Dictation State
  const [pdfFileName, setPdfFileName] = useState('Neural_RAG_Architecture_v4.pdf');
  const [citationBadge, setCitationBadge] = useState('Page 18 • Section 4.2 (98.4% Match)');
  const [dictationScript, setDictationScript] = useState(
    "According to page eighteen of your PDF, the hybrid vector retriever combines dense embeddings with BM25 keyword scoring to eliminate hallucinations."
  );
  const [activeWordIdx, setActiveWordIdx] = useState(-1);

  // 4. Audio / Microphone & Browser TTS Controls
  const [useRealMic, setUseRealMic] = useState(false);
  const [micError, setMicError] = useState(null);
  const [simulatedVoiceLevel, setSimulatedVoiceLevel] = useState(0.75);
  const [useBrowserTTS, setUseBrowserTTS] = useState(false);

  // 5. UI Inspector Tabs
  const [rightTab, setRightTab] = useState('customizer'); // 'customizer' | 'export' | 'pipeline'
  const [copiedCode, setCopiedCode] = useState(false);

  // Animation Tick & Audio Energy for SVG + Canvas Hybrid Stage
  const [animTick, setAnimTick] = useState(0);
  const [liveEnergy, setLiveEnergy] = useState(0.35);

  const canvasRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const freqDataRef = useRef(null);
  const energyRef = useRef({ current: 0.3, target: 0.3, phase: 0 });

  const wordsArray = dictationScript.trim().split(/\s+/);

  // ============================================================================
  // AUTO RAG CYCLE DEMO LOOP (Parsing -> Embedding -> Listening -> Dictating)
  // ============================================================================
  useEffect(() => {
    if (!autoCycle) return;
    const sequence = ['parsing', 'embedding', 'listening', 'dictating'];
    const durations = { parsing: 4200, embedding: 5500, listening: 4200, dictating: 7500 };

    const timer = setTimeout(() => {
      const nextIdx = (sequence.indexOf(ragState) + 1) % sequence.length;
      setRagState(sequence[nextIdx]);
    }, durations[ragState]);

    return () => clearTimeout(timer);
  }, [autoCycle, ragState]);

  // Rotate witty RAG buffer status messages & progress bar
  useEffect(() => {
    const interval = setInterval(() => {
      const msgs = RAG_STATUS_MESSAGES[ragState] || RAG_STATUS_MESSAGES.embedding;
      setStatusMessageIndex((prev) => (prev + 1) % msgs.length);
      if (ragState === 'parsing' || ragState === 'embedding') {
        setBufferProgress((prev) => (prev >= 96 ? 18 : prev + Math.floor(Math.random() * 19 + 8)));
      } else {
        setBufferProgress(100);
      }
    }, 2400);
    return () => clearInterval(interval);
  }, [ragState]);

  // ============================================================================
  // REAL MICROPHONE WEB AUDIO API HANDLER
  // ============================================================================
  const handleToggleRealMic = async () => {
    if (useRealMic) {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      analyserRef.current = null;
      setUseRealMic(false);
      return;
    }

    try {
      setMicError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;
      source.connect(analyser);

      analyserRef.current = analyser;
      freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      setUseRealMic(true);
      setRagState('listening');
    } catch (e) {
      setMicError('Mic access unavailable in preview frame — using reactive simulated voice.');
      setUseRealMic(false);
      setRagState('listening');
    }
  };

  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // ============================================================================
  // WORD-BY-WORD DICTATION WAVEFORM & MOUTH SYNC
  // ============================================================================
  useEffect(() => {
    if (ragState !== 'dictating') {
      setActiveWordIdx(-1);
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      return;
    }

    let idx = 0;
    let wordTimer = null;
    let dipTimer = null;
    let cancelled = false;

    if (useBrowserTTS && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(dictationScript);
      utter.rate = 1.04;
      window.speechSynthesis.speak(utter);
    }

    const speakNextWord = () => {
      if (cancelled) return;
      if (idx >= wordsArray.length) {
        energyRef.current.target = 0.1;
        wordTimer = setTimeout(() => {
          if (!cancelled && ragState === 'dictating') {
            idx = 0;
            speakNextWord();
          }
        }, 1400);
        return;
      }

      const word = wordsArray[idx];
      setActiveWordIdx(idx);

      // Compute syllable energy peak so mascot beak/mouth and wave ring pulse per word
      const cleanLen = word.replace(/[^a-zA-Z]/g, '').length || 3;
      const wordPeak = Math.min(1.0, 0.45 + cleanLen * 0.065) * simulatedVoiceLevel;
      energyRef.current.target = wordPeak;

      const duration = Math.max(175, (165 + cleanLen * 30) / animSpeed);
      dipTimer = setTimeout(() => {
        if (!cancelled) energyRef.current.target = 0.12;
      }, duration * 0.62);

      idx++;
      wordTimer = setTimeout(speakNextWord, duration);
    };

    speakNextWord();

    return () => {
      cancelled = true;
      clearTimeout(wordTimer);
      clearTimeout(dipTimer);
    };
  }, [ragState, dictationScript, animSpeed, simulatedVoiceLevel, useBrowserTTS]);

  // ============================================================================
  // 60FPS HYBRID CANVAS BACKGROUND WAVE + SVG MASCOT DRIVER
  // ============================================================================
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let rafId;

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = parent.clientWidth * dpr;
      canvas.height = parent.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const renderFrame = (timestamp) => {
      const parent = canvas.parentElement;
      const width = parent ? parent.clientWidth : 520;
      const height = parent ? parent.clientHeight : 390;
      const cx = width / 2;
      const cy = height / 2;
      const st = energyRef.current;

      ctx.clearRect(0, 0, width, height);

      // Update Target Energy based on RAG state
      if (ragState === 'parsing') {
        st.target = 0.35 + Math.sin(timestamp * 0.006 * animSpeed) * 0.15;
      } else if (ragState === 'embedding') {
        st.target = 0.55 + Math.sin(timestamp * 0.009 * animSpeed) * 0.22;
      } else if (ragState === 'listening') {
        if (useRealMic && analyserRef.current && freqDataRef.current) {
          analyserRef.current.getByteFrequencyData(freqDataRef.current);
          let sum = 0;
          for (let i = 2; i < 36; i++) sum += freqDataRef.current[i];
          st.target = Math.min(1.1, (sum / 34 / 150) * simulatedVoiceLevel * 1.4);
        } else {
          const simWave =
            Math.sin(timestamp * 0.008) * 0.35 +
            Math.cos(timestamp * 0.019) * 0.35 +
            Math.sin(timestamp * 0.031) * 0.25;
          st.target = Math.max(0.12, (simWave + 0.55) * simulatedVoiceLevel);
        }
      }

      // Smooth spring interpolation
      st.current += (st.target - st.current) * 0.22;
      st.phase += (0.035 + st.current * 0.055) * animSpeed;

      setAnimTick(st.phase);
      setLiveEnergy(st.current);

      // 1. Draw Ambient Radial Glow behind Mascot
      const baseR = Math.min(width, height) * 0.29;
      const glowGrad = ctx.createRadialGradient(cx, cy, baseR * 0.2, cx, cy, baseR * (1.55 + st.current * 0.45));
      glowGrad.addColorStop(0, activeTheme.glow);
      glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR * 1.9, 0, Math.PI * 2);
      ctx.fill();

      // 2. Draw ChatGPT-Style Harmonic Audio Wave Ring around the Mascot
      const numPoints = 80;
      for (let layer = 0; layer < 2; layer++) {
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i <= numPoints; i++) {
          const angle = (i / numPoints) * Math.PI * 2;
          const waveAmp =
            ragState === 'dictating' || ragState === 'listening'
              ? st.current * 28
              : st.current * 12;
          const offset =
            Math.sin(angle * (layer === 0 ? 6 : 4) + st.phase * (layer === 0 ? 1.4 : -1.1)) * waveAmp +
            Math.cos(angle * 8 - st.phase * 1.8) * (waveAmp * 0.45);

          const r = baseR * (0.98 + layer * 0.1) + offset;
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = layer === 0 ? activeTheme.primary : activeTheme.accent;
        ctx.lineWidth = layer === 0 ? 2.5 : 1.5;
        ctx.globalAlpha = layer === 0 ? 0.65 : 0.35;
        if (ragState === 'embedding') {
          ctx.setLineDash([8, 6]);
        }
        ctx.shadowColor = activeTheme.primary;
        ctx.shadowBlur = 16;
        ctx.stroke();
        ctx.restore();
      }

      // 3. Draw Bottom Word-Sync Equalizer Wave Ribbon during Dictation / Listening
      if (ragState === 'dictating' || ragState === 'listening') {
        const ribbonWidth = width * 0.72;
        const startX = cx - ribbonWidth / 2;
        const ribbonY = height - 28;

        ctx.save();
        ctx.beginPath();
        for (let i = 0; i <= 60; i++) {
          const norm = i / 60;
          const x = startX + norm * ribbonWidth;
          const env = Math.pow(4 * norm * (1 - norm), 1.5);
          const y =
            ribbonY +
            Math.sin(norm * Math.PI * 6 + st.phase * 2.2) * (st.current * 18) * env;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = activeTheme.accent;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = activeTheme.accent;
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.restore();
      }

      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [ragState, activeTheme, animSpeed, useRealMic, simulatedVoiceLevel]);

  // ============================================================================
  // RENDER CUTE ANIMATED SVG MASCOTS + RAG BUFFER PROPS
  // ============================================================================
  const renderMascotSVG = () => {
    const bounceY = Math.sin(animTick * (ragState === 'embedding' ? 2.2 : 1.2)) * 7;
    const headTilt =
      ragState === 'listening'
        ? Math.sin(animTick * 1.5) * 6 + 5
        : ragState === 'embedding'
        ? Math.sin(animTick * 2.0) * 4
        : Math.sin(animTick * 0.8) * 2;

    // Mouth / Beak opening synced to word-by-word energy
    const mouthOpen =
      ragState === 'dictating'
        ? Math.max(2, liveEnergy * 18)
        : ragState === 'listening'
        ? 3
        : 2;

    // Blink every ~3.5 seconds
    const isBlinking = Math.sin(animTick * 0.45) > 0.96;
    const eyeScaleY = isBlinking ? 0.12 : 1;

    return (
      <svg
        viewBox="0 0 400 320"
        className="w-full h-full max-w-[420px] max-h-[330px] relative z-10 select-none overflow-visible"
      >
        <defs>
          <linearGradient id="mascotAuraGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={activeTheme.primary} />
            <stop offset="100%" stopColor={activeTheme.secondary} />
          </linearGradient>
          <linearGradient id="pdfPageGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#cbd5e1" />
          </linearGradient>
          <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* ============================================================
            STAGE PROPS FOR STATE 1: UPLOADING / PARSING PDF PAGES
        ============================================================ */}
        {ragState === 'parsing' &&
          [0, 1, 2].map((i) => {
            const progress = ((animTick * 0.45 + i * 0.33) % 1);
            const px = 55 + progress * 105;
            const py = 75 + Math.sin(progress * Math.PI) * -35 + i * 18;
            const scale = 1 - progress * 0.35;
            const rot = -20 + progress * 35;
            return (
              <g
                key={`page-${i}`}
                transform={`translate(${px}, ${py}) rotate(${rot}) scale(${scale})`}
                opacity={1 - progress * 0.25}
              >
                <rect x="-18" y="-24" width="36" height="46" rx="4" fill="url(#pdfPageGrad)" stroke={activeTheme.primary} strokeWidth="2" />
                <rect x="-12" y="-16" width="16" height="5" rx="1.5" fill="#ef4444" />
                <text x="-4" y="-12" fontSize="5" fontWeight="bold" fill="#fff" textAnchor="middle">PDF</text>
                <line x1="-12" y1="-5" x2="12" y2="-5" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
                <line x1="-12" y1="2" x2="10" y2="2" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
                <line x1="-12" y1="9" x2="8" y2="9" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
              </g>
            );
          })}

        {/* ============================================================
            STAGE PROPS FOR STATE 2: CHUNKING & EMBEDDING VECTOR CUBES
        ============================================================ */}
        {ragState === 'embedding' &&
          [0, 1, 2, 3, 4].map((i) => {
            const angle = animTick * 0.85 + (i * Math.PI * 2) / 5;
            const radiusX = 128 + Math.sin(animTick * 1.5 + i) * 10;
            const radiusY = 52 + Math.cos(animTick * 1.2 + i) * 8;
            const vx = 200 + Math.cos(angle) * radiusX;
            const vy = 155 + Math.sin(angle) * radiusY;
            const isFront = Math.sin(angle) >= 0;

            return (
              <g
                key={`vec-${i}`}
                transform={`translate(${vx}, ${vy}) rotate(${animTick * 25 + i * 40}) scale(${isFront ? 1.08 : 0.82})`}
                opacity={isFront ? 0.95 : 0.55}
              >
                <rect
                  x="-14"
                  y="-14"
                  width="28"
                  height="28"
                  rx="7"
                  fill={i % 2 === 0 ? activeTheme.primary : activeTheme.secondary}
                  stroke="#ffffff"
                  strokeWidth="1.5"
                  filter="url(#neonGlow)"
                />
                <text
                  x="0"
                  y="4"
                  fontSize="8.5"
                  fontWeight="bold"
                  fill="#ffffff"
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  {i % 2 === 0 ? '[0.8]' : 'CHUNK'}
                </text>
              </g>
            );
          })}

        {/* ============================================================
            STAGE PROPS FOR STATE 3: LISTENING VOICE RIPPLE NOTES
        ============================================================ */}
        {ragState === 'listening' &&
          [-1, 1].map((dir) => (
            <g key={`ear-wave-${dir}`} transform={`translate(${200 + dir * 115}, 130)`}>
              {[1, 2, 3].map((arc) => {
                const pulse = (animTick * 1.5 + arc * 0.4) % 1.5;
                return (
                  <path
                    key={arc}
                    d={`M ${dir * arc * 10} -22 Q ${dir * (arc * 18 + liveEnergy * 12)} 0 ${dir * arc * 10} 22`}
                    fill="none"
                    stroke={activeTheme.accent}
                    strokeWidth="3"
                    strokeLinecap="round"
                    opacity={Math.max(0.15, 1 - pulse * 0.6)}
                  />
                );
              })}
            </g>
          ))}

        {/* ============================================================
            CHARACTER 1: PROFESSOR HOOT (SCHOLARLY OWL)
        ============================================================ */}
        {selectedMascot === 'owl' && (
          <g transform={`translate(200, ${165 + bounceY})`}>
            {/* Shadow on Desk */}
            <ellipse cx="0" cy="82" rx={56 - bounceY * 0.8} ry="10" fill="rgba(0,0,0,0.45)" />

            <g transform={`rotate(${headTilt})`}>
              {/* Owl Flapping Wings */}
              <path
                d="M -52 -8 C -85 10 -80 48 -48 42"
                fill="#475569"
                stroke={activeTheme.primary}
                strokeWidth="2.5"
                transform={`rotate(${Math.sin(animTick * 2.6) * (ragState === 'embedding' ? 24 : 8)}, -50, 10)`}
              />
              <path
                d="M 52 -8 C 85 10 80 48 48 42"
                fill="#475569"
                stroke={activeTheme.primary}
                strokeWidth="2.5"
                transform={`rotate(${-Math.sin(animTick * 2.6) * (ragState === 'embedding' ? 24 : 8)}, 50, 10)`}
              />

              {/* Plump Owl Body */}
              <ellipse cx="0" cy="12" rx="56" ry="58" fill="#334155" stroke={activeTheme.primary} strokeWidth="3.5" />
              {/* Cream Belly Patch with Feather Chevrons */}
              <ellipse cx="0" cy="24" rx="38" ry="38" fill="#e2e8f0" />
              <path d="M -14 14 L -8 20 L -2 14 M 4 14 L 10 20 L 16 14 M -6 28 L 0 34 L 6 28" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />

              {/* Perky Owl Ear Tufts */}
              <polygon
                points="-45,-32 -22,-46 -52,-65"
                fill="#1e293b"
                stroke={activeTheme.primary}
                strokeWidth="2.5"
                transform={`rotate(${ragState === 'listening' ? -12 : 0}, -35, -40)`}
              />
              <polygon
                points="45,-32 22,-46 52,-65"
                fill="#1e293b"
                stroke={activeTheme.primary}
                strokeWidth="2.5"
                transform={`rotate(${ragState === 'listening' ? 12 : 0}, 35, -40)`}
              />

              {/* Big Scholarly Eyes & Brass Spectacles */}
              <circle cx="-22" cy="-12" r="20" fill="#ffffff" stroke="#fbbf24" strokeWidth="4" />
              <circle cx="22" cy="-12" r="20" fill="#ffffff" stroke="#fbbf24" strokeWidth="4" />
              <line x1="-2" y1="-12" x2="2" y2="-12" stroke="#fbbf24" strokeWidth="4" />

              {/* Pupils (Track PDF pages or user) */}
              <g transform={`scale(1, ${eyeScaleY})`}>
                <circle
                  cx={-22 + (ragState === 'parsing' ? -4 : Math.sin(animTick) * 3)}
                  cy={-12 + (ragState === 'embedding' ? -3 : 0)}
                  r="9.5"
                  fill="#0f172a"
                />
                <circle
                  cx={22 + (ragState === 'parsing' ? -4 : Math.sin(animTick) * 3)}
                  cy={-12 + (ragState === 'embedding' ? -3 : 0)}
                  r="9.5"
                  fill="#0f172a"
                />
                {/* Eye Sparkles */}
                <circle cx="-25" cy="-16" r="3.2" fill="#ffffff" />
                <circle cx="19" cy="-16" r="3.2" fill="#ffffff" />
              </g>

              {/* Animated Talking Owl Beak */}
              <polygon points="-9,-2 9,-2 0,10" fill="#f59e0b" />
              <polygon
                points={`-7,6 7,6 0,${11 + mouthOpen}`}
                fill="#ea580c"
              />

              {/* Scholar Graduation / Dictator Cap */}
              <g transform={`translate(0, -52) rotate(${Math.sin(animTick * 1.5) * 3})`}>
                <polygon points="0,-16 -46,0 0,14 46,0" fill="#0f172a" stroke={activeTheme.primary} strokeWidth="2.5" />
                <rect x="-22" y="4" width="44" height="12" rx="4" fill="#1e293b" />
                {/* Glowing Tassel */}
                <path
                  d={`M 28 2 Q 42 12 ${38 + Math.sin(animTick * 3) * 6} 26`}
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <circle cx={38 + Math.sin(animTick * 3) * 6} cy="27" r="4" fill={activeTheme.accent} />
              </g>
            </g>

            {/* Glowing Open PDF Book Held in Front */}
            <g transform={`translate(0, 56)`}>
              <path
                d="M -52 10 Q -26 -4 0 8 Q 26 -4 52 10 L 46 28 Q 22 16 0 26 Q -22 16 -46 28 Z"
                fill="#f8fafc"
                stroke={activeTheme.primary}
                strokeWidth="2.5"
              />
              {/* Flipping Page Animation */}
              {(ragState === 'parsing' || ragState === 'embedding') && (
                <path
                  d={`M 0 8 Q ${Math.sin(animTick * 4) * 38} -18 ${Math.cos(animTick * 4) * 44} 6`}
                  fill="none"
                  stroke={activeTheme.accent}
                  strokeWidth="3"
                />
              )}
              <rect x="-16" y="12" width="32" height="11" rx="3" fill={activeTheme.primary} />
              <text x="0" y="20" fontSize="7" fontWeight="bold" fill="#ffffff" textAnchor="middle">
                PDF RAG
              </text>
            </g>
          </g>
        )}

        {/* ============================================================
            CHARACTER 2: INSPECTOR SHIBA (DETECTIVE SHIBA INU)
        ============================================================ */}
        {selectedMascot === 'shiba' && (
          <g transform={`translate(200, ${165 + bounceY})`}>
            <ellipse cx="0" cy="82" rx={58 - bounceY * 0.8} ry="10" fill="rgba(0,0,0,0.45)" />

            {/* Wagging Fluffy Shiba Tail */}
            <path
              d="M 42 35 C 78 25 84 -12 56 -16 C 44 -18 44 8 38 22"
              fill="#f59e0b"
              stroke="#fef3c7"
              strokeWidth="4"
              transform={`rotate(${Math.sin(animTick * 4.2) * 18}, 42, 30)`}
            />

            <g transform={`rotate(${headTilt})`}>
              {/* Perky Shiba Triangular Ears */}
              <g transform={`rotate(${ragState === 'listening' ? -14 : Math.sin(animTick * 2) * 5}, -34, -36)`}>
                <polygon points="-48,-22 -16,-48 -44,-76" fill="#d97706" stroke="#fbbf24" strokeWidth="2.5" strokeLinejoin="round" />
                <polygon points="-42,-28 -22,-46 -40,-66" fill="#fef3c7" />
              </g>
              <g transform={`rotate(${ragState === 'listening' ? 14 : -Math.sin(animTick * 2) * 5}, 34, -36)`}>
                <polygon points="48,-22 16,-48 44,-76" fill="#d97706" stroke="#fbbf24" strokeWidth="2.5" strokeLinejoin="round" />
                <polygon points="42,-28 22,-46 40,-66" fill="#fef3c7" />
              </g>

              {/* Shiba Head & Cheeks */}
              <ellipse cx="0" cy="4" rx="58" ry="50" fill="#f59e0b" stroke={activeTheme.primary} strokeWidth="3" />
              {/* Cream Shiba Urajiro Cheek & Snout Mask */}
              <path
                d="M -52 10 C -48 48 -18 54 0 54 C 18 54 48 48 52 10 C 36 -2 20 12 0 12 C -20 12 -36 -2 -52 10 Z"
                fill="#fffbeb"
              />
              {/* Cute Cream Eyebrow Dots */}
              <ellipse cx="-22" cy="-26" rx="7" ry="4.5" fill="#fffbeb" transform="rotate(-10, -22, -26)" />
              <ellipse cx="22" cy="-26" rx="7" ry="4.5" fill="#fffbeb" transform="rotate(10, 22, -26)" />

              {/* Expressive Shiba Eyes */}
              <g transform={`scale(1, ${eyeScaleY})`}>
                <circle cx="-24" cy="-10" r="8.5" fill="#0f172a" />
                <circle cx="24" cy="-10" r="8.5" fill="#0f172a" />
                <circle cx="-26" cy="-13" r="3" fill="#ffffff" />
                <circle cx="22" cy="-13" r="3" fill="#ffffff" />
              </g>

              {/* Detective Collar & PDF Badge */}
              <rect x="-36" y="46" width="72" height="12" rx="6" fill={activeTheme.primary} />
              <circle cx="0" cy="56" r="9" fill="#fbbf24" stroke="#fff" strokeWidth="2" />
              <text x="0" y="59" fontSize="6.5" fontWeight="bold" fill="#0f172a" textAnchor="middle">RAG</text>

              {/* Snout & Animated Barking/Speaking Mouth */}
              <ellipse cx="0" cy="8" rx="9" ry="6.5" fill="#0f172a" />
              <path
                d={`M -12 18 Q 0 ${22 + mouthOpen} 12 18`}
                fill="#f43f5e"
                stroke="#0f172a"
                strokeWidth="2.5"
                strokeLinecap="round"
              />

              {/* Inspector Magnifying Glass Scanning Vector Chunks */}
              <g
                transform={`translate(${48 + Math.cos(animTick * 2) * 10}, ${18 + Math.sin(animTick * 2) * 10}) rotate(${Math.sin(animTick * 1.5) * 15})`}
              >
                <line x1="12" y1="12" x2="28" y2="28" stroke="#fbbf24" strokeWidth="6" strokeLinecap="round" />
                <circle
                  cx="0"
                  cy="0"
                  r="18"
                  fill="rgba(56, 189, 248, 0.25)"
                  stroke={activeTheme.accent}
                  strokeWidth="4"
                />
                <text x="0" y="3" fontSize="7" fontWeight="bold" fill="#fff" textAnchor="middle">
                  PDF
                </text>
              </g>
            </g>
          </g>
        )}

        {/* ============================================================
            CHARACTER 3: CYBER NEKO (NEON HEADPHONE SYNTH CAT)
        ============================================================ */}
        {selectedMascot === 'cat' && (
          <g transform={`translate(200, ${165 + bounceY})`}>
            <ellipse cx="0" cy="82" rx={58 - bounceY * 0.8} ry="10" fill="rgba(0,0,0,0.45)" />

            {/* Swooshing Neon Cat Tail */}
            <path
              d={`M -44 40 C -88 30 -85 -15 ${-55 + Math.sin(animTick * 3) * 12} -25`}
              fill="none"
              stroke={activeTheme.primary}
              strokeWidth="10"
              strokeLinecap="round"
            />

            <g transform={`rotate(${headTilt})`}>
              {/* Studio Headphones Band */}
              <path
                d="M -58 -6 A 58 58 0 0 1 58 -6"
                fill="none"
                stroke={activeTheme.accent}
                strokeWidth="7"
                strokeLinecap="round"
              />

              {/* Cyber Cat Ears with Glowing Tips */}
              <polygon points="-48,-18 -16,-48 -52,-76" fill="#1e293b" stroke={activeTheme.primary} strokeWidth="3" />
              <polygon points="-44,-28 -24,-46 -46,-64" fill={activeTheme.secondary} opacity={0.5 + liveEnergy * 0.5} />

              <polygon points="48,-18 16,-48 52,-76" fill="#1e293b" stroke={activeTheme.primary} strokeWidth="3" />
              <polygon points="44,-28 24,-46 46,-64" fill={activeTheme.secondary} opacity={0.5 + liveEnergy * 0.5} />

              {/* Sleek Cat Head */}
              <ellipse cx="0" cy="6" rx="54" ry="46" fill="#0f172a" stroke={activeTheme.primary} strokeWidth="3.5" />

              {/* Glowing Ear Cups */}
              <rect x="-66" y="-12" width="16" height="34" rx="8" fill={activeTheme.primary} stroke="#fff" strokeWidth="2" />
              <rect x="50" y="-12" width="16" height="34" rx="8" fill={activeTheme.primary} stroke="#fff" strokeWidth="2" />

              {/* Glowing Cyber Visor Eyes */}
              <g transform={`scale(1, ${eyeScaleY})`}>
                <ellipse cx="-22" cy="-6" rx="11" ry="9" fill={activeTheme.accent} filter="url(#neonGlow)" />
                <ellipse cx="22" cy="-6" rx="11" ry="9" fill={activeTheme.accent} filter="url(#neonGlow)" />
                <circle cx="-20" cy="-8" r="3" fill="#ffffff" />
                <circle cx="24" cy="-8" r="3" fill="#ffffff" />
              </g>

              {/* Reactive Neon Whiskers */}
              <g stroke={activeTheme.accent} strokeWidth="2" strokeLinecap="round" opacity="0.8">
                <line x1="-38" y1="8" x2={-68 - liveEnergy * 10} y2="4" />
                <line x1="-38" y1="15" x2={-68 - liveEnergy * 10} y2="17" />
                <line x1="38" y1="8" x2={68 + liveEnergy * 10} y2="4" />
                <line x1="38" y1="15" x2={68 + liveEnergy * 10} y2="17" />
              </g>

              {/* Cute ":3" Cat Mouth & Word-Synced Voice Opening */}
              <polygon points="-5,6 5,6 0,11" fill="#f472b6" />
              <path
                d="M -12 14 Q -6 20 0 14 Q 6 20 12 14"
                fill="none"
                stroke="#ffffff"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              {ragState === 'dictating' && (
                <ellipse
                  cx="0"
                  cy={19 + mouthOpen * 0.35}
                  rx={6 + liveEnergy * 5}
                  ry={2 + mouthOpen * 0.45}
                  fill={activeTheme.secondary}
                />
              )}
            </g>

            {/* Stack of Indexed PDFs Under Cyber Cat */}
            <g transform="translate(0, 56)">
              <rect x="-48" y="0" width="96" height="12" rx="4" fill="#1e293b" stroke={activeTheme.primary} strokeWidth="2" />
              <rect x="-42" y="10" width="84" height="12" rx="4" fill="#334155" stroke={activeTheme.accent} strokeWidth="2" />
              <text x="0" y="9" fontSize="6.5" fontFamily="monospace" fill="#fff" textAnchor="middle">
                VECTOR_INDEX_READY
              </text>
            </g>
          </g>
        )}
      </svg>
    );
  };

  const handleCopyExport = () => {
    const code = generateExportCode(selectedMascot, activeTheme);
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const currentStatusList = RAG_STATUS_MESSAGES[ragState] || RAG_STATUS_MESSAGES.embedding;
  const currentStatusText = currentStatusList[statusMessageIndex % currentStatusList.length];

  return (
    <div className="min-h-screen bg-[#070A12] text-slate-100 font-sans selection:bg-indigo-500/30">
      {/* ====================================================================
          TOP NAVIGATION HEADER
      ==================================================================== */}
      <header className="border-b border-slate-800/80 bg-[#0B0F1C]/85 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg"
              style={{
                background: `linear-gradient(135deg, ${activeTheme.primary}, ${activeTheme.secondary})`
              }}
            >
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base sm:text-lg tracking-tight text-white">
                  PDF Dictator RAG • Mascot Buffer & Voice Studio
                </h1>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  Interactive RAG Companion
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Cute Animated PDF Ingestion Buffer, Vector Chunking & Word-by-Word Cited Voice Dictation
              </p>
            </div>
          </div>

          {/* Mascot Switcher Pills */}
          <div className="flex items-center bg-slate-900/90 p-1 rounded-xl border border-slate-800">
            {MASCOT_PROFILES.map((m) => {
              const active = selectedMascot === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedMascot(m.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    active
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>{m.id === 'owl' ? '🦉' : m.id === 'shiba' ? '🐕' : '🐱'}</span>
                  <span>{m.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* ====================================================================
          MAIN STUDIO GRID
      ==================================================================== */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN (7 Cols): LIVE MASCOT BUFFER & DICTATOR STAGE */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          <div className="relative rounded-3xl bg-gradient-to-b from-[#0E1426] to-[#080C17] border border-slate-800/90 shadow-2xl overflow-hidden flex flex-col">
            
            {/* Stage Top Bar: Active PDF File & Auto-Loop Button */}
            <div className="px-5 pt-4 flex flex-wrap items-center justify-between gap-2 z-20">
              <div className="flex items-center gap-2 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-800">
                <FileText className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-mono text-slate-200">{pdfFileName}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 font-semibold">
                  {ragState === 'parsing' || ragState === 'embedding'
                    ? `${bufferProgress}% Buffered`
                    : 'Vector Indexed'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAutoCycle(!autoCycle)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    autoCycle
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                      : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {autoCycle ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{autoCycle ? 'Auto RAG Loop: ON' : 'Run Full RAG Loop'}</span>
                </button>

                {/* Theme Dots */}
                <div className="flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1.5 rounded-xl border border-slate-800">
                  {COLOR_THEMES.map((t, i) => (
                    <button
                      key={t.name}
                      onClick={() => setThemeIdx(i)}
                      title={t.name}
                      className={`w-4 h-4 rounded-full transition-transform ${
                        themeIdx === i ? 'scale-125 ring-2 ring-white' : 'opacity-60 hover:opacity-100'
                      }`}
                      style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.secondary})` }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Hybrid Canvas + SVG Mascot Viewport */}
            <div className="relative w-full h-[330px] sm:h-[360px] flex items-center justify-center overflow-hidden">
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
              {renderMascotSVG()}
            </div>

            {/* RAG Buffer Progress & Live Cited Word-by-Word Transcript Overlay */}
            <div className="px-6 py-4 min-h-[115px] flex flex-col items-center justify-center text-center border-t border-slate-800/60 bg-[#090D19]/80 z-20">
              {(ragState === 'parsing' || ragState === 'embedding') && (
                <div className="w-full max-w-md flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-indigo-300">
                    <Sparkles className="w-4 h-4 animate-spin" />
                    <span>{currentStatusText}</span>
                  </div>
                  {/* Animated Progress Shimmer Bar */}
                  <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800 p-0.5">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${bufferProgress}%`,
                        background: `linear-gradient(90deg, ${activeTheme.primary}, ${activeTheme.accent})`
                      }}
                    />
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {ragState === 'parsing'
                      ? 'OCR + Layout Analysis • 42 Pages'
                      : 'Generating 1,536-dim Embeddings • Top-K Chunking'}
                  </span>
                </div>
              )}

              {ragState === 'listening' && (
                <div className="flex flex-col items-center gap-1.5 max-w-lg">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                    <Mic className="w-4 h-4 animate-bounce" />
                    <span>
                      {useRealMic
                        ? 'Listening to your live microphone! Ask anything about your PDF...'
                        : currentStatusText}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    "Hey {MASCOT_PROFILES.find((m) => m.id === selectedMascot)?.name}, summarize the architecture on page 18!"
                  </p>
                  {micError && <span className="text-[11px] text-amber-400">{micError}</span>}
                </div>
              )}

              {ragState === 'dictating' && (
                <div className="w-full max-w-xl flex flex-col items-center gap-2">
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      <ShieldCheck className="w-3.5 h-3.5" /> Cited Source: {citationBadge}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-sky-400 font-medium">
                      <Volume2 className="w-3.5 h-3.5 animate-pulse" /> Word-by-Word Wave Sync
                    </span>
                  </div>

                  <p className="text-sm sm:text-base leading-relaxed font-medium flex flex-wrap justify-center gap-x-1.5 gap-y-1 mt-0.5">
                    {wordsArray.map((word, i) => {
                      const isCurrent = i === activeWordIdx;
                      const isSpoken = i <= activeWordIdx;
                      return (
                        <span
                          key={i}
                          className={`px-1 rounded transition-all duration-150 ${
                            isCurrent
                              ? 'bg-indigo-500/30 text-white scale-110 font-bold shadow-sm'
                              : isSpoken
                              ? 'text-slate-200'
                              : 'text-slate-600'
                          }`}
                        >
                          {word}
                        </span>
                      );
                    })}
                  </p>
                </div>
              )}
            </div>

            {/* 4-Stage RAG + Voice Mode Pipeline Selector */}
            <div className="p-4 bg-[#0B0F1C] border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-2.5 z-20">
              {[
                {
                  id: 'parsing',
                  step: '1. Parse PDF',
                  sub: 'Flying pages & OCR',
                  icon: FileText
                },
                {
                  id: 'embedding',
                  step: '2. RAG Buffer',
                  sub: 'Vector chunking loop',
                  icon: Database
                },
                {
                  id: 'listening',
                  step: '3. Voice Query',
                  sub: 'Ears perked + Mic FFT',
                  icon: Mic
                },
                {
                  id: 'dictating',
                  step: '4. Cited Dictation',
                  sub: 'Word-by-word wave',
                  icon: MessageSquareQuote
                }
              ].map((st) => {
                const Icon = st.icon;
                const active = ragState === st.id;
                return (
                  <button
                    key={st.id}
                    onClick={() => {
                      setAutoCycle(false);
                      setRagState(st.id);
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      active
                        ? 'bg-indigo-500/15 border-indigo-500/60 shadow-lg shadow-indigo-500/10'
                        : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-bold ${active ? 'text-indigo-300' : 'text-slate-200'}`}>
                        {st.step}
                      </span>
                      <Icon className={`w-3.5 h-3.5 ${active ? 'text-indigo-400' : 'text-slate-500'}`} />
                    </div>
                    <p className="text-[11px] text-slate-400">{st.sub}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mascot Personality Highlight Banner */}
          <div className="rounded-2xl bg-[#0E1424] border border-slate-800/80 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-2xl shrink-0">
                {selectedMascot === 'owl' ? '🦉' : selectedMascot === 'shiba' ? '🐕' : '🐱'}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">
                    {MASCOT_PROFILES.find((m) => m.id === selectedMascot)?.name}
                  </h3>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300">
                    {MASCOT_PROFILES.find((m) => m.id === selectedMascot)?.badge}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {MASCOT_PROFILES.find((m) => m.id === selectedMascot)?.desc}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (5 Cols): CUSTOMIZER, LIVE VOICE CONTROLS & DROP-IN CODE */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          <div className="rounded-3xl bg-[#0E1424] border border-slate-800/90 flex flex-col h-full overflow-hidden">
            
            {/* Right Panel Navigation Tabs */}
            <div className="flex border-b border-slate-800 bg-[#090D18] p-1.5 gap-1">
              {[
                { id: 'customizer', label: 'RAG & Voice Controls', icon: Sliders },
                { id: 'export', label: 'Export Component', icon: Code2 },
                { id: 'pipeline', label: 'Integration Guide', icon: Cpu }
              ].map((t) => {
                const Icon = t.icon;
                const active = rightTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setRightTab(t.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all ${
                      active
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            {/* TAB 1: RAG & VOICE CUSTOMIZER */}
            {rightTab === 'customizer' && (
              <div className="p-5 flex flex-col gap-4 overflow-y-auto max-h-[640px]">
                {/* Real Mic & Browser TTS Toggles */}
                <div className="p-4 rounded-2xl bg-slate-900/75 border border-slate-800/90 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Live Voice & Microphone Test
                    </span>
                    <Zap className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      onClick={handleToggleRealMic}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        useRealMic
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      {useRealMic ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                      <span>{useRealMic ? 'Real Mic: ON' : 'Test Real Mic'}</span>
                    </button>

                    <button
                      onClick={() => {
                        setUseBrowserTTS(!useBrowserTTS);
                        if (!useBrowserTTS) setRagState('dictating');
                      }}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        useBrowserTTS
                          ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <Volume2 className="w-4 h-4" />
                      <span>{useBrowserTTS ? 'TTS Audio: ON' : 'Enable TTS Voice'}</span>
                    </button>
                  </div>
                </div>

                {/* Animation Speed & Voice Energy Sliders */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-2xl bg-slate-900/75 border border-slate-800/90">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-slate-400">Buffer & Wave Speed</span>
                      <span className="text-indigo-400 font-mono">{animSpeed.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={animSpeed}
                      onChange={(e) => setAnimSpeed(parseFloat(e.target.value))}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-900/75 border border-slate-800/90">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-slate-400">Voice Wave Reactivity</span>
                      <span className="text-emerald-400 font-mono">{Math.round(simulatedVoiceLevel * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.2"
                      max="1.2"
                      step="0.05"
                      value={simulatedVoiceLevel}
                      onChange={(e) => setSimulatedVoiceLevel(parseFloat(e.target.value))}
                      className="w-full accent-emerald-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Document Metadata & Cited Answer Customizer */}
                <div className="p-4 rounded-2xl bg-slate-900/75 border border-slate-800/90 flex flex-col gap-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    PDF Citation & Dictation Script
                  </span>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Active PDF Filename</label>
                    <input
                      type="text"
                      value={pdfFileName}
                      onChange={(e) => setPdfFileName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">RAG Source Citation Badge</label>
                    <input
                      type="text"
                      value={citationBadge}
                      onChange={(e) => setCitationBadge(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-emerald-300 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] text-slate-400">
                        Dictated PDF Answer (Word-by-Word Beak/Mouth & Wave Sync)
                      </label>
                      <button
                        onClick={() => setRagState('dictating')}
                        className="text-[11px] text-indigo-400 hover:underline font-semibold"
                      >
                        Test Dictation →
                      </button>
                    </div>
                    <textarea
                      rows={3}
                      value={dictationScript}
                      onChange={(e) => setDictationScript(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 leading-relaxed focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: EXPORT DROP-IN REACT COMPONENT */}
            {rightTab === 'export' && (
              <div className="p-5 flex flex-col gap-3 h-full">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Drop-In React Component (`PdfDictatorMascot.jsx`)
                    </h3>
                    <p className="text-xs text-slate-400">
                      Self-contained SVG + CSS component for your PDF Dictator RAG frontend.
                    </p>
                  </div>
                  <button
                    onClick={handleCopyExport}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode ? 'Copied!' : 'Copy Component'}</span>
                  </button>
                </div>

                <pre className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl p-4 overflow-x-auto overflow-y-auto max-h-[520px] text-[11px] leading-relaxed font-mono text-slate-300">
                  <code>{generateExportCode(selectedMascot, activeTheme)}</code>
                </pre>
              </div>
            )}

            {/* TAB 3: HOW TO WIRE THIS TO YOUR PDF RAG BACKEND */}
            {rightTab === 'pipeline' && (
              <div className="p-5 flex flex-col gap-3.5 overflow-y-auto max-h-[640px] text-xs text-slate-300 leading-relaxed">
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
                  <h4 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-400" />
                    1. Connecting PDF Upload & Vector Buffering
                  </h4>
                  <p className="text-slate-400">
                    When the user drops a PDF into your app, set <code className="text-indigo-300">state="parsing"</code> while PyMuPDF / PDF.js extracts text, then switch to <code className="text-indigo-300">state="embedding"</code> while LangChain / LlamaIndex chunks and upserts embeddings into Pinecone, Qdrant, or ChromaDB.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
                  <h4 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                    <Search className="w-4 h-4 text-emerald-400" />
                    2. Connecting Voice Query & Retriever Latency
                  </h4>
                  <p className="text-slate-400">
                    While the user speaks their question, set <code className="text-emerald-300">state="listening"</code> so the mascot perks its ears and reacts to microphone volume. During the 300–800ms vector similarity search before TTS starts, briefly pulse <code className="text-emerald-300">state="embedding"</code> so the user sees the mascot actively fetching the exact page citation.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
                  <h4 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                    <MessageSquareQuote className="w-4 h-4 text-amber-400" />
                    3. Word-by-Word Cited Dictation
                  </h4>
                  <p className="text-slate-400">
                    Pass your TTS audio stream's RMS volume (or word alignment timestamps from OpenAI Realtime / ElevenLabs / Web Speech API) into <code className="text-amber-300">audioEnergy</code> with <code className="text-amber-300">state="dictating"</code>. Both the mascot's beak/mouth and the outer ChatGPT-style wave ring will modulate syllable-by-syllable alongside the page citation badge.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}