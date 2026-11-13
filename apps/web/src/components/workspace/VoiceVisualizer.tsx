"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import {
  Mic,
  MicOff,
  Square,
  Sparkles,
  X,
  Volume2,
  VolumeX,
  FileText,
  ExternalLink,
  RotateCcw,
  Copy,
  Check,
  Send,
  Loader2,
  Layers,
  Activity,
  BarChart2,
} from "lucide-react";
import type { Citation } from "@/lib/workspace";
import {
  alignMarkdownTokensToSpeech,
  extractVisualProseWords,
  markdownToSpeechText,
  parseMarkdownBlocks,
} from "@/lib/markdownSpeech";
import { MarkdownMessage, type MarkdownCitationItem } from "./MarkdownMessage";
import { useAutoPageScroll } from "./WordKaraokeText";

export type VisualizerPreset = "orb" | "waves" | "pills";

/* ═══════════════════════════════════════════════════════════════════════════════
   RIFT Cyber-Minimalist Theme Spec for Voice Mode
   ══════════════════════════════════════════════════════════════════════════════ */
const RIFT_THEME = {
  primary: "#00f5d4", // Electric Neon Teal
  secondary: "#0284c7", // Cyber Cyan / Deep Ocean
  core: "#f0fdfa", // Luminous Mint White
  accent: "#c084fc", // Neon Violet / Purple
  glow: "rgba(0, 245, 212, 0.45)",
  glowSecondary: "rgba(2, 132, 199, 0.35)",
  glowAccent: "rgba(192, 132, 252, 0.45)",
};

/* ═══════════════════════════════════════════════════════════════════════════════
   Web Audio API Hook for Live Microphone & Speech Modulation Analysis
   ══════════════════════════════════════════════════════════════════════════════ */
export function useAudioAnalyser(
  micStream: MediaStream | null,
  isAiSpeaking: boolean,
  isListening: boolean,
  isThinking: boolean
) {
  const [energy, setEnergy] = useState<number>(0);
  const [bands, setBands] = useState<number[]>([0.1, 0.1, 0.1, 0.1]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Mutable internal state for 60fps canvas engine
  const internalStateRef = useRef({
    phase: 0,
    energy: 0,
    targetEnergy: 0,
    bands: [0.1, 0.1, 0.1, 0.1],
    targetBands: [0.1, 0.1, 0.1, 0.1],
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (micStream && micStream.active && isListening) {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!audioContextRef.current || audioContextRef.current.state === "closed") {
          audioContextRef.current = new AudioCtx();
        }
        const ctx = audioContextRef.current;
        if (ctx.state === "suspended") {
          ctx.resume().catch(() => {});
        }

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        analyserRef.current = analyser;

        const source = ctx.createMediaStreamSource(micStream);
        source.connect(analyser);
        sourceRef.current = source;
      } catch (err) {
        console.warn("Could not attach audio analyser to stream:", err);
      }
    } else {
      if (sourceRef.current) {
        try {
          sourceRef.current.disconnect();
        } catch {}
        sourceRef.current = null;
      }
    }

    return () => {
      if (sourceRef.current) {
        try {
          sourceRef.current.disconnect();
        } catch {}
        sourceRef.current = null;
      }
    };
  }, [micStream, isListening]);

  // Animation frame loop analyzing real mic data or synthesizing AI speech cadence
  useEffect(() => {
    let animId: number;
    const freqData = new Uint8Array(128);

    const tick = (timestamp: number) => {
      const st = internalStateRef.current;

      if (isListening && analyserRef.current && sourceRef.current) {
        analyserRef.current.getByteFrequencyData(freqData);
        const b1 = ((freqData[2] + freqData[3] + freqData[4]) / 3 / 255) * 1.35;
        const b2 = ((freqData[6] + freqData[8] + freqData[10]) / 3 / 255) * 1.35;
        const b3 = ((freqData[14] + freqData[18] + freqData[22]) / 3 / 255) * 1.35;
        const b4 = ((freqData[28] + freqData[34] + freqData[40]) / 3 / 255) * 1.35;

        st.targetBands = [
          Math.max(0.12, Math.min(1.2, b1)),
          Math.max(0.12, Math.min(1.2, b2)),
          Math.max(0.12, Math.min(1.2, b3)),
          Math.max(0.12, Math.min(1.2, b4)),
        ];
        st.targetEnergy = (b1 + b2 + b3 + b4) / 4;
      } else if (isAiSpeaking) {
        // Natural speech cadence simulation when AI speaks
        const speechPulse =
          Math.sin(timestamp * 0.009) * 0.35 +
          Math.sin(timestamp * 0.021) * 0.35 +
          Math.cos(timestamp * 0.035) * 0.3;
        const activePulse = Math.max(0.15, Math.min(1.15, (speechPulse + 0.6) * 0.75));
        st.targetEnergy = activePulse;
        st.targetBands = [
          activePulse * (0.8 + 0.2 * Math.sin(timestamp * 0.012)),
          activePulse * (1.0 + 0.2 * Math.cos(timestamp * 0.016)),
          activePulse * (0.9 + 0.2 * Math.sin(timestamp * 0.019)),
          activePulse * (0.7 + 0.2 * Math.cos(timestamp * 0.014)),
        ];
      } else if (isThinking) {
        // Thinking mode: energetic undulating swirl with elevated frequency
        st.targetEnergy = 0.55 + Math.sin(timestamp * 0.008) * 0.22;
        st.targetBands = [
          0.55 + Math.sin(timestamp * 0.009) * 0.35,
          0.55 + Math.sin(timestamp * 0.009 + 1.2) * 0.35,
          0.55 + Math.sin(timestamp * 0.009 + 2.4) * 0.35,
          0.55 + Math.sin(timestamp * 0.009 + 3.6) * 0.35,
        ];
      } else {
        // Idle gentle breathing baseline
        st.targetEnergy = 0.06 + Math.sin(timestamp * 0.0025) * 0.04;
        st.targetBands = [0.15, 0.15, 0.15, 0.15];
      }

      // Smooth spring interpolation
      st.energy += (st.targetEnergy - st.energy) * 0.2;
      for (let i = 0; i < 4; i++) {
        st.bands[i] += (st.targetBands[i] - st.bands[i]) * 0.22;
      }

      const speedMultiplier =
        isThinking ? 0.095 : isListening ? 0.035 + st.energy * 0.08 : 0.022;
      st.phase += speedMultiplier;

      setEnergy(st.energy);
      setBands([...st.bands]);

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isListening, isAiSpeaking, isThinking]);

  return { energy, bands, internalStateRef };
}

