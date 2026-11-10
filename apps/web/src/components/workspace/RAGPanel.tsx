/**
 * RAGPanel – Minimalist grounded Q&A with real-time listening mode,
 * voice input, animated answer streaming, ElevenLabs answer dictation,
 * and dual PDF/Web citation auto-scrolling reticles.
 *
 * Streamlined controls per specification:
 * - One Listening Mode toggle button in header (ON = continuous listen & auto-send; OFF = dormant)
 * - One unified text input box
 * - One voice input button (mic)
 * - One send button
 * - NO mode switcher tabs
 *
 * Voice Input Architecture (Web Speech API + Silence-Gated Fallback):
 * - baseTextRef         : text committed from previous sessions / manual typing
 * - sessionCommittedRef : live finals + interim from current active session
 * - Display = mergeWithBase(baseTextRef, sessionCommittedRef)  (no double-counting)
 * - On onend: sessionCommittedRef merges into baseTextRef, resets to ""
 * - Recomputes current session's full e.results[0..length-1] idempotently
 * - Fresh SpeechRecognition instance per session + voiceSessionIdRef race guard
 * - Explicit browser/permission/network error reporting + silence-gated fallback
 */
"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useParams } from "next/navigation";
import {
  Mic,
  MicOff,
  Send,
  Volume2,
  VolumeX,
  ExternalLink,
  FileText,
  Sparkles,
  Radio,
  Loader2,
} from "lucide-react";
import {
  queryDocument,
  synthesizeElevenLabs,
  transcribeAudio,
  type WordTimestamp,
} from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import type { Citation } from "@/lib/workspace";
import WaveformAnimation from "./WaveformAnimation";

/* ─────────────────────────────────────────────────────────────────────────────
   Typed Web Speech API shims (avoids `any` across Chrome/Edge prefixes)
───────────────────────────────────────────────────────────────────────────── */
interface SpeechRecognitionResultAlternativeLike {
  transcript?: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0?: SpeechRecognitionResultAlternativeLike;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  error?: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onsoundstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "message" in err && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return fallback;
}

function getErrorName(err: unknown): string {
  if (err && typeof err === "object" && "name" in err && typeof (err as { name?: unknown }).name === "string") {
    return (err as { name: string }).name;
  }
  return "";
}

/* ─────────────────────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────────────────────── */
function genId() {
  return Math.random().toString(36).slice(2);
}

