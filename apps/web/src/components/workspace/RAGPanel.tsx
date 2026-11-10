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
import type { Citation, RAGMessage } from "@/lib/workspace";
import WaveformAnimation from "./WaveformAnimation";

function genId() {
  return Math.random().toString(36).slice(2);
}

/* ── Blinking stream cursor ─────────────────────────────────────────────────── */
function StreamCursor() {
  return (
    <span
      className="stream-cursor"
      style={{
        display: "inline-block",
        width: "2px",
        height: "14px",
        background: "#38bdf8",
        marginLeft: "3px",
        verticalAlign: "text-bottom",
        borderRadius: "1px",
      }}
    />
  );
}

/* ── Wavebars thinking indicator ─────────────────────────────────────────────── */
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

/* ── ElevenLabs Word-by-Word Karaoke Highlighting for Answers ───────────────── */
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
          const isCurrent = isPlaying && currentTime >= item.start && currentTime <= item.end + 0.05;
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

  return <div style={{ lineHeight: "1.7", fontSize: "13px", color: "#f1f5f9" }}>{text}</div>;
}

/* ── Citation Chip: PDF (cyan) / Web (indigo) ─────────────────────────────────── */
function CitationChip({
  citation,
  onNavigate,
}: {
  citation: Citation;
  onNavigate: (c: Citation) => void;
}) {
  const isWeb = !!citation.url || (citation as any).source === "web";
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
          border: isWeb ? "1px solid rgba(99, 102, 241, 0.4)" : "1px solid rgba(6, 182, 212, 0.35)",
          background: isWeb ? "rgba(99, 102, 241, 0.15)" : "rgba(6, 182, 212, 0.12)",
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

      {/* Tooltip with snippet or url */}
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
              <div style={{ fontWeight: 600, color: "#38bdf8" }}>Jump to Page {citation.page} in PDF</div>
              {citation.snippet && (
                <div style={{ fontSize: "9px", color: "#94a3b8", marginTop: "3px", lineHeight: "1.4" }}>
                  &ldquo;{citation.snippet.slice(0, 110)}…&rdquo;
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Main RAGPanel Component
════════════════════════════════════════════════════════════════════════════════ */
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

  // Input & state
  const [input, setInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [listeningMode, setListeningMode] = useState(false);
  const [isRecordingOnce, setIsRecordingOnce] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  // Audio dictation for answers
  const answerAudioRef = useRef<HTMLAudioElement | null>(null);
  const [dictatingMsgId, setDictatingMsgId] = useState<string | null>(null);
  const [answerCurrentTime, setAnswerCurrentTime] = useState(0);
  const [answerTimeline, setAnswerTimeline] = useState<WordTimestamp[]>([]);

  // Speech Recognition & Hardware Audio refs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isListeningModeActiveRef = useRef(false);
  const isRecordingOnceActiveRef = useRef(false);
  const baseTextRef = useRef<string>("");
  const currentInputRef = useRef<string>("");
  const isRecognizingRef = useRef<boolean>(false);

  // Safe recognition start/stop helpers to prevent Chrome InvalidStateError
  const safeStartRecognition = useCallback(() => {
    if (!recognitionRef.current) return;
    if (isRecognizingRef.current) return;
    try {
      recognitionRef.current.start();
    } catch (err: any) {
      if (err.name !== "InvalidStateError") {
        console.warn("SpeechRec start error:", err);
      }
    }
  }, []);

  const safeStopRecognition = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch {}
    isRecognizingRef.current = false;
  }, []);

  // Auto-scroll message list
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, dictatingMsgId]);

  /* ── Dictate AI Answer with ElevenLabs ─────────────────────────────────── */
  const dictateAnswer = useCallback(
    async (msgId: string, text: string) => {
      if (dictatingMsgId === msgId) {
        // Toggle pause/stop
        answerAudioRef.current?.pause();
        setDictatingMsgId(null);
        return;
      }

      setDictatingMsgId(msgId);
      try {
        const cleanText = text.replace(/\[\d+\]/g, "").replace(/§[^\n]+/g, "").trim();
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

  /* ── Acquire Clean Hardware Audio Stream ────────────────────────────────── */
  const getCleanMicStream = useCallback(async () => {
    if (micStreamRef.current && micStreamRef.current.active) {
      return micStreamRef.current;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      });
      micStreamRef.current = stream;
      return stream;
    } catch (err) {
      console.warn("Could not acquire audio stream with constraints:", err);
      return null;
    }
  }, []);

  /* ── MediaRecorder Fallback Audio Buffering ─────────────────────────────── */
  const startMediaRecording = useCallback(async () => {
    try {
      const stream = await getCleanMicStream();
      if (!stream) return;
      audioChunksRef.current = [];
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      mr.start(250);
      mediaRecorderRef.current = mr;
    } catch (err) {
      console.warn("MediaRecorder start error:", err);
    }
  }, [getCleanMicStream]);

  const stopMediaRecordingAndTranscribe = useCallback(async (): Promise<string> => {
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr || mr.state === "inactive") {
        resolve("");
        return;
      }
      mr.onstop = async () => {
        try {
          if (audioChunksRef.current.length === 0) {
            resolve("");
            return;
          }
          const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          audioChunksRef.current = [];
          if (blob.size < 500) {
            resolve("");
            return;
          }
          const text = await transcribeAudio(blob);
          resolve(text);
        } catch {
          resolve("");
        }
      };
      try {
        mr.stop();
      } catch {
        resolve("");
      }
    });
  }, []);

  /* ── Handle Question Submission ────────────────────────────────────────── */
  const submitQuestion = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed || isSubmitting) return;

      const userMsgId = genId();
      const aiMsgId = genId();

      // If one-shot recording was active, stop recording upon sending
      if (isRecordingOnceActiveRef.current) {
        setIsRecordingOnce(false);
        isRecordingOnceActiveRef.current = false;
        safeStopRecognition();
      }

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);

      addMessage({ id: userMsgId, role: "user", text: trimmed });
      setInput("");
      currentInputRef.current = "";
      baseTextRef.current = "";
      setVoiceTranscript("");
      setIsSubmitting(true);

      addMessage({
        id: aiMsgId,
        role: "assistant",
        text: "",
        isLoading: true,
      });

      try {
        let answerText = "";
        let citations: Citation[] = [];

        if (activeDocId) {
          const res = await queryDocument(activeDocId, trimmed, undefined, undefined, paragraphs, pdfUrl || undefined);
          answerText = res.answer;
          citations = (res.citations || []).map((c: any) => ({
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
          citations = [
            { id: "c-1", label: "§ Page 1 · Overview", page: 1 },
          ];
        }

        updateMessage(aiMsgId, {
          text: answerText,
          citations,
          isLoading: false,
        });

        // Auto-scroll to first cited PDF paragraph with bbox
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

        // Auto-start dictation using active transcript voice with word-level highlighting
        dictateAnswer(aiMsgId, answerText);
      } catch (err: any) {
        updateMessage(aiMsgId, {
          text: `Could not retrieve answer: ${err.message || "Request failed"}`,
          isLoading: false,
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [activeDocId, isSubmitting, addMessage, updateMessage, navigateToParagraph, dictateAnswer, paragraphs, pdfUrl, safeStopRecognition]
  );

  /* ── Helper to cleanly join base text with new voice segment ────────────── */
  const combineSpeechWithBase = useCallback((base: string, speech: string): string => {
    const cleanBase = base.trim();
    const cleanSpeech = speech.trim();
    if (!cleanBase) return cleanSpeech;
    if (!cleanSpeech) return cleanBase;
    return `${cleanBase} ${cleanSpeech}`;
  }, []);

  /* ── Speech Recognition & Continuous Voice Typing Setup ─────────────────── */
  useEffect(() => {
    if (typeof window === "undefined") return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onstart = () => {
      isRecognizingRef.current = true;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let sessionFinal = "";
      let sessionInterim = "";

      // Accumulate across all results in this session from 0 to e.results.length - 1
      for (let i = 0; i < e.results.length; ++i) {
        const item = e.results[i];
        const text = item[0]?.transcript || "";
        if (item.isFinal) {
          if (sessionFinal && !sessionFinal.endsWith(" ") && !text.startsWith(" ")) {
            sessionFinal += " ";
          }
          sessionFinal += text;
        } else {
          if (sessionInterim && !sessionInterim.endsWith(" ") && !text.startsWith(" ")) {
            sessionInterim += " ";
          }
          sessionInterim += text;
        }
      }

      const finalTrimmed = sessionFinal.trim();
      const interimTrimmed = sessionInterim.trim();
      const sessionSpeech = [finalTrimmed, interimTrimmed].filter(Boolean).join(" ");

      // Seamlessly join with existing text so previous speech is NEVER overwritten
      const fullText = combineSpeechWithBase(baseTextRef.current, sessionSpeech);

      if (fullText) {
        setInput(fullText);
        currentInputRef.current = fullText;
        setVoiceTranscript(sessionSpeech || fullText);

        // Keep textarea scrolled to the end as words are spoken
        if (inputRef.current) {
          inputRef.current.scrollTop = inputRef.current.scrollHeight;
        }

        // In continuous listening mode, auto-submit after user finishes speaking (2.5s silence)
        if (isListeningModeActiveRef.current) {
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            if (isListeningModeActiveRef.current && currentInputRef.current.trim()) {
              submitQuestion(currentInputRef.current.trim());
            }
          }, 2500);
        }
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      const errType = e?.error;
      // Normal speech pauses or aborts must not cancel recording
      if (errType === "no-speech" || errType === "aborted") {
        return;
      }
      console.warn("SpeechRec error:", errType);
      if (errType === "not-allowed" || errType === "service-not-allowed") {
        setIsRecordingOnce(false);
        isRecordingOnceActiveRef.current = false;
        setListeningMode(false);
        isListeningModeActiveRef.current = false;
        isRecognizingRef.current = false;
      }
    };

    rec.onend = () => {
      isRecognizingRef.current = false;

      // Commit whatever text was accumulated into baseTextRef so the next utterance continues typing where previous ended
      if (currentInputRef.current.trim()) {
        baseTextRef.current = currentInputRef.current.trim();
      }

      // If continuous listening or one-shot voice typing is still active, restart smoothly
      if (isListeningModeActiveRef.current || isRecordingOnceActiveRef.current) {
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        restartTimerRef.current = setTimeout(() => {
          if (
            (isListeningModeActiveRef.current || isRecordingOnceActiveRef.current) &&
            !isRecognizingRef.current
          ) {
            try {
              rec.start();
            } catch (err: any) {
              if (err.name !== "InvalidStateError") {
                console.warn("SpeechRec restart error:", err);
              }
            }
          }
        }, 200);
      }
    };

    recognitionRef.current = rec;

    return () => {
      try {
        rec.stop();
      } catch {}
      isRecognizingRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, [submitQuestion, combineSpeechWithBase]);

  // Toggle Listening Mode (continuous listening & auto-send)
  const toggleListeningMode = useCallback(async () => {
    setListeningMode((prev) => {
      const next = !prev;
      isListeningModeActiveRef.current = next;
      if (next) {
        baseTextRef.current = currentInputRef.current.trim();
        getCleanMicStream().then(() => {
          safeStartRecognition();
        });
      } else {
        safeStopRecognition();
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        if (micStreamRef.current) {
          micStreamRef.current.getTracks().forEach((t) => t.stop());
          micStreamRef.current = null;
        }
      }
      return next;
    });
  }, [getCleanMicStream, safeStartRecognition, safeStopRecognition]);

  // One-shot Voice Input Toggle (voice typing with continuous append & Gemini Flash STT fallback)
  const toggleVoiceInput = useCallback(async () => {
    if (listeningMode) return; // listening mode is already continuously on

    if (isRecordingOnce) {
      setIsRecordingOnce(false);
      isRecordingOnceActiveRef.current = false;
      safeStopRecognition();
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);

      // If Web Speech API didn't produce text, fallback to Gemini Flash STT
      const fallbackText = await stopMediaRecordingAndTranscribe();
      if (fallbackText) {
        const cur = currentInputRef.current.trim();
        const base = baseTextRef.current.trim();
        if (!cur || cur === base) {
          const combined = combineSpeechWithBase(base, fallbackText);
          setInput(combined);
          currentInputRef.current = combined;
          baseTextRef.current = combined;
          setVoiceTranscript(fallbackText);
        }
      }
      baseTextRef.current = currentInputRef.current.trim();
    } else {
      setIsRecordingOnce(true);
      isRecordingOnceActiveRef.current = true;
      baseTextRef.current = currentInputRef.current.trim();

      await getCleanMicStream();
      startMediaRecording();
      safeStartRecognition();
    }
  }, [
    listeningMode,
    isRecordingOnce,
    getCleanMicStream,
    startMediaRecording,
    stopMediaRecordingAndTranscribe,
    safeStartRecognition,
    safeStopRecognition,
    combineSpeechWithBase,
  ]);

  // Citation click handler: navigates PDF viewer and highlights corresponding transcript section
  const handleCitationClick = useCallback(
    (cit: Citation) => {
      if (cit.url) {
        window.open(cit.url, "_blank", "noopener,noreferrer");
        return;
      }

      const targetPage = cit.page || 1;
      let targetBbox = cit.bbox;
      let targetId = cit.paragraphId || cit.id;

      // If citation doesn't have an explicit bbox, search paragraphs for matching text or id
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
        navigateToParagraph(targetId, {
          page: targetPage,
          ...targetBbox,
        });
      } else {
        navigateToParagraph(targetId);
      }

      setCurrentPage(targetPage);
      const el = document.getElementById(`pdf-page-${targetPage}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }

      // Also scroll the transcript section to this paragraph if rendered
      const transEl =
        document.getElementById(`transcript-para-${targetId}`) ||
        document.getElementById(`transcript-seg-${targetId}`) ||
        document.getElementById(targetId);
      transEl?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    [paragraphs, navigateToParagraph, setCurrentPage]
  );

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
      {/* ── Header Row: Title + Status + Listening Mode Toggle ── */}
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

        {/* Single Listening Mode Toggle Button */}
        <button
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

      {/* ── Message List ── */}
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
                Type or speak a question. Answers are cross-grounded with PDF chunks and web citations.
              </div>
            </div>

            {/* Quick starter chips */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px", width: "100%", maxWidth: "280px" }}>
              {["Summarize the key findings", "What are the main methodology steps?", "Explain conclusions"].map((q) => (
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
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(6, 182, 212, 0.15)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(34, 211, 238, 0.3)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255, 255, 255, 0.04)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255, 255, 255, 0.08)";
                  }}
                >
                  § {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
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
                    borderRadius: isUser ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
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
                        background: isDictating ? "rgba(6, 182, 212, 0.3)" : "rgba(255, 255, 255, 0.06)",
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
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 0" }}>
                      <ThinkingWave />
                      <span style={{ fontSize: "11px", color: "#38bdf8", fontFamily: "var(--font-mono)" }}>
                        Synthesizing grounded answer…
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
                {!isUser && !msg.isLoading && msg.citations && msg.citations.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "5px",
                      marginTop: "3px",
                      paddingLeft: "2px",
                    }}
                  >
                    <span style={{ fontSize: "9.5px", fontFamily: "var(--font-mono)", color: "#64748b", alignSelf: "center" }}>
                      Sources:
                    </span>
                    {msg.citations.map((c) => (
                      <CitationChip key={c.id} citation={c} onNavigate={handleCitationClick} />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={listEndRef} />
      </div>

      {/* ── Unified Input Row: ONE text box + ONE voice input button + ONE send button ── */}
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
        {/* Live speech preview if user is speaking */}
        {(listeningMode || isRecordingOnce) && voiceTranscript && (
          <div
            style={{
              fontSize: "10.5px",
              fontFamily: "var(--font-mono)",
              color: "#38bdf8",
              fontStyle: "italic",
              padding: "2px 6px",
              background: "rgba(6, 182, 212, 0.08)",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span className="animate-pulse">●</span>
            <span>&ldquo;{voiceTranscript}&rdquo;</span>
          </div>
        )}

        <div style={{ display: "flex", gap: "6px", alignItems: "flex-end" }}>
          {/* Main Text Input Pill */}
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              borderRadius: "20px",
              border: "1px solid rgba(255, 255, 255, 0.12)",
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
                baseTextRef.current = val;
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

            {/* Voice Input Button inside pill */}
            <button
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
                color: isRecordingOnce ? "#f87171" : listeningMode ? "#22d3ee" : "#94a3b8",
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
                  ? "Stop recording"
                  : "Click to speak question"
              }
            >
              {isRecordingOnce ? <MicOff size={13} /> : <Mic size={13} />}
            </button>
          </div>

          {/* Send Button */}
          <button
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
            {isSubmitting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          </button>
        </div>
      </div>
    </div>              
  );
}