/* ═══════════════════════════════════════════════════════════════════════════════
   1. Master Canvas Visualizer Engine (Supports 'orb' | 'waves' | 'pills')
   ══════════════════════════════════════════════════════════════════════════════ */
export function VoiceCanvasVisualizer({
  preset = "orb",
  isListening,
  isThinking,
  isAiSpeaking,
  internalStateRef,
}: {
  preset: VisualizerPreset;
  isListening: boolean;
  isThinking: boolean;
  isAiSpeaking: boolean;
  internalStateRef: React.MutableRefObject<{
    phase: number;
    energy: number;
    targetEnergy: number;
    bands: number[];
    targetBands: number[];
  }>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const parent = canvas.parentElement;
      const width = parent ? parent.clientWidth : 340;
      const height = parent ? parent.clientHeight : 260;
      const cx = width / 2;
      const cy = height / 2;
      const st = internalStateRef.current;

      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // ── PRESET 1: FLUID CLOUD ORB (ChatGPT Advanced Voice Style) ───────────
      if (preset === "orb") {
        const baseRadius = Math.min(width, height) * 0.28;

        // Ambient Outer Aura
        const auraRadius = baseRadius * (1.45 + st.energy * 0.55);
        const auraGrad = ctx.createRadialGradient(cx, cy, baseRadius * 0.4, cx, cy, auraRadius);
        auraGrad.addColorStop(0, isThinking ? RIFT_THEME.glowAccent : RIFT_THEME.glow);
        auraGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, auraRadius, 0, Math.PI * 2);
        ctx.fill();

        // 3 Overlapping Organic Morphing Fluid Layers
        const layers = [
          { scale: 1.06, alpha: 0.35, speed: -1.1, freq1: 3, freq2: 4, color: RIFT_THEME.secondary },
          { scale: 1.0, alpha: 0.85, speed: 1.0, freq1: 2, freq2: 5, color: RIFT_THEME.primary },
          { scale: 0.82, alpha: 0.95, speed: 1.35, freq1: 3, freq2: 3, color: RIFT_THEME.core },
        ];

        layers.forEach((layer, idx) => {
          ctx.save();
          ctx.beginPath();
          const numPoints = 72;

          for (let i = 0; i <= numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            const p = st.phase * layer.speed + idx * 1.3;

            const deformAmplitude = isThinking
              ? baseRadius * 0.14
              : baseRadius * (0.03 + st.energy * 0.28);

            const n1 = Math.sin(angle * layer.freq1 + p) * deformAmplitude;
            const n2 = Math.cos(angle * layer.freq2 - p * 1.2) * (deformAmplitude * 0.65);
            const n3 = Math.sin(angle * 7 + p * 1.7) * (st.energy * baseRadius * 0.08);

            const r = baseRadius * layer.scale + n1 + n2 + n3 + st.energy * 14;
            const x = cx + Math.cos(angle) * r;
            const y = cy + Math.sin(angle) * r;

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();

          // Internal rotating fluid gradient (authentic ChatGPT cloud swirl)
          const swirlX = cx + Math.cos(st.phase * 0.8 + idx) * (baseRadius * 0.35);
          const swirlY = cy + Math.sin(st.phase * 0.8 + idx) * (baseRadius * 0.35);
          const orbGrad = ctx.createRadialGradient(
            swirlX,
            swirlY,
            baseRadius * 0.08,
            cx,
            cy,
            baseRadius * 1.35
          );

          if (isThinking) {
            orbGrad.addColorStop(0, "#ffffff");
            orbGrad.addColorStop(0.5, RIFT_THEME.accent);
            orbGrad.addColorStop(1, "#3b0764");
          } else if (idx === 2) {
            orbGrad.addColorStop(0, "#ffffff");
            orbGrad.addColorStop(0.55, RIFT_THEME.core);
            orbGrad.addColorStop(1, RIFT_THEME.primary);
          } else {
            orbGrad.addColorStop(0, RIFT_THEME.core);
            orbGrad.addColorStop(0.45, layer.color);
            orbGrad.addColorStop(1, RIFT_THEME.secondary);
          }

          ctx.globalAlpha = layer.alpha;
          ctx.fillStyle = orbGrad;
          ctx.shadowColor = isThinking ? RIFT_THEME.accent : RIFT_THEME.primary;
          ctx.shadowBlur = 25 + st.energy * 30;
          ctx.fill();
          ctx.restore();
        });

        // Gyroscopic Orbit Rings & Orbiting Neural Particles during "Thinking" State
        if (isThinking) {
          // Ring 1: Neon Violet Gyroscope Orbit
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(0.38);
          ctx.beginPath();
          ctx.ellipse(0, 0, baseRadius * 1.34, baseRadius * 0.52, st.phase * 0.6, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(192, 132, 252, 0.45)";
          ctx.lineWidth = 1.5;
          ctx.shadowColor = RIFT_THEME.accent;
          ctx.shadowBlur = 10;
          ctx.stroke();
          ctx.restore();

          // Ring 2: Electric Teal Counter-Gyroscope Orbit
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(-0.38);
          ctx.beginPath();
          ctx.ellipse(0, 0, baseRadius * 1.25, baseRadius * 0.48, -st.phase * 0.7, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(0, 245, 212, 0.4)";
          ctx.lineWidth = 1.5;
          ctx.shadowColor = RIFT_THEME.primary;
          ctx.shadowBlur = 10;
          ctx.stroke();
          ctx.restore();

          // 8 Quantum Neural Nodes in 3D Orbit
          for (let p = 0; p < 8; p++) {
            const orbitAngle = st.phase * 1.2 + (p * Math.PI) / 4;
            const orbitRadius = baseRadius * 1.32 + Math.sin(st.phase * 2.2 + p) * 12;
            const px = cx + Math.cos(orbitAngle) * orbitRadius;
            const py = cy + Math.sin(orbitAngle) * (orbitRadius * 0.62);

            ctx.save();
            ctx.beginPath();
            ctx.fillStyle = p % 2 === 0 ? "#ffffff" : RIFT_THEME.primary;
            ctx.shadowColor = p % 2 === 0 ? RIFT_THEME.accent : RIFT_THEME.primary;
            ctx.shadowBlur = 14;
            ctx.arc(px, py, p % 2 === 0 ? 4.5 : 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      }

      // ── PRESET 2: HARMONIC SIRI / GEMINI GLOWING WAVES ─────────────────────
      else if (preset === "waves") {
        const waveWidth = width * 0.86;
        const startX = (width - waveWidth) / 2;
        const maxAmp = height * 0.34;

        const curves = [
          { color: RIFT_THEME.primary, freq: 1.5, speed: 1.0, ampScale: 1.0, alpha: 0.9, lineWidth: 3.5 },
          { color: RIFT_THEME.secondary, freq: 2.2, speed: -1.3, ampScale: 0.78, alpha: 0.7, lineWidth: 2.5 },
          { color: "#ffffff", freq: 3.0, speed: 1.6, ampScale: 0.55, alpha: 0.85, lineWidth: 2.0 },
          { color: RIFT_THEME.accent, freq: 1.1, speed: 0.7, ampScale: 0.4, alpha: 0.45, lineWidth: 1.5 },
        ];

        ctx.save();
        ctx.globalCompositeOperation = "lighter";

        curves.forEach((curve, cIdx) => {
          ctx.beginPath();
          const segments = 120;

          for (let i = 0; i <= segments; i++) {
            const normX = i / segments;
            const x = startX + normX * waveWidth;
            const envelope = Math.pow(4 * normX * (1 - normX), 1.6);

            const activeAmp = isThinking
              ? maxAmp * 0.35
              : maxAmp * (0.12 + st.energy * 0.88);

            const yOffset =
              Math.sin(normX * Math.PI * 2 * curve.freq + st.phase * curve.speed + cIdx) *
              activeAmp *
              curve.ampScale *
              envelope;

            const y = cy + yOffset;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }

          ctx.strokeStyle = curve.color;
          ctx.globalAlpha = curve.alpha;
          ctx.lineWidth = curve.lineWidth;
          ctx.shadowColor = curve.color;
          ctx.shadowBlur = 18;
          ctx.stroke();

          ctx.lineTo(startX + waveWidth, cy);
          ctx.lineTo(startX, cy);
          ctx.closePath();
          ctx.fillStyle = curve.color;
          ctx.globalAlpha = curve.alpha * 0.12;
          ctx.fill();
        });

        ctx.restore();
      }

      // ── PRESET 3: MINIMALIST PILL EQUALIZER ────────────────────────────────
      else if (preset === "pills") {
        const pillCount = 4;
        const pillWidth = 26;
        const gap = 16;
        const totalWidth = pillCount * pillWidth + (pillCount - 1) * gap;
        const startX = cx - totalWidth / 2;
        const maxPillHeight = height * 0.48;

        for (let i = 0; i < pillCount; i++) {
          let pillHeight = pillWidth;
          let yBounce = 0;

          if (isThinking) {
            yBounce = Math.sin(st.phase * 1.8 + i * 0.9) * 22;
            pillHeight = pillWidth + Math.abs(Math.cos(st.phase * 1.8 + i * 0.9)) * 14;
          } else {
            const bandLevel = st.bands[i] || st.energy;
            pillHeight = Math.max(pillWidth, pillWidth + bandLevel * maxPillHeight);
          }

          const x = startX + i * (pillWidth + gap);
          const y = cy - pillHeight / 2 + yBounce;

          ctx.save();
          const pillGrad = ctx.createLinearGradient(x, y, x, y + pillHeight);
          pillGrad.addColorStop(0, "#ffffff");
          pillGrad.addColorStop(0.4, isThinking ? RIFT_THEME.accent : RIFT_THEME.primary);
          pillGrad.addColorStop(1, isThinking ? "#581c87" : RIFT_THEME.secondary);

          ctx.fillStyle = pillGrad;
          ctx.shadowColor = isThinking ? RIFT_THEME.accent : RIFT_THEME.primary;
          ctx.shadowBlur = 20 + st.energy * 20;

          ctx.beginPath();
          ctx.roundRect(x, y, pillWidth, pillHeight, pillWidth / 2);
          ctx.fill();
          ctx.restore();
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [preset, isListening, isThinking, isAiSpeaking, internalStateRef]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "230px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   2. Synchronized Word-by-Word Answer Reveal with Audio Energy Modulation
   ══════════════════════════════════════════════════════════════════════════════ */
export function WordByWordAnswer({
  text,
  isSpeaking,
  onWordTick,
  onComplete,
  autoPageContainerRef,
  citations,
  onCitationClick,
}: {
  text: string;
  isSpeaking: boolean;
  onWordTick?: (word: string, index: number, isLast: boolean) => void;
  onComplete?: () => void;
  autoPageContainerRef?: React.RefObject<HTMLElement | null>;
  citations?: MarkdownCitationItem[];
  onCitationClick?: (citation: MarkdownCitationItem) => void;
}) {
  const speechWords = useMemo(
    () => markdownToSpeechText(text).split(/\s+/).filter(Boolean),
    [text]
  );
  const visualWords = useMemo(
    () => extractVisualProseWords(parseMarkdownBlocks(text)),
    [text]
  );
  const visualToSpeechIdx = useMemo(
    () => alignMarkdownTokensToSpeech(visualWords, speechWords),
    [visualWords, speechWords]
  );
  const [activeWordIndex, setActiveWordIndex] = useState<number>(0);
  const [isDone, setIsDone] = useState<boolean>(false);
  const wordRootRef = useRef<HTMLDivElement | null>(null);

  useAutoPageScroll({
    wordRootRef,
    autoPageContainerRef,
    isActive: isSpeaking && !isDone,
    isPlaying: isSpeaking && !isDone,
    activeRenderIdx: isSpeaking && !isDone ? activeWordIndex : -1,
    resetKey: text,
  });

  useEffect(() => {
    if (!isSpeaking) {
      // Whether interrupted manually or auto-interrupted by voice:
      // Immediately stop word-by-word animation and reveal the FULL response text!
      setActiveWordIndex(speechWords.length);
      setIsDone(true);
      return;
    }

    setActiveWordIndex(0);
    setIsDone(false);
    if (!text || speechWords.length === 0) return;

    let idx = 0;
    let timer: NodeJS.Timeout | null = null;
    let isCancelled = false;

    const playWord = () => {
      if (isCancelled) return;
      if (idx >= speechWords.length) {
        setIsDone(true);
        onComplete?.();
        return;
      }

      const currentWord = speechWords[idx];
      setActiveWordIndex(idx);
      onWordTick?.(currentWord, idx, idx === speechWords.length - 1);

      // Duration tailored to syllable length for authentic human cadence (~150wpm)
      const cleanLen = currentWord.replace(/[^a-zA-Z]/g, "").length || 3;
      const duration = Math.max(160, 150 + cleanLen * 26);

      idx++;
      timer = setTimeout(playWord, duration);
    };

    playWord();

    return () => {
      isCancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [text, speechWords, isSpeaking, onComplete, onWordTick]);

  return (
    <div style={{ letterSpacing: "0.01em" }}>
      <MarkdownMessage
        rootRef={wordRootRef}
        text={text}
        fontSize="13.5px"
        lineHeight="1.75"
        textColor="#f0fdfa"
        citations={citations}
        onCitationClick={onCitationClick}
        wordSync={{
          visualToSpeechIdx,
          activeSpeechIndex: isDone ? -1 : activeWordIndex,
          pastBeforeSpeechIndex: isDone ? speechWords.length : activeWordIndex,
          futureColor: "#cbd5e1",
          revealMaxSpeechIndex: isDone ? undefined : activeWordIndex,
        }}
      />
      {!isDone && (
        <span
          style={{
            display: "inline-block",
            width: "6px",
            height: "14px",
            backgroundColor: "#00f5d4",
            marginLeft: "2px",
            verticalAlign: "middle",
            borderRadius: "1px",
            boxShadow: "0 0 10px #00f5d4",
          }}
          className="animate-pulse"
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   3. Dedicated Voice Interface Container
   ══════════════════════════════════════════════════════════════════════════════ */
export interface VoiceModeProps {
  micStream: MediaStream | null;
  isListening: boolean;
  isSubmitting: boolean;
  isDictating: boolean;
  voiceTranscript: string;
  activeQueryText?: string;
  activeAnswerText: string;
  activeAnswerCitations?: Citation[];
  onToggleListening: () => void;
  onStopQuery: () => void;
  onExitVoiceMode: () => void;
  onCitationClick: (citation: Citation) => void;
  onDirectSubmit: (text: string) => void;
}

export function ChatGPTVoiceInterface({
  micStream,
  isListening,
  isSubmitting,
  isDictating,
  voiceTranscript,
  activeQueryText = "",
  activeAnswerText,
  activeAnswerCitations = [],
  onToggleListening,
  onStopQuery,
  onExitVoiceMode,
  onCitationClick,
  onDirectSubmit,
}: VoiceModeProps) {
  // Preset selector: Fluid Cloud Orb ('orb') is DEFAULT
  const [preset, setPreset] = useState<VisualizerPreset>("orb");
  const [copied, setCopied] = useState(false);
  const scrollStageRef = useRef<HTMLDivElement | null>(null);

  // Hook up Web Audio API analyzer
  const { energy, internalStateRef } = useAudioAnalyser(
    micStream,
    isDictating,
    isListening,
    isSubmitting
  );

  // Word-by-word energy pulse coupler
  const handleWordTick = useCallback((word: string) => {
    const cleanLen = word.replace(/[^a-zA-Z]/g, "").length || 3;
    const peak = Math.min(1.15, 0.45 + cleanLen * 0.09);
    internalStateRef.current.targetEnergy = peak;
    internalStateRef.current.targetBands = [peak * 0.8, peak * 1.0, peak * 0.9, peak * 0.7];
    setTimeout(() => {
      internalStateRef.current.targetEnergy = 0.16;
    }, 120);
  }, [internalStateRef]);

  // Handle immediate user commit
  const handleManualCommit = useCallback(() => {
    if (voiceTranscript.trim() && !isSubmitting) {
      onDirectSubmit(voiceTranscript.trim());
    }
  }, [voiceTranscript, isSubmitting, onDirectSubmit]);

  // Status configuration
  const statusConfig = useMemo(() => {
    if (isSubmitting) {
      return {
        label: "RIFT THINKING",
        desc: "Synthesizing answer from document embeddings…",
        dotColor: "#c084fc",
        glow: "0 0 12px rgba(192, 132, 252, 0.8)",
      };
    }
    if (isDictating) {
      return {
        label: "RIFT VOCALIZING",
        desc: "Speaking answer with word-level speech modulation…",
        dotColor: "#38bdf8",
        glow: "0 0 12px rgba(56, 189, 248, 0.8)",
      };
    }
    if (isListening) {
      return {
        label: "LISTENING ACTIVE",
        desc: "Speak naturally. Pausing 1s auto-submits…",
        dotColor: "#00f5d4",
        glow: "0 0 12px rgba(0, 245, 212, 0.9)",
      };
    }
    return {
      label: "VOICE STANDBY",
      desc: "Tap microphone to resume listening…",
      dotColor: "#94a3b8",
      glow: "none",
    };
  }, [isSubmitting, isDictating, isListening]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "linear-gradient(180deg, #02060a 0%, #040d12 60%, #010407 100%)",
        overflow: "hidden",
        zIndex: 50,
      }}
    >
      {/* ── Top Bar: Status + Style Switcher + Exit ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid rgba(0, 245, 212, 0.12)",
          background: "rgba(2, 6, 12, 0.96)",
          backdropFilter: "blur(12px)",
          flexShrink: 0,
          gap: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "7px", minWidth: 0 }}>
          <div
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              backgroundColor: statusConfig.dotColor,
              boxShadow: statusConfig.glow,
              flexShrink: 0,
            }}
            className={isListening || isDictating ? "animate-pulse" : ""}
          />
          <div
            style={{
              fontSize: "10.5px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              fontFamily: "var(--font-mono)",
              color: statusConfig.dotColor,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {statusConfig.label}
          </div>
        </div>

        {/* Style Preset Switcher: Orb (Default) | Waves | Pills */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: "rgba(255, 255, 255, 0.04)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "6px",
            padding: "2px",
            gap: "2px",
          }}
        >
          <button
            onClick={() => setPreset("orb")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 7px",
              borderRadius: "4px",
              fontSize: "9.5px",
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
              background: preset === "orb" ? "rgba(0, 245, 212, 0.18)" : "transparent",
              border: preset === "orb" ? "1px solid rgba(0, 245, 212, 0.45)" : "1px solid transparent",
              color: preset === "orb" ? "#00f5d4" : "#94a3b8",
              cursor: "pointer",
              transition: "all 0.12s ease",
            }}
            title="Fluid Cloud Orb (Default ChatGPT style)"
          >
            <span>Orb</span>
          </button>

          <button
            onClick={() => setPreset("waves")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 7px",
              borderRadius: "4px",
              fontSize: "9.5px",
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
              background: preset === "waves" ? "rgba(0, 245, 212, 0.18)" : "transparent",
              border: preset === "waves" ? "1px solid rgba(0, 245, 212, 0.45)" : "1px solid transparent",
              color: preset === "waves" ? "#00f5d4" : "#94a3b8",
              cursor: "pointer",
              transition: "all 0.12s ease",
            }}
            title="Harmonic Siri / Gemini Waves"
          >
            <span>Waves</span>
          </button>

          <button
            onClick={() => setPreset("pills")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 7px",
              borderRadius: "4px",
              fontSize: "9.5px",
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
              background: preset === "pills" ? "rgba(0, 245, 212, 0.18)" : "transparent",
              border: preset === "pills" ? "1px solid rgba(0, 245, 212, 0.45)" : "1px solid transparent",
              color: preset === "pills" ? "#00f5d4" : "#94a3b8",
              cursor: "pointer",
              transition: "all 0.12s ease",
            }}
            title="Equalizer Pills"
          >
            <span>Pills</span>
          </button>
        </div>

        {/* Exit Button */}
        <button
          onClick={onExitVoiceMode}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            padding: "3px 8px",
            borderRadius: "5px",
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            color: "#94a3b8",
            fontSize: "10.5px",
            fontFamily: "var(--font-mono)",
            cursor: "pointer",
            transition: "all 0.12s ease",
          }}
          title="Return to standard chat view (Esc)"
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#00f5d4";
            e.currentTarget.style.borderColor = "rgba(0, 245, 212, 0.4)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#94a3b8";
            e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.12)";
          }}
        >
          <span>Chat View</span>
          <X size={11} />
        </button>
      </div>

      {/* ── Main Stage: 60FPS Canvas Visualizer + Dynamic Interaction Cards ── */}
      <div
        ref={scrollStageRef}
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          position: "relative",
          padding: "10px 14px 16px",
          overflowY: "auto",
        }}
      >
        {/* Subtle Cybernetic Grid Backdrop */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.04,
            backgroundImage:
              "radial-gradient(rgba(0, 245, 212, 0.4) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            pointerEvents: "none",
          }}
        />

        {/* 60FPS Canvas Visualizer (Fluid Cloud Orb / Waves / Pills) */}
        <div style={{ width: "100%", maxWidth: "380px", flexShrink: 0 }}>
          <VoiceCanvasVisualizer
            preset={preset}
            isListening={isListening}
            isThinking={isSubmitting}
            isAiSpeaking={isDictating}
            internalStateRef={internalStateRef}
          />
        </div>

        {/* ── Dedicated Single-Query / Single-Answer Voice HUD (Always Visible Animation) ── */}
        <div
          style={{
            width: "100%",
            maxWidth: "440px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            zIndex: 10,
            marginTop: "8px",
          }}
        >
          {/* ── Active Voice Query Hologram Panel ── */}
          {(voiceTranscript || (isSubmitting && activeQueryText)) && (
            <div
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "12px",
                background: isSubmitting
                  ? "linear-gradient(135deg, rgba(192, 132, 252, 0.12), rgba(2, 132, 199, 0.16))"
                  : "linear-gradient(135deg, rgba(0, 245, 212, 0.10), rgba(2, 132, 199, 0.14))",
                border: isSubmitting
                  ? "1px solid rgba(192, 132, 252, 0.55)"
                  : "1px solid rgba(0, 245, 212, 0.45)",
                boxShadow: isSubmitting
                  ? "0 4px 20px rgba(192, 132, 252, 0.2), inset 0 0 12px rgba(192, 132, 252, 0.08)"
                  : "0 4px 20px rgba(0, 245, 212, 0.15), inset 0 0 12px rgba(0, 245, 212, 0.05)",
                animation: "fadeIn 0.15s ease-out",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "6px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  {isSubmitting ? (
                    <>
                      <Sparkles size={11} color="#c084fc" />
                      <span
                        style={{
                          fontSize: "9px",
                          fontWeight: 800,
                          letterSpacing: "0.12em",
                          fontFamily: "var(--font-mono)",
                          color: "#c084fc",
                          textTransform: "uppercase",
                        }}
                      >
                        QUERY IN PROCESSING
                      </span>
                    </>
                  ) : (
                    <>
                      <Activity size={11} color="#00f5d4" />
                      <span
                        style={{
                          fontSize: "9px",
                          fontWeight: 800,
                          letterSpacing: "0.12em",
                          fontFamily: "var(--font-mono)",
                          color: "#00f5d4",
                          textTransform: "uppercase",
                        }}
                      >
                        VOICE QUERY
                      </span>
                      <span
                        style={{
                          display: "inline-block",
                          width: "5px",
                          height: "5px",
                          borderRadius: "50%",
                          background: "#ef4444",
                          boxShadow: "0 0 6px #ef4444",
                        }}
                        className="animate-pulse"
                      />
                    </>
                  )}
                </div>

                {!isSubmitting && (
                  <button
                    onClick={handleManualCommit}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      fontSize: "9px",
                      fontWeight: 700,
                      fontFamily: "var(--font-mono)",
                      padding: "2px 7px",
                      borderRadius: "4px",
                      background: "rgba(0, 245, 212, 0.25)",
                      border: "1px solid rgba(0, 245, 212, 0.6)",
                      color: "#00f5d4",
                      cursor: "pointer",
                      transition: "all 0.12s ease",
                    }}
                    title="Send now (or pause speaking to auto-submit)"
                  >
                    <Send size={8} />
                    <span>Send now</span>
                  </button>
                )}
              </div>

              <div
                style={{
                  fontSize: "13px",
                  color: "#f0fdfa",
                  lineHeight: "1.55",
                  fontWeight: 500,
                  fontStyle: "italic",
                }}
              >
                &ldquo;{isSubmitting ? (activeQueryText || voiceTranscript) : voiceTranscript}&rdquo;
              </div>
            </div>
          )}

          {/* ── Cybernetic Neural Reasoning HUD Bar ── */}
          {isSubmitting && (
            <div
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "14px",
                background: "linear-gradient(135deg, rgba(16, 8, 30, 0.96), rgba(4, 18, 28, 0.96))",
                border: "1.5px solid rgba(192, 132, 252, 0.55)",
                boxShadow: "0 8px 30px rgba(168, 85, 247, 0.28), 0 0 20px rgba(0, 245, 212, 0.14)",
                display: "flex",
                flexDirection: "column",
                gap: "9px",
                animation: "fadeIn 0.2s ease-out",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Loader2 size={15} className="animate-spin text-purple-400" />
                  <span
                    style={{
                      fontSize: "10.5px",
                      fontWeight: 800,
                      letterSpacing: "0.1em",
                      fontFamily: "var(--font-mono)",
                      color: "#c084fc",
                      textTransform: "uppercase",
                    }}
                  >
                    RIFT Neural Reasoning
                  </span>
                </div>
                <span
                  style={{
                    fontSize: "9px",
                    fontFamily: "var(--font-mono)",
                    color: "#00f5d4",
                    fontWeight: 600,
                  }}
                  className="animate-pulse"
                >
                  Searching embeddings…
                </span>
              </div>

              {/* Shimmering scanning progress track */}
              <div
                style={{
                  width: "100%",
                  height: "4px",
                  borderRadius: "2px",
                  background: "rgba(255, 255, 255, 0.08)",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: 0,
                    right: 0,
                    width: "100%",
                    background: "linear-gradient(90deg, transparent, #00f5d4 40%, #c084fc 60%, transparent)",
                    animation: "shimmerSweep 1.6s infinite ease-in-out",
                  }}
                />
              </div>

              <div style={{ fontSize: "10px", color: "#94a3b8", lineHeight: "1.4" }}>
                Analyzing document vectors & synthesizing grounded citations…
              </div>
            </div>
          )}

          {/* ── Neural Answer Console (Non-Chat Styling) ── */}
          {activeAnswerText && !isSubmitting && (
            <div
              style={{
                width: "100%",
                padding: "13px 15px",
                borderRadius: "14px",
                background: "rgba(3, 10, 15, 0.95)",
                backdropFilter: "blur(14px)",
                border: "1px solid rgba(0, 245, 212, 0.3)",
                boxShadow: "0 10px 36px rgba(0, 0, 0, 0.85), 0 0 20px rgba(0, 245, 212, 0.12)",
                display: "flex",
                flexDirection: "column",
                gap: "9px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingBottom: "5px",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
                }}
              >
                <div
                  style={{
                    fontSize: "10px",
                    fontWeight: 800,
                    letterSpacing: "0.1em",
                    fontFamily: "var(--font-mono)",
                    color: "#38bdf8",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    textTransform: "uppercase",
                  }}
                >
                  <Sparkles size={11} color="#00f5d4" />
                  <span>NEURAL SYNTHESIS</span>
                </div>

                <button
                  onClick={() => {
                    navigator.clipboard.writeText(activeAnswerText);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1400);
                  }}
                  style={{
                    background: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "4px",
                    color: copied ? "#00f5d4" : "#94a3b8",
                    cursor: "pointer",
                    fontSize: "9.5px",
                    fontFamily: "var(--font-mono)",
                    display: "flex",
                    alignItems: "center",
                    gap: "3px",
                    padding: "2px 6px",
                  }}
                  title="Copy answer text"
                >
                  {copied ? <Check size={10} /> : <Copy size={10} />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
              </div>

              {/* Word-by-Word Reveal synchronized with speech attack */}
              <WordByWordAnswer
                text={activeAnswerText}
                isSpeaking={isDictating}
                onWordTick={handleWordTick}
                autoPageContainerRef={scrollStageRef}
                citations={activeAnswerCitations}
                onCitationClick={onCitationClick}
              />

              {/* Clickable Citation Chips */}
              {activeAnswerCitations && activeAnswerCitations.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "6px",
                    marginTop: "4px",
                    paddingTop: "6px",
                    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                  }}
                >
                  <span
                    style={{
                      fontSize: "9px",
                      fontWeight: 700,
                      fontFamily: "var(--font-mono)",
                      color: "#64748b",
                      alignSelf: "center",
                      letterSpacing: "0.05em",
                    }}
                  >
                    SOURCES:
                  </span>
                  {activeAnswerCitations.map((c, idx) => {
                    const isWeb = Boolean(c.url || c.source === "web");
                    const displayNum = c.number ?? idx + 1;
                    return (
                      <button
                        key={c.id}
                        onClick={() => onCitationClick(c)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "2px 7px",
                          borderRadius: "5px",
                          background: isWeb ? "rgba(13, 148, 136, 0.16)" : "rgba(0, 245, 212, 0.12)",
                          border: isWeb
                            ? "1px solid rgba(45, 212, 191, 0.45)"
                            : "1px solid rgba(0, 245, 212, 0.35)",
                          color: isWeb ? "#5eead4" : "#00f5d4",
                          fontSize: "9.5px",
                          fontFamily: "var(--font-mono)",
                          cursor: "pointer",
                          transition: "all 0.12s ease",
                        }}
                        title={
                          isWeb
                            ? `Open web source: ${c.url || c.label}`
                            : `Jump to Page ${c.page ?? 1} in document`
                        }
                      >
                        <span style={{ fontWeight: 700 }}>[{displayNum}]</span>
                        {isWeb ? <ExternalLink size={9} /> : <FileText size={9} />}
                        <span>{c.label || (isWeb ? "Web source" : `Page ${c.page ?? 1}`)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Standby prompt when waiting for speech */}
          {!voiceTranscript && !activeAnswerText && !isSubmitting && (
            <div
              style={{
                textAlign: "center",
                color: "#64748b",
                fontSize: "11.5px",
                fontFamily: "var(--font-mono)",
                marginTop: "12px",
                padding: "8px 14px",
                borderRadius: "8px",
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px dashed rgba(255, 255, 255, 0.08)",
              }}
            >
              Listening for your voice… Ask any question about the PDF.
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Voice Control Dock ── */}
      <div
        style={{
          borderTop: "1px solid rgba(0, 245, 212, 0.12)",
          background: "rgba(1, 4, 7, 0.98)",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "14px",
          flexShrink: 0,
        }}
      >
        {/* Interrupt / Stop Query Button */}
        {isSubmitting || isDictating ? (
          <button
            onClick={onStopQuery}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "7px",
              padding: "7px 16px",
              borderRadius: "24px",
              background: "linear-gradient(135deg, rgba(239, 68, 68, 0.25), rgba(185, 28, 28, 0.35))",
              border: "1.5px solid rgba(239, 68, 68, 0.7)",
              color: "#f87171",
              fontSize: "11.5px",
              fontWeight: 600,
              fontFamily: "var(--font-mono)",
              cursor: "pointer",
              boxShadow: "0 0 16px rgba(239, 68, 68, 0.4)",
              transition: "all 0.15s ease",
            }}
            title="Interrupt answer or query (Esc)"
          >
            <Square size={12} fill="currentColor" />
            <span>Interrupt</span>
          </button>
        ) : (
          /* Mic Active / Pause Status Button */
          <button
            onClick={onToggleListening}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "7px",
              padding: "7px 16px",
              borderRadius: "24px",
              background: isListening
                ? "linear-gradient(135deg, rgba(0, 245, 212, 0.22), rgba(13, 148, 136, 0.3))"
                : "rgba(255, 255, 255, 0.05)",
              border: isListening
                ? "1.5px solid rgba(0, 245, 212, 0.65)"
                : "1px solid rgba(255, 255, 255, 0.12)",
              color: isListening ? "#00f5d4" : "#94a3b8",
              fontSize: "11.5px",
              fontWeight: 600,
              fontFamily: "var(--font-mono)",
              cursor: "pointer",
              boxShadow: isListening ? "0 0 18px rgba(0, 245, 212, 0.35)" : "none",
              transition: "all 0.15s ease",
            }}
            title={isListening ? "Listening active. Click to pause" : "Click to resume listening"}
          >
            <Mic size={13} className={isListening ? "animate-pulse" : ""} />
            <span>{isListening ? "Listening…" : "Paused"}</span>
          </button>
        )}

        {/* Back to Chat Text shortcut */}
        <button
          onClick={onExitVoiceMode}
          style={{
            background: "transparent",
            border: "none",
            color: "#64748b",
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            cursor: "pointer",
            padding: "4px 8px",
            transition: "all 0.12s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#00f5d4")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#64748b")}
        >
          Return to chat (Esc)
        </button>
      </div>

      <style>{`
        @keyframes shimmerSweep {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