/* ── Wavebars thinking indicator ──────────────────────────────────────────── */
function ThinkingWave() {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "16px" }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="wave-bar"
          style={{
            width: "3px",
            background: "#38bdf8",
            borderRadius: "2px",
            animationDelay: `${i * 0.12}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ── ElevenLabs Word-by-Word Karaoke Highlighting for Answers ─────────────── */
function AnswerKaraokeText({
  text,
  wordsTimeline,
  currentTime,
  isPlaying,
  onSeekWord,
}: {
  text: string;
  wordsTimeline: WordTimestamp[];
  currentTime: number;
  isPlaying: boolean;
  onSeekWord: (sec: number) => void;
}) {
  if (wordsTimeline.length > 0) {
    return (
      <div style={{ lineHeight: "1.7", fontSize: "13px" }}>
        {wordsTimeline.map((item, idx) => {
          const isCurrent =
            isPlaying && currentTime >= item.start && currentTime <= item.end + 0.05;
          const isPast = currentTime > item.end;

          return (
            <span
              key={`${item.word}-${idx}`}
              onClick={(e) => {
                e.stopPropagation();
                onSeekWord(item.start);
              }}
              style={{
                display: "inline-block",
                padding: "1px 3px",
                margin: "0 1px",
                borderRadius: "4px",
                cursor: "pointer",
                transition: "all 0.08s ease",
                backgroundColor: isCurrent ? "rgba(6, 182, 212, 0.25)" : "transparent",
                color: isCurrent
                  ? "#22d3ee"
                  : isPast
                  ? "#f1f5f9"
                  : "rgba(148, 163, 184, 0.7)",
                fontWeight: isCurrent ? 600 : 400,
                textShadow: isCurrent ? "0 0 10px rgba(34, 211, 238, 0.8)" : "none",
                transform: isCurrent ? "scale(1.04)" : "scale(1)",
                border: isCurrent
                  ? "1px solid rgba(34, 211, 238, 0.4)"
                  : "1px solid transparent",
              }}
            >
              {item.word}{" "}
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ lineHeight: "1.7", fontSize: "13px", color: "#f1f5f9" }}>{text}</div>
  );
}

/* ── Citation Chip: PDF (cyan) / Web (indigo) ────────────────────────────── */
function CitationChip({
  citation,
  onNavigate,
}: {
  citation: Citation;
  onNavigate: (c: Citation) => void;
}) {
  const isWeb = !!citation.url || citation.source === "web";
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => onNavigate(citation)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          padding: "3px 8px",
          borderRadius: "6px",
          border: isWeb
            ? "1px solid rgba(99, 102, 241, 0.4)"
            : "1px solid rgba(6, 182, 212, 0.35)",
          background: isWeb
            ? "rgba(99, 102, 241, 0.15)"
            : "rgba(6, 182, 212, 0.12)",
          color: isWeb ? "#a5b4fc" : "#38bdf8",
          fontSize: "10.5px",
          fontFamily: "var(--font-mono)",
          fontWeight: 500,
          cursor: "pointer",
          transition: "all 0.15s ease",
        }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {isWeb ? <ExternalLink size={10} /> : <FileText size={10} />}
        {citation.label}
      </button>

      {/* Tooltip with snippet or URL */}
      {showTooltip && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 5px)",
            left: 0,
            background: "rgba(10, 15, 29, 0.98)",
            border: `1px solid ${isWeb ? "rgba(99, 102, 241, 0.4)" : "rgba(6, 182, 212, 0.4)"}`,
            borderRadius: "6px",
            padding: "5px 8px",
            fontSize: "10px",
            color: isWeb ? "#c7d2fe" : "#a5f3fc",
            whiteSpace: "normal",
            maxWidth: "240px",
            zIndex: 60,
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.6)",
            pointerEvents: "none",
          }}
        >
          {citation.url ? (
            <div style={{ wordBreak: "break-all" }}>{citation.url}</div>
          ) : (
            <div>
              <div style={{ fontWeight: 600, color: "#38bdf8" }}>
                Jump to Page {citation.page} in PDF
              </div>
              {citation.snippet && (
                <div
                  style={{
                    fontSize: "9px",
                    color: "#94a3b8",
                    marginTop: "3px",
                    lineHeight: "1.4",
                  }}
                >
                  &ldquo;{citation.snippet.slice(0, 110)}&hellip;&rdquo;
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main RAGPanel Component
═══════════════════════════════════════════════════════════════════════════ */
export default function RAGPanel() {
  const params = useParams();
  const docId = (params?.docId as string) || (params?.id as string) || "";

  const {
    documentId: workspaceDocId,
    pdfUrl,
    messages,
    addMessage,
    updateMessage,
    navigateToParagraph,
    setCurrentPage,
    selectedElevenVoice,
    paragraphs,
  } = useWorkspace();

  const activeDocId = docId || workspaceDocId || "";

  /* ── UI state ─────────────────────────────────────────────────────────── */
  const [input, setInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [listeningMode, setListeningMode] = useState(false);
  const [isRecordingOnce, setIsRecordingOnce] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [micStatus, setMicStatus] = useState<
    "idle" | "starting" | "listening" | "hearing" | "fallback" | "transcribing"
  >("idle");
  const [micError, setMicError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  /* ── ElevenLabs dictation state ───────────────────────────────────────── */
  const answerAudioRef = useRef<HTMLAudioElement | null>(null);
  const [dictatingMsgId, setDictatingMsgId] = useState<string | null>(null);
  const [answerCurrentTime, setAnswerCurrentTime] = useState(0);
  const [answerTimeline, setAnswerTimeline] = useState<WordTimestamp[]>([]);

  /* ── Speech Recognition & Voice Input refs ────────────────────────────── */
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const startSpeechSessionRef = useRef<() => void>(() => {});
  const voiceSessionIdRef = useRef<number>(0);
  const activeModeRef = useRef<"none" | "once" | "listening">("none");
  const isRecognizingRef = useRef<boolean>(false);
  const networkErrorCountRef = useRef<number>(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Voice text accumulation:
   *   baseTextRef         – all committed text from PREVIOUS sessions or manual typing
   *   sessionCommittedRef – complete transcript (finals + interim) of CURRENT session
   *   currentInputRef     – latest full visible text in textarea
   */
  const baseTextRef = useRef<string>("");
  const sessionCommittedRef = useRef<string>("");
  const currentInputRef = useRef<string>("");

  /* ── Silence-gated MediaRecorder fallback (only if Web Speech unavailable/blocked) ── */
  const usingFallbackRef = useRef<boolean>(false);
  const fallbackStreamRef = useRef<MediaStream | null>(null);
  const fallbackRecorderRef = useRef<MediaRecorder | null>(null);
  const fallbackChunksRef = useRef<Blob[]>([]);
  const fallbackAudioCtxRef = useRef<AudioContext | null>(null);
  const fallbackRafRef = useRef<number | null>(null);
  const fallbackPeakRmsRef = useRef<number>(0);
  const fallbackStartTimeRef = useRef<number>(0);

  /* ── submitQuestion ref so async callbacks always invoke latest version ── */
  const submitQuestionRef = useRef<(q: string) => Promise<void>>(async () => {});

  /* ─────────────────────────────────────────────────────────────────────────
     Helper: append spoken text cleanly after baseTextRef without duplicates
  ───────────────────────────────────────────────────────────────────────── */
  const mergeWithBase = useCallback((base: string, addition: string): string => {
    const cleanBase = base.trim();
    const cleanAdd = addition.trim();
    if (!cleanBase) return cleanAdd;
    if (!cleanAdd) return cleanBase;
    return `${cleanBase} ${cleanAdd}`;
  }, []);

  /* ─────────────────────────────────────────────────────────────────────────
     Auto-scroll message list
  ───────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, dictatingMsgId]);

  /* ─────────────────────────────────────────────────────────────────────────
     ElevenLabs Answer Dictation
  ───────────────────────────────────────────────────────────────────────── */
  const dictateAnswer = useCallback(
    async (msgId: string, text: string) => {
      if (dictatingMsgId === msgId) {
        answerAudioRef.current?.pause();
        setDictatingMsgId(null);
        return;
      }

      setDictatingMsgId(msgId);
      try {
        const cleanText = text
          .replace(/\[\d+\]/g, "")
          .replace(/§[^\n]+/g, "")
          .trim();
        const tts = await synthesizeElevenLabs(cleanText, selectedElevenVoice);
        if (!tts || !tts.audio_base64) {
          setDictatingMsgId(null);
          return;
        }

        const audioBlob = new Blob(
          [Uint8Array.from(atob(tts.audio_base64), (c) => c.charCodeAt(0))],
          { type: "audio/mp3" }
        );
        const url = URL.createObjectURL(audioBlob);

        if (!answerAudioRef.current) {
          answerAudioRef.current = new Audio();
        }
        const audio = answerAudioRef.current;
        audio.src = url;
        setAnswerTimeline(tts.words || []);
        setAnswerCurrentTime(0);

        audio.onloadedmetadata = () => {
          audio.play().catch(() => setDictatingMsgId(null));
        };
        audio.ontimeupdate = () => {
          setAnswerCurrentTime(audio.currentTime);
        };
        audio.onended = () => {
          setDictatingMsgId(null);
          setAnswerTimeline([]);
        };
        audio.onerror = () => {
          setDictatingMsgId(null);
        };
      } catch (err) {
        console.warn("Answer dictation error:", err);
        setDictatingMsgId(null);
      }
    },
    [dictatingMsgId, selectedElevenVoice]
  );

  /* ─────────────────────────────────────────────────────────────────────────
     Cleanly dispose active Web Speech instance (prevents Chrome InvalidState / stale onend races)
  ───────────────────────────────────────────────────────────────────────── */
  const disposeSpeechSession = useCallback((abort = false) => {
    voiceSessionIdRef.current += 1;
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    isRecognizingRef.current = false;

    if (rec) {
      rec.onstart = null;
      rec.onaudiostart = null;
      rec.onsoundstart = null;
      rec.onspeechstart = null;
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        if (abort && typeof rec.abort === "function") {
          rec.abort();
        } else {
          rec.stop();
        }
      } catch {
        /* ignore */
      }
    }
  }, []);

  /* ─────────────────────────────────────────────────────────────────────────
     Stop Silence-Gated Fallback Recorder (only used if Web Speech unavailable/blocked)
  ───────────────────────────────────────────────────────────────────────── */
  const stopFallbackRecorder = useCallback(
    async (discard: boolean) => {
      if (fallbackRafRef.current) {
        cancelAnimationFrame(fallbackRafRef.current);
        fallbackRafRef.current = null;
      }

      const peakRms = fallbackPeakRmsRef.current;
      const elapsedMs = Date.now() - fallbackStartTimeRef.current;
      const mr = fallbackRecorderRef.current;
      fallbackRecorderRef.current = null;

      const cleanupStream = () => {
        if (fallbackAudioCtxRef.current) {
          fallbackAudioCtxRef.current.close().catch(() => {});
          fallbackAudioCtxRef.current = null;
        }
        if (fallbackStreamRef.current) {
          fallbackStreamRef.current.getTracks().forEach((t) => t.stop());
          fallbackStreamRef.current = null;
        }
      };

      if (!mr || mr.state === "inactive") {
        cleanupStream();
        fallbackChunksRef.current = [];
        usingFallbackRef.current = false;
        setMicStatus("idle");
        return;
      }

      await new Promise<void>((resolve) => {
        mr.onstop = async () => {
          const chunks = fallbackChunksRef.current;
          fallbackChunksRef.current = [];
          cleanupStream();
          usingFallbackRef.current = false;

          if (discard || chunks.length === 0) {
            setMicStatus("idle");
            resolve();
            return;
          }

          // Silence / click noise gate: never call backend STT if no real speech amplitude occurred
          if (elapsedMs < 350 || peakRms < 0.012) {
            setMicError("No speech detected. Speak clearly closer to the mic and try again.");
            setMicStatus("idle");
            resolve();
            return;
          }

          const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
          if (blob.size < 600) {
            setMicStatus("idle");
            resolve();
            return;
          }

          setMicStatus("transcribing");
          try {
            const text = (await transcribeAudio(blob)).trim();
            if (text) {
              const combined = mergeWithBase(baseTextRef.current, text);
              baseTextRef.current = combined;
              currentInputRef.current = combined;
              setInput(combined);
              setVoiceTranscript(text);
            } else {
              setMicError("Could not detect clear speech in audio.");
            }
          } catch (err: unknown) {
            setMicError(getErrorMessage(err, "Speech transcription request failed."));
          } finally {
            setMicStatus("idle");
            resolve();
          }
        };

        try {
          mr.stop();
        } catch {
          cleanupStream();
          usingFallbackRef.current = false;
          setMicStatus("idle");
          resolve();
        }
      });
    },
    [mergeWithBase]
  );

  /* ─────────────────────────────────────────────────────────────────────────
     Start Silence-Gated MediaRecorder Fallback (for Firefox / Brave / blocked network)
  ───────────────────────────────────────────────────────────────────────── */
  const startFallbackRecorder = useCallback(async () => {
    try {
      usingFallbackRef.current = true;
      setMicStatus("starting");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      // Verify user didn't cancel while permission dialog was open
      if (activeModeRef.current === "none") {
        stream.getTracks().forEach((t) => t.stop());
        usingFallbackRef.current = false;
        setMicStatus("idle");
        return;
      }

      fallbackStreamRef.current = stream;
      fallbackChunksRef.current = [];
      fallbackPeakRmsRef.current = 0;
      fallbackStartTimeRef.current = Date.now();

      // Track peak RMS amplitude to prevent hallucinating on silence
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        src.connect(analyser);
        fallbackAudioCtxRef.current = ctx;

        const data = new Float32Array(analyser.fftSize);
        const measure = () => {
          if (!fallbackRecorderRef.current) return;
          analyser.getFloatTimeDomainData(data);
          let sumSq = 0;
          for (let i = 0; i < data.length; i++) sumSq += data[i] * data[i];
          const rms = Math.sqrt(sumSq / data.length);
          if (rms > fallbackPeakRmsRef.current) {
            fallbackPeakRmsRef.current = rms;
          }
          fallbackRafRef.current = requestAnimationFrame(measure);
        };
        fallbackRafRef.current = requestAnimationFrame(measure);
      } catch {
        /* AudioContext optional; fallback still records */
      }

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
      const mr = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) fallbackChunksRef.current.push(e.data);
      };

      mr.start(250);
      fallbackRecorderRef.current = mr;
      setMicStatus("fallback");
    } catch (err: unknown) {
      usingFallbackRef.current = false;
      activeModeRef.current = "none";
      setIsRecordingOnce(false);
      setListeningMode(false);
      setMicStatus("idle");
      setMicError(
        getErrorName(err) === "NotAllowedError"
          ? "Microphone permission denied. Allow mic access in your browser address bar and try again."
          : getErrorMessage(err, "Could not open microphone.")
      );
    }
  }, []);

  /* ─────────────────────────────────────────────────────────────────────────
     Start Fresh Web Speech API Session (synchronous inside user click!)
  ───────────────────────────────────────────────────────────────────────── */
  const startSpeechSession = useCallback(() => {
    if (typeof window === "undefined") return;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }

    // Cleanly close any lingering prior instance before starting fresh
    disposeSpeechSession(true);

    const SpeechRec = getSpeechRecognitionCtor();

    if (!SpeechRec) {
      console.warn("[RIFT Voice] Web Speech API not supported in this browser");
      if (activeModeRef.current === "once") {
        setMicError(
          "Live word streaming requires Chrome or Edge (Web Speech API is missing in this browser). Recording audio fallback — click Mic again to transcribe."
        );
        void startFallbackRecorder();
      } else {
        activeModeRef.current = "none";
        setListeningMode(false);
        setMicStatus("idle");
        setMicError(
          "Continuous Listening requires Chrome or Edge (Web Speech API is not supported in this browser)."
        );
      }
      return;
    }

    const sessionId = voiceSessionIdRef.current;
    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.maxAlternatives = 1;
    recognitionRef.current = rec;

    rec.onstart = () => {
      if (sessionId !== voiceSessionIdRef.current) return;
      console.log("[RIFT Voice] SpeechRecognition started ✅");
      isRecognizingRef.current = true;
      setMicStatus((prev) => (prev === "hearing" ? "hearing" : "listening"));
    };

    rec.onaudiostart = () => {
      if (sessionId !== voiceSessionIdRef.current) return;
      console.log("[RIFT Voice] Audio capture started");
      setMicStatus((prev) => (prev === "hearing" ? "hearing" : "listening"));
    };

    rec.onsoundstart = () => {
      if (sessionId !== voiceSessionIdRef.current) return;
      setMicStatus("hearing");
    };

    rec.onspeechstart = () => {
      if (sessionId !== voiceSessionIdRef.current) return;
      setMicStatus("hearing");
    };

    rec.onresult = (e: SpeechRecognitionEventLike) => {
      if (sessionId !== voiceSessionIdRef.current) return;
      networkErrorCountRef.current = 0;
      setMicStatus("hearing");

      /*
       * Recompute the entire CURRENT session's transcript (finals + interim) from e.results.
       * This is idempotent across duplicate/corrected browser events and guarantees
       * words never duplicate or replace earlier sessions stored in baseTextRef.
       */
      let sessionFinals = "";
      let sessionInterim = "";

      for (let i = 0; i < e.results.length; ++i) {
        const item = e.results[i];
        const text = (item[0]?.transcript || "").trim();
        if (!text) continue;

        if (item.isFinal) {
          sessionFinals = sessionFinals ? `${sessionFinals} ${text}` : text;
        } else {
          sessionInterim = sessionInterim ? `${sessionInterim} ${text}` : text;
        }
      }

      const sessionText = [sessionFinals, sessionInterim].filter(Boolean).join(" ");
      sessionCommittedRef.current = sessionText;

      const fullText = mergeWithBase(baseTextRef.current, sessionText);
      console.log("[RIFT Voice] onresult ->", { sessionFinals, sessionInterim, fullText });

      if (fullText) {
        setInput(fullText);
        currentInputRef.current = fullText;
        setVoiceTranscript(sessionText || fullText);

        // Keep typing box scrolled to bottom as words stream in
        if (inputRef.current) {
          inputRef.current.scrollTop = inputRef.current.scrollHeight;
        }

        // Continuous listening mode: auto-send 2.5 s after user pauses speaking
        if (activeModeRef.current === "listening") {
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            if (activeModeRef.current === "listening" && currentInputRef.current.trim()) {
              submitQuestionRef.current(currentInputRef.current.trim());
            }
          }, 2500);
        }
      }
    };

    rec.onerror = (e: SpeechRecognitionErrorEventLike) => {
      if (sessionId !== voiceSessionIdRef.current) return;
      const errType = e?.error;
      console.warn("[RIFT Voice] SpeechRec error:", errType);

      if (errType === "no-speech" || errType === "aborted") {
        // Normal silence timeout or deliberate restart – onend will handle restart cleanly
        return;
      }

      if (errType === "not-allowed") {
        disposeSpeechSession(true);
        activeModeRef.current = "none";
        setIsRecordingOnce(false);
        setListeningMode(false);
        setMicStatus("idle");
        setMicError(
          "Microphone permission denied. Allow microphone access in your browser address bar and try again."
        );
        return;
      }

      if (errType === "audio-capture") {
        disposeSpeechSession(true);
        activeModeRef.current = "none";
        setIsRecordingOnce(false);
        setListeningMode(false);
        setMicStatus("idle");
        setMicError(
          "No microphone detected or mic is locked by another app. Check your Windows/browser mic input."
        );
        return;
      }

      if (errType === "network" || errType === "service-not-allowed") {
        networkErrorCountRef.current += 1;
        if (networkErrorCountRef.current >= 2 || errType === "service-not-allowed") {
          // Browser blocked Google/Microsoft speech cloud (common in Brave, VPNs, offline, firewalls)
          disposeSpeechSession(true);
          if (activeModeRef.current === "once") {
            setMicError(
              "Live Web Speech API failed ('network' blocked — common in Brave/firewall/offline; use Chrome or Edge for live streaming). Switched to audio fallback: speak and click Mic to transcribe."
            );
            void startFallbackRecorder();
          } else {
            activeModeRef.current = "none";
            setListeningMode(false);
            setMicStatus("idle");
            setMicError(
              "Continuous Listening requires online Web Speech API access (Chrome/Edge). Speech service returned '" +
                errType +
                "'."
            );
          }
        }
      }
    };

    rec.onend = () => {
      if (sessionId !== voiceSessionIdRef.current) return;
      console.log("[RIFT Voice] SpeechRec ended; activeMode =", activeModeRef.current);
      recognitionRef.current = null;
      isRecognizingRef.current = false;

      // Commit everything spoken in this session (finals + any unfinalized interim) into baseTextRef
      if (sessionCommittedRef.current.trim()) {
        baseTextRef.current = mergeWithBase(
          baseTextRef.current,
          sessionCommittedRef.current
        );
        sessionCommittedRef.current = "";
      }

      // Auto-restart seamlessly if voice typing / listening mode is still enabled
      if (activeModeRef.current !== "none" && !usingFallbackRef.current) {
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        restartTimerRef.current = setTimeout(() => {
          if (activeModeRef.current !== "none" && !usingFallbackRef.current) {
            startSpeechSessionRef.current();
          }
        }, 150);
      } else if (!usingFallbackRef.current) {
        setMicStatus("idle");
      }
    };

    try {
      console.log("[RIFT Voice] Calling rec.start()");
      rec.start();
      isRecognizingRef.current = true;
    } catch (err: unknown) {
      console.warn("[RIFT Voice] rec.start() threw:", err);
      disposeSpeechSession(true);
      const errMsg = getErrorMessage(err, "browser error");
      if (activeModeRef.current === "once") {
        setMicError(
          `Could not start live Web Speech (${errMsg}). Switching to audio recorder fallback.`
        );
        void startFallbackRecorder();
      } else {
        activeModeRef.current = "none";
        setListeningMode(false);
        setMicStatus("idle");
        setMicError(`Could not start Web Speech API: ${errMsg}`);
      }
    }
  }, [disposeSpeechSession, mergeWithBase, startFallbackRecorder]);

  useEffect(() => {
    startSpeechSessionRef.current = startSpeechSession;
  }, [startSpeechSession]);

  /* Cleanup timers & audio on unmount */
  useEffect(() => {
    return () => {
      activeModeRef.current = "none";
      disposeSpeechSession(true);
      void stopFallbackRecorder(true);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (editRestartTimerRef.current) clearTimeout(editRestartTimerRef.current);
    };
  }, [disposeSpeechSession, stopFallbackRecorder]);

  /* ─────────────────────────────────────────────────────────────────────────
     Question submission
  ───────────────────────────────────────────────────────────────────────── */
  const submitQuestion = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed || isSubmitting) return;

      const userMsgId = genId();
      const aiMsgId = genId();

      // Clear timers before resetting buffers
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (editRestartTimerRef.current) clearTimeout(editRestartTimerRef.current);

      // Stop one-shot voice input on send; in continuous listening, restart session clean after clearing
      const wasListening = activeModeRef.current === "listening";
      if (activeModeRef.current === "once") {
        activeModeRef.current = "none";
        setIsRecordingOnce(false);
        if (usingFallbackRef.current) {
          void stopFallbackRecorder(true);
        } else {
          disposeSpeechSession(true);
          setMicStatus("idle");
        }
      }

      addMessage({ id: userMsgId, role: "user", text: trimmed });
      setInput("");
      currentInputRef.current = "";
      baseTextRef.current = "";
      sessionCommittedRef.current = "";
      setVoiceTranscript("");
      setIsSubmitting(true);

      if (wasListening && !usingFallbackRef.current) {
        // Restart Web Speech session with empty e.results so the next spoken question starts fresh
        startSpeechSession();
      }

      addMessage({ id: aiMsgId, role: "assistant", text: "", isLoading: true });

      try {
        let answerText = "";
        let citations: Citation[] = [];

        if (activeDocId) {
          const res = await queryDocument(
            activeDocId,
            trimmed,
            undefined,
            undefined,
            paragraphs,
            pdfUrl || undefined
          );
          answerText = res.answer;
          citations = (res.citations || []).map((c: Citation) => ({
            id: c.id || genId(),
            label: c.label || `Page ${c.page}`,
            page: c.page,
            paragraphId: c.paragraphId,
            bbox: c.bbox,
            chunkType: c.chunkType,
            source: c.source || (c.url ? "web" : "pdf"),
            url: c.url,
            snippet: c.snippet,
          }));
        } else {
          answerText = `Here is the explanation for "${trimmed}". Click any source citation chip below to navigate the document in real time.`;
          citations = [{ id: "c-1", label: "§ Page 1 · Overview", page: 1 }];
        }

        updateMessage(aiMsgId, { text: answerText, citations, isLoading: false });

        // Auto-scroll to first PDF citation with bbox
        const firstPdfCit = citations.find((c) => !c.url && (c.bbox || c.paragraphId));
        if (firstPdfCit) {
          if (firstPdfCit.bbox && firstPdfCit.page) {
            navigateToParagraph(firstPdfCit.paragraphId || firstPdfCit.id, {
              page: firstPdfCit.page,
              ...firstPdfCit.bbox,
            });
          } else if (firstPdfCit.paragraphId) {
            navigateToParagraph(firstPdfCit.paragraphId);
          }
        }

        // Auto-dictate answer
        dictateAnswer(aiMsgId, answerText);
      } catch (err: unknown) {
        updateMessage(aiMsgId, {
          text: `Could not retrieve answer: ${getErrorMessage(err, "Request failed")}`,
          isLoading: false,
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      activeDocId,
      isSubmitting,
      addMessage,
      updateMessage,
      navigateToParagraph,
      dictateAnswer,
      paragraphs,
      pdfUrl,
      disposeSpeechSession,
      stopFallbackRecorder,
      startSpeechSession,
    ]
  );

  // Keep submitQuestionRef always current so async timers invoke the latest version
  useEffect(() => {
    submitQuestionRef.current = submitQuestion;
  }, [submitQuestion]);

  /* ─────────────────────────────────────────────────────────────────────────
     Toggle Listening Mode (continuous listen + auto-send)
  ───────────────────────────────────────────────────────────────────────── */
  const toggleListeningMode = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    if (editRestartTimerRef.current) clearTimeout(editRestartTimerRef.current);

    if (activeModeRef.current === "listening") {
      // Turn OFF listening mode
      activeModeRef.current = "none";
      setListeningMode(false);
      if (sessionCommittedRef.current.trim()) {
        baseTextRef.current = mergeWithBase(
          baseTextRef.current,
          sessionCommittedRef.current
        );
        sessionCommittedRef.current = "";
      }
      disposeSpeechSession(false);
      setMicStatus("idle");
      setVoiceTranscript("");
    } else {
      // If one-shot recording was active, cleanly stop it first
      if (activeModeRef.current === "once") {
        setIsRecordingOnce(false);
        if (usingFallbackRef.current) {
          void stopFallbackRecorder(true);
        } else {
          disposeSpeechSession(true);
        }
      }

      setMicError(null);
      usingFallbackRef.current = false;
      networkErrorCountRef.current = 0;
      baseTextRef.current = currentInputRef.current.trim();
      sessionCommittedRef.current = "";
      setVoiceTranscript("");
      activeModeRef.current = "listening";
      setListeningMode(true);
      setMicStatus("starting");
      startSpeechSession();
    }
  }, [disposeSpeechSession, mergeWithBase, startSpeechSession, stopFallbackRecorder]);

  /* ─────────────────────────────────────────────────────────────────────────
     Toggle One-Shot Voice Input (mic button inside input pill)
  ───────────────────────────────────────────────────────────────────────── */
  const toggleVoiceInput = useCallback(() => {
    // Mic button does not interfere while continuous Listening Mode is ON
    if (activeModeRef.current === "listening") return;

    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    if (editRestartTimerRef.current) clearTimeout(editRestartTimerRef.current);

    if (activeModeRef.current === "once") {
      // Stop recording cleanly and preserve everything spoken so next start appends
      activeModeRef.current = "none";
      setIsRecordingOnce(false);

      if (usingFallbackRef.current) {
        void stopFallbackRecorder(false);
      } else {
        if (sessionCommittedRef.current.trim()) {
          baseTextRef.current = mergeWithBase(
            baseTextRef.current,
            sessionCommittedRef.current
          );
          sessionCommittedRef.current = "";
        } else {
          baseTextRef.current = currentInputRef.current.trim();
        }
        disposeSpeechSession(false);
        setMicStatus("idle");
        setVoiceTranscript("");
      }
    } else {
      // Start voice typing synchronously inside click gesture
      setMicError(null);
      usingFallbackRef.current = false;
      networkErrorCountRef.current = 0;
      baseTextRef.current = currentInputRef.current.trim();
      sessionCommittedRef.current = "";
      setVoiceTranscript("");
      activeModeRef.current = "once";
      setIsRecordingOnce(true);
      setMicStatus("starting");
      startSpeechSession();
    }
  }, [disposeSpeechSession, mergeWithBase, startSpeechSession, stopFallbackRecorder]);

  /* ─────────────────────────────────────────────────────────────────────────
     Citation click: navigate PDF viewer + transcript section
  ───────────────────────────────────────────────────────────────────────── */
  const handleCitationClick = useCallback(
    (cit: Citation) => {
      if (cit.url) {
        window.open(cit.url, "_blank", "noopener,noreferrer");
        return;
      }

      const targetPage = cit.page || 1;
      let targetBbox = cit.bbox;
      let targetId = cit.paragraphId || cit.id;

      // Try to resolve bbox from paragraphs array when not explicitly provided
      if (!targetBbox && paragraphs && paragraphs.length > 0) {
        const matchingPara =
          paragraphs.find((p) => p.id === targetId) ||
          paragraphs.find(
            (p) =>
              p.bbox?.page === targetPage &&
              cit.snippet &&
              p.text.toLowerCase().includes(cit.snippet.slice(0, 30).toLowerCase())
          );
        if (matchingPara?.bbox) {
          targetBbox = matchingPara.bbox;
          targetId = matchingPara.id;
        }
      }

      if (targetBbox && targetPage) {
        navigateToParagraph(targetId, { page: targetPage, ...targetBbox });
      } else {
        navigateToParagraph(targetId);
      }

      setCurrentPage(targetPage);

      // Scroll PDF page into view
      const pdfEl = document.getElementById(`pdf-page-${targetPage}`);
      if (pdfEl) pdfEl.scrollIntoView({ behavior: "smooth", block: "start" });

      // Scroll transcript section to this paragraph
      const transEl =
        document.getElementById(`transcript-para-${targetId}`) ||
        document.getElementById(`transcript-seg-${targetId}`) ||
        document.getElementById(targetId);
      transEl?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    [paragraphs, navigateToParagraph, setCurrentPage]
  );

  /* ═══════════════════════════════════════════════════════════════════════
     Render
  ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div
      className="glass-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        background: "rgba(10, 15, 29, 0.85)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderRadius: "20px",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        boxShadow: "0 12px 40px rgba(0, 0, 0, 0.45)",
        overflow: "hidden",
      }}
    >
      {/* ── Header: Title + Listening Mode Toggle ─────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          background: "rgba(8, 12, 22, 0.95)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.07)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: "var(--text-primary)",
            fontFamily: "var(--font-heading)",
          }}
        >
          ASK RIFT
        </span>

        {/* Copilot Active badge */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "9.5px",
            fontFamily: "var(--font-mono)",
            color: "#34d399",
            background: "rgba(16, 185, 129, 0.12)",
            padding: "2px 6px",
            borderRadius: "4px",
            border: "1px solid rgba(16, 185, 129, 0.25)",
          }}
        >
          <span style={{ fontSize: "7px" }}>●</span> Copilot
        </span>

        <div style={{ flex: 1 }} />

        {/* Listening Mode Toggle */}
        <button
          type="button"
          onClick={toggleListeningMode}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
            padding: "3px 8px",
            borderRadius: "6px",
            cursor: "pointer",
            transition: "all 0.15s ease",
            background: listeningMode
              ? "linear-gradient(135deg, rgba(6, 182, 212, 0.25), rgba(16, 185, 129, 0.25))"
              : "rgba(255, 255, 255, 0.05)",
            border: listeningMode
              ? "1px solid rgba(34, 211, 238, 0.5)"
              : "1px solid rgba(255, 255, 255, 0.1)",
            color: listeningMode ? "#22d3ee" : "#94a3b8",
            boxShadow: listeningMode ? "0 0 12px rgba(6, 182, 212, 0.3)" : "none",
          }}
          title={
            listeningMode
              ? "Listening Mode ACTIVE: Continuously listens and auto-sends when you speak"
              : "Enable Listening Mode: Continuous real-time voice interaction with noise rejection"
          }
        >
          <Radio size={11} className={listeningMode ? "animate-pulse text-cyan-400" : ""} />
          <span>{listeningMode ? "Listening ON" : "Listening OFF"}</span>
        </button>
      </div>

      {/* ── Message List ──────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "14px 12px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {messages.length === 0 ? (
          /* Empty state */
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-secondary)",
              fontSize: "13px",
              textAlign: "center",
              gap: "10px",
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "12px",
                background: "rgba(6, 182, 212, 0.12)",
                border: "1px solid rgba(34, 211, 238, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Sparkles size={20} color="#38bdf8" />
            </div>
            <div>
              <div style={{ fontWeight: 600, color: "#f1f5f9", marginBottom: "4px" }}>
                Grounded PDF Intelligence
              </div>
              <div style={{ fontSize: "11px", color: "#64748b", maxWidth: "260px" }}>
                Type or speak a question. Answers are cross-grounded with PDF chunks and
                web citations.
              </div>
            </div>

            {/* Quick starter chips */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                marginTop: "8px",
                width: "100%",
                maxWidth: "280px",
              }}
            >
              {[
                "Summarize the key findings",
                "What are the main methodology steps?",
                "Explain conclusions",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => submitQuestion(q)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "8px",
                    background: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    color: "#cbd5e1",
                    fontSize: "11px",
                    textAlign: "left",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "rgba(6, 182, 212, 0.15)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                      "rgba(34, 211, 238, 0.3)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "rgba(255, 255, 255, 0.04)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                      "rgba(255, 255, 255, 0.08)";
                  }}
                >
                  § {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Message bubbles */
          messages.map((msg) => {
            const isUser = msg.role === "user";
            const isDictating = dictatingMsgId === msg.id;

            return (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: isUser ? "flex-end" : "flex-start",
                  gap: "4px",
                }}
              >
                <span
                  style={{
                    fontSize: "9.5px",
                    fontFamily: "var(--font-mono)",
                    color: isUser ? "#818cf8" : "#38bdf8",
                  }}
                >
                  {isUser ? "You" : "RIFT AI"}
                </span>

                <div
                  style={{
                    maxWidth: "92%",
                    padding: "10px 13px",
                    borderRadius: isUser
                      ? "16px 4px 16px 16px"
                      : "4px 16px 16px 16px",
                    background: isUser
                      ? "linear-gradient(135deg, rgba(79, 70, 229, 0.3), rgba(30, 27, 75, 0.6))"
                      : "linear-gradient(135deg, rgba(8, 47, 73, 0.5), rgba(15, 23, 42, 0.8))",
                    border: isUser
                      ? "1px solid rgba(99, 102, 241, 0.35)"
                      : "1px solid rgba(34, 211, 238, 0.3)",
                    boxShadow: isUser
                      ? "0 4px 16px rgba(79, 70, 229, 0.15)"
                      : "0 4px 20px rgba(6, 182, 212, 0.12)",
                    fontSize: "13px",
                    lineHeight: "1.6",
                    color: "#f1f5f9",
                    position: "relative",
                  }}
                >
                  {/* Replay dictation button on AI card */}
                  {!isUser && !msg.isLoading && (
                    <button
                      onClick={() => dictateAnswer(msg.id, msg.text)}
                      style={{
                        position: "absolute",
                        top: "8px",
                        right: "8px",
                        width: "22px",
                        height: "22px",
                        borderRadius: "5px",
                        border: "none",
                        background: isDictating
                          ? "rgba(6, 182, 212, 0.3)"
                          : "rgba(255, 255, 255, 0.06)",
                        color: isDictating ? "#22d3ee" : "#64748b",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      title={isDictating ? "Stop reading" : "Read aloud with word highlighting"}
                    >
                      {isDictating ? <VolumeX size={11} /> : <Volume2 size={11} />}
                    </button>
                  )}

                  {msg.isLoading ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "4px 0",
                      }}
                    >
                      <ThinkingWave />
                      <span
                        style={{
                          fontSize: "11px",
                          color: "#38bdf8",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        Synthesizing grounded answer&hellip;
                      </span>
                    </div>
                  ) : isDictating ? (
                    <AnswerKaraokeText
                      text={msg.text}
                      wordsTimeline={answerTimeline}
                      currentTime={answerCurrentTime}
                      isPlaying={true}
                      onSeekWord={(sec) => {
                        if (answerAudioRef.current) {
                          answerAudioRef.current.currentTime = sec;
                          setAnswerCurrentTime(sec);
                        }
                      }}
                    />
                  ) : (
                    <div>{msg.text}</div>
                  )}
                </div>

                {/* Sources / Citations row */}
                {!isUser &&
                  !msg.isLoading &&
                  msg.citations &&
                  msg.citations.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "5px",
                        marginTop: "3px",
                        paddingLeft: "2px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "9.5px",
                          fontFamily: "var(--font-mono)",
                          color: "#64748b",
                          alignSelf: "center",
                        }}
                      >
                        Sources:
                      </span>
                      {msg.citations.map((c) => (
                        <CitationChip
                          key={c.id}
                          citation={c}
                          onNavigate={handleCitationClick}
                        />
                      ))}
                    </div>
                  )}
              </div>
            );
          })
        )}
        <div ref={listEndRef} />
      </div>

      {/* ── Input Row: text box + mic + send ──────────────────────────── */}
      <div
        style={{
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          background: "rgba(8, 12, 22, 0.95)",
          padding: "8px 12px 10px",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          flexShrink: 0,
        }}
      >
        {/* ── Mic permission / browser error ── */}
        {micError && (
          <div
            style={{
              fontSize: "10.5px",
              fontFamily: "var(--font-mono)",
              color: "#f87171",
              padding: "4px 8px",
              background: "rgba(239, 68, 68, 0.1)",
              borderRadius: "6px",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span>⚠</span>
            <span style={{ flex: 1, lineHeight: "1.35" }}>{micError}</span>
            <button
              type="button"
              onClick={() => setMicError(null)}
              style={{
                marginLeft: "auto",
                background: "none",
                border: "none",
                color: "#f87171",
                cursor: "pointer",
                fontSize: "11px",
              }}
              aria-label="Dismiss microphone error"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Live speech preview (opens immediately when Mic / Listening is active) ── */}
        {(listeningMode || isRecordingOnce || micStatus === "transcribing") && (
          <div
            style={{
              fontSize: "10.5px",
              fontFamily: "var(--font-mono)",
              color: voiceTranscript ? "#38bdf8" : "#94a3b8",
              fontStyle: voiceTranscript ? "normal" : "italic",
              padding: "5px 8px",
              background: voiceTranscript
                ? "rgba(6, 182, 212, 0.08)"
                : "rgba(255, 255, 255, 0.04)",
              borderRadius: "6px",
              border: voiceTranscript
                ? "1px solid rgba(6, 182, 212, 0.25)"
                : "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              minHeight: "28px",
              maxHeight: "64px",
              overflowY: "auto",
              transition: "all 0.2s ease",
            }}
          >
            <WaveformAnimation
              active={
                micStatus === "listening" ||
                micStatus === "hearing" ||
                micStatus === "fallback"
              }
              bars={6}
              color={micStatus === "fallback" ? "#f87171" : "#22d3ee"}
              height={14}
            />
            {micStatus === "transcribing" ? (
              <span style={{ color: "#38bdf8" }}>Transcribing recorded speech…</span>
            ) : voiceTranscript ? (
              <span style={{ wordBreak: "break-word" }}>&ldquo;{voiceTranscript}&rdquo;</span>
            ) : micStatus === "fallback" ? (
              <span style={{ color: "#fca5a5" }}>
                Recording audio — speak clearly, click Mic again to transcribe…
              </span>
            ) : micStatus === "hearing" ? (
              <span style={{ color: "#38bdf8" }}>Hearing speech…</span>
            ) : micStatus === "listening" ? (
              <span style={{ color: "#94a3b8" }}>Mic active — speak now…</span>
            ) : (
              <span style={{ color: "#64748b" }}>Starting microphone…</span>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: "6px", alignItems: "flex-end" }}>
          {/* Text input pill */}
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              borderRadius: "20px",
              border: isRecordingOnce
                ? "1px solid rgba(248, 113, 113, 0.5)"
                : listeningMode
                ? "1px solid rgba(34, 211, 238, 0.45)"
                : "1px solid rgba(255, 255, 255, 0.12)",
              background: "rgba(15, 23, 42, 0.8)",
              padding: "0 10px",
              transition: "border-color 0.2s ease",
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                const val = e.target.value;
                setInput(val);
                currentInputRef.current = val;
                // Preserve manual edits as new base so voice continues after user typing
                baseTextRef.current = val;
                sessionCommittedRef.current = "";

                // If Web Speech is currently active, restart cleanly so old session
                // e.results don't overwrite the user's manual edit
                if (
                  activeModeRef.current !== "none" &&
                  !usingFallbackRef.current
                ) {
                  if (editRestartTimerRef.current) {
                    clearTimeout(editRestartTimerRef.current);
                  }
                  editRestartTimerRef.current = setTimeout(() => {
                    if (
                      activeModeRef.current !== "none" &&
                      !usingFallbackRef.current
                    ) {
                      startSpeechSession();
                    }
                  }, 250);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitQuestion(input);
                }
              }}
              placeholder={
                listeningMode
                  ? "Listening actively… (or type your question)"
                  : isRecordingOnce
                  ? "Listening… speak your question (or type)"
                  : "Ask a question about the PDF… (Enter to send)"
              }
              rows={1}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                padding: "8px 0",
                color: "#f8fafc",
                fontSize: "12px",
                resize: "none",
                fontFamily: "inherit",
                lineHeight: "1.4",
                maxHeight: "60px",
              }}
            />

            {/* Mic button inside pill */}
            <button
              type="button"
              onClick={toggleVoiceInput}
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                border: "none",
                background: isRecordingOnce
                  ? "rgba(239, 68, 68, 0.25)"
                  : listeningMode
                  ? "rgba(6, 182, 212, 0.2)"
                  : "transparent",
                color: isRecordingOnce
                  ? "#f87171"
                  : listeningMode
                  ? "#22d3ee"
                  : "#94a3b8",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "all 0.15s ease",
              }}
              title={
                listeningMode
                  ? "Listening mode is currently on"
                  : isRecordingOnce
                  ? "Stop voice typing"
                  : "Click to speak question"
              }
            >
              {isRecordingOnce ? <MicOff size={13} /> : <Mic size={13} />}
            </button>
          </div>

          {/* Send button */}
          <button
            type="button"
            onClick={() => submitQuestion(input)}
            disabled={!input.trim() || isSubmitting}
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "50%",
              border: "none",
              background: input.trim()
                ? "linear-gradient(135deg, #06b6d4, #2563eb)"
                : "rgba(255, 255, 255, 0.06)",
              color: "#fff",
              cursor: input.trim() && !isSubmitting ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              opacity: input.trim() ? 1 : 0.4,
              transition: "all 0.15s ease",
              boxShadow: input.trim() ? "0 0 12px rgba(6, 182, 212, 0.4)" : "none",
            }}
            title="Send query"
          >
            {isSubmitting ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Send size={13} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
