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
  Square,
  Play,
  Pause,
  ExternalLink,
  FileText,
  Sparkles,
  Radio,
  Loader2,
  RotateCcw,
  RotateCw,
  Pencil,
  Trash2,
  Copy,
  Check,
  Plus,
  ChevronDown,
  MessageSquare,
  SlidersHorizontal,
  X,
  Image as ImageIcon,
} from "lucide-react";
import {
  queryDocument,
  synthesizeElevenLabs,
  transcribeAudio,
  listConversations,
  createConversation,
  getConversation,
  updateConversation,
  deleteConversation,
  queryConversation,
  editConversationMessage,
  retryConversationMessage,
  deleteConversationMessage,
  type ConversationItem,
  type WordTimestamp,
} from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import type { Citation, RAGMessage } from "@/lib/workspace";
import WaveformAnimation from "./WaveformAnimation";
import { ChatGPTVoiceInterface } from "./VoiceVisualizer";
import {
  BrowserSpeechController,
  cancelAllBrowserSpeech,
  sanitizeSpeechText,
  type SpeechWordToken,
} from "@/lib/browserSpeech";
import { WordKaraokeText } from "./WordKaraokeText";
import { MarkdownMessage } from "./MarkdownMessage";
import { convertMathToSpokenText, convertMathToSpokenTextKeepCues } from "@/lib/markdownSpeech";

type ResponseLengthPreset = "auto" | "concise" | "detailed";

const LENGTH_PREFIX_CONCISE =
  "Response length preference: CONCISE (keep answers brief, direct, and to the point).";
const LENGTH_PREFIX_DETAILED =
  "Response length preference: DETAILED (provide comprehensive, thorough explanations with clear structure).";

function parseThreadStylePrompt(raw?: string | null): {
  preset: ResponseLengthPreset;
  customInstruction: string;
} {
  const trimmed = (raw || "").trim();
  if (!trimmed) {
    return { preset: "auto", customInstruction: "" };
  }
  if (trimmed.startsWith(LENGTH_PREFIX_CONCISE)) {
    return {
      preset: "concise",
      customInstruction: trimmed.slice(LENGTH_PREFIX_CONCISE.length).trim(),
    };
  }
  if (trimmed.startsWith(LENGTH_PREFIX_DETAILED)) {
    return {
      preset: "detailed",
      customInstruction: trimmed.slice(LENGTH_PREFIX_DETAILED.length).trim(),
    };
  }
  return { preset: "auto", customInstruction: trimmed };
}

function serializeThreadStylePrompt(
  preset: ResponseLengthPreset,
  customInstruction: string
): string {
  const cleanCustom = customInstruction.trim();
  const prefix =
    preset === "concise"
      ? LENGTH_PREFIX_CONCISE
      : preset === "detailed"
      ? LENGTH_PREFIX_DETAILED
      : "";
  if (prefix && cleanCustom) return `${prefix}\n${cleanCustom}`;
  return prefix || cleanCustom;
}

function genId() {
  return Math.random().toString(36).slice(2);
}

const RAG_INPUT_MIN_HEIGHT_PX = 34;
const RAG_INPUT_LINE_HEIGHT_PX = 18;
const RAG_INPUT_MAX_LINES = 4;
const RAG_INPUT_PADDING_Y_PX = 16;
const RAG_INPUT_MAX_HEIGHT_PX =
  RAG_INPUT_LINE_HEIGHT_PX * RAG_INPUT_MAX_LINES + RAG_INPUT_PADDING_Y_PX; // 88px = 4 lines

/* ── Blinking stream cursor ─────────────────────────────────────────────────── */
function StreamCursor() {
  return (
    <span
      className="stream-cursor"
      style={{
        display: "inline-block",
        width: "2px",
        height: "14px",
        background: "#00f5d4",
        boxShadow: "0 0 8px rgba(0, 245, 212, 0.7)",
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
            background: "#00f5d4",
            borderRadius: "2px",
            animationDelay: `${i * 0.12}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ── Smart Linguistic Patience for Continuous Speech ───────────────────────── */
function computeSilenceDelay(rawText: string): number {
  const text = rawText.trim().toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1600;

  const lastWord = words[words.length - 1].replace(/[^a-z0-9]/g, "");

  // Common continuation connectors
  const continuationWords = new Set([
    "and", "or", "but", "so", "because", "the", "a", "an", "in", "on", "at", "to",
    "for", "of", "with", "from", "by", "as", "about", "that", "which", "who", "whom",
    "if", "then", "like", "also", "into", "than", "since", "while", "though"
  ]);

  // If user ends on a trailing connector -> give 2200ms
  if (continuationWords.has(lastWord)) {
    return 2200;
  }

  // If ends with punctuation (?, ., !) -> 1300ms snappy response
  if (/[?.!]$/.test(rawText.trim())) {
    return 1300;
  }

  // Standard natural conversational pause delay: 1600ms
  return 1600;
}

/* ── In-App Confirmation Modal (replaces window.confirm) ─────────────────────── */
function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirm",
  confirmDanger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  confirmDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(6px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        style={{
          background: "rgba(10, 15, 20, 0.97)",
          border: "1px solid rgba(0, 245, 212, 0.25)",
          borderRadius: "12px",
          padding: "20px 24px",
          maxWidth: "360px",
          width: "90%",
          boxShadow:
            "0 20px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(0, 245, 212, 0.08)",
        }}
      >
        <div
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "#e2e8f0",
            marginBottom: "8px",
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: "12.5px",
            color: "#94a3b8",
            lineHeight: "1.5",
            marginBottom: "18px",
          }}
        >
          {message}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
          }}
        >
          <button
            onClick={onCancel}
            style={{
              padding: "6px 14px",
              borderRadius: "7px",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              background: "rgba(255, 255, 255, 0.06)",
              color: "#94a3b8",
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "6px 14px",
              borderRadius: "7px",
              border: confirmDanger
                ? "1px solid rgba(239, 68, 68, 0.5)"
                : "1px solid rgba(0, 245, 212, 0.5)",
              background: confirmDanger
                ? "rgba(239, 68, 68, 0.18)"
                : "rgba(0, 245, 212, 0.15)",
              color: confirmDanger ? "#fca5a5" : "#00f5d4",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Citation Chip: PDF (luminous teal) / Web (aquamarine) ───────────────────── */
function CitationChip({
  citation,
  index,
  onNavigate,
}: {
  citation: Citation;
  index?: number;
  onNavigate: (c: Citation) => void;
}) {
  const isWeb = !!citation.url || citation.source === "web";
  const isImage = !isWeb && (citation.chunkType === "image" || citation.chunkType === "figure" || citation.chunkType === "diagram");
  const displayNum = citation.number ?? index;
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
          border: isWeb ? "1px solid rgba(45, 212, 191, 0.45)" : "1px solid rgba(0, 245, 212, 0.45)",
          background: isWeb ? "rgba(13, 148, 136, 0.16)" : "rgba(0, 245, 212, 0.12)",
          color: isWeb ? "#5eead4" : "#00f5d4",
          fontSize: "10.5px",
          fontFamily: "var(--font-mono)",
          fontWeight: 500,
          cursor: "pointer",
          transition: "all 0.15s ease",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.4)",
        }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {displayNum !== undefined && (
          <span style={{ fontWeight: 700, opacity: 0.92 }}>[{displayNum}]</span>
        )}
        {isWeb ? <ExternalLink size={10} /> : isImage ? <ImageIcon size={10} /> : <FileText size={10} />}
        {citation.label}
      </button>

      {/* Tooltip with snippet or url */}
      {showTooltip && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 5px)",
            left: 0,
            background: "rgba(2, 6, 10, 0.98)",
            border: `1px solid ${isWeb ? "rgba(45, 212, 191, 0.5)" : "rgba(0, 245, 212, 0.5)"}`,
            borderRadius: "6px",
            padding: "5px 8px",
            fontSize: "10px",
            color: isWeb ? "#99f6e4" : "#a7f3d0",
            whiteSpace: "normal",
            maxWidth: "240px",
            zIndex: 60,
            boxShadow: "0 8px 30px rgba(0, 0, 0, 0.85), 0 0 15px rgba(0, 245, 212, 0.2)",
            pointerEvents: "none",
          }}
        >
          {citation.url ? (
            <div style={{ wordBreak: "break-all" }}>{citation.url}</div>
          ) : (
            <div>
              <div style={{ fontWeight: 600, color: "#00f5d4" }}>Jump to Page {citation.page} in PDF</div>
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
    setMessages,
    deleteMessagesFrom,
    clearChatHistory,
    setConversations,
    navigateToParagraph,
    setCurrentPage,
    selectedElevenVoice,
    selectedLang,
    selectedVoice,
    voiceEngine,
    triggerVoiceFallback,
    paragraphs,
    activeChatReference,
    setActiveChatReference,
  } = useWorkspace();

  const activeDocId = docId || workspaceDocId || "";

  // Multi-thread database state
  const [threads, setThreads] = useState<ConversationItem[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [isThreadDropdownOpen, setIsThreadDropdownOpen] = useState(false);
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [renamingThreadTitle, setRenamingThreadTitle] = useState("");
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editMsgContent, setEditMsgContent] = useState("");
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [retryingMsgId, setRetryingMsgId] = useState<string | null>(null);

  /* ── In-app confirm modal state (replaces window.confirm) ── */
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    confirmDanger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  } | null>(null);

  const activeThread = threads.find((t) => t.id === activeThreadId) || threads[0];

  const threadStyleKey = `${activeThread?.id || ""}:${activeThread?.system_prompt || ""}`;
  const persistedThreadStyle = parseThreadStylePrompt(activeThread?.system_prompt);
  const [openStylePopoverKey, setOpenStylePopoverKey] = useState<string | null>(null);
  const [draftThreadStyle, setDraftThreadStyle] = useState<{
    key: string;
    preset: ResponseLengthPreset;
    customInstruction: string;
  } | null>(null);
  const [isSavingThreadStyle, setIsSavingThreadStyle] = useState(false);

  const isStylePopoverOpen = openStylePopoverKey === threadStyleKey;
  const threadLengthPreset =
    draftThreadStyle && draftThreadStyle.key === threadStyleKey
      ? draftThreadStyle.preset
      : persistedThreadStyle.preset;
  const threadCustomInstruction =
    draftThreadStyle && draftThreadStyle.key === threadStyleKey
      ? draftThreadStyle.customInstruction
      : persistedThreadStyle.customInstruction;

  const setIsStylePopoverOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    setOpenStylePopoverKey((prevKey) => {
      const wasOpen = prevKey === threadStyleKey;
      const shouldOpen = typeof next === "function" ? next(wasOpen) : next;
      return shouldOpen ? threadStyleKey : null;
    });
  };

  const setThreadLengthPreset = (preset: ResponseLengthPreset) => {
    setDraftThreadStyle({
      key: threadStyleKey,
      preset,
      customInstruction: threadCustomInstruction,
    });
  };

  const setThreadCustomInstruction = (customInstruction: string) => {
    setDraftThreadStyle({
      key: threadStyleKey,
      preset: threadLengthPreset,
      customInstruction,
    });
  };

  const effectiveThreadInstruction = serializeThreadStylePrompt(
    threadLengthPreset,
    threadCustomInstruction
  );
  const hasCustomThreadStyle =
    threadLengthPreset !== "auto" || threadCustomInstruction.trim().length > 0;
  const effectiveThreadInstructionRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    effectiveThreadInstructionRef.current = effectiveThreadInstruction || undefined;
  }, [effectiveThreadInstruction]);

  const handleSaveThreadStyle = useCallback(
    async (
      nextPreset: ResponseLengthPreset = threadLengthPreset,
      nextCustom: string = threadCustomInstruction
    ) => {
      const nextPrompt = serializeThreadStylePrompt(nextPreset, nextCustom);
      setDraftThreadStyle({
        key: `${activeThreadId || ""}:${nextPrompt}`,
        preset: nextPreset,
        customInstruction: nextCustom,
      });
      effectiveThreadInstructionRef.current = nextPrompt || undefined;
      if (!activeThreadId) return;
      setIsSavingThreadStyle(true);
      try {
        const updated = await updateConversation(activeThreadId, {
          system_prompt: nextPrompt,
        });
        setThreads((prev) =>
          prev.map((t) => (t.id === activeThreadId ? { ...t, ...updated } : t))
        );
        setConversations((prev) =>
          prev.map((t) => (t.id === activeThreadId ? { ...t, ...updated } : t))
        );
        setDraftThreadStyle(null);
      } catch (err) {
        console.error("Failed to save thread style:", err);
      } finally {
        setIsSavingThreadStyle(false);
      }
    },
    [
      activeThreadId,
      threadLengthPreset,
      threadCustomInstruction,
      setConversations,
    ]
  );

  // Input & state
  const [input, setInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const lastSubmitTimeRef = useRef<number>(0);
  const lastVocalizeEndTimeRef = useRef<number>(0);
  const activeAiMsgIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [listeningMode, setListeningMode] = useState(false);
  const [isVoiceTyping, setIsVoiceTyping] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [activeProcessingQuery, setActiveProcessingQuery] = useState<string>("");
  const activeDictatingTextRef = useRef<string>("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listEndRef = useRef<HTMLDivElement>(null);
  const voiceRecRef = useRef<any>(null);
  const baseTextRef = useRef<string>("");
  const hasWebSpeechProducedTextRef = useRef<boolean>(false);

  // Audio dictation for answers
  const answerAudioRef = useRef<HTMLAudioElement | null>(null);
  const browserSpeechRef = useRef<BrowserSpeechController | null>(null);
  const activeDictationEngineRef = useRef<"browser" | "ai" | null>(null);
  const [dictatingMsgId, setDictatingMsgId] = useState<string | null>(null);
  const dictatingMsgIdRef = useRef<string | null>(null);
  dictatingMsgIdRef.current = dictatingMsgId;
  const [isDictationPaused, setIsDictationPaused] = useState(false);
  const isDictationPausedRef = useRef(false);
  const voiceEngineRef = useRef(voiceEngine);
  useEffect(() => {
    isDictationPausedRef.current = isDictationPaused;
    voiceEngineRef.current = voiceEngine;
  }, [isDictationPaused, voiceEngine]);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [answerCurrentTime, setAnswerCurrentTime] = useState(0);
  const [answerTimeline, setAnswerTimeline] = useState<WordTimestamp[]>([]);
  const [browserWords, setBrowserWords] = useState<SpeechWordToken[]>([]);
  const [browserWordIdx, setBrowserWordIdx] = useState<number>(-1);

  const getBrowserSpeech = useCallback(() => {
    if (!browserSpeechRef.current) {
      browserSpeechRef.current = new BrowserSpeechController();
    }
    return browserSpeechRef.current;
  }, []);

  const stopAllDictationPlayback = useCallback((markEnded = true) => {
    if (answerAudioRef.current) {
      try {
        answerAudioRef.current.onloadedmetadata = null;
        answerAudioRef.current.ontimeupdate = null;
        answerAudioRef.current.onended = null;
        answerAudioRef.current.onerror = null;
        answerAudioRef.current.pause();
        answerAudioRef.current.currentTime = 0;
        answerAudioRef.current.src = "";
      } catch {}
    }
    browserSpeechRef.current?.stop();
    cancelAllBrowserSpeech();
    activeDictationEngineRef.current = null;
    setDictatingMsgId(null);
    dictatingMsgIdRef.current = null;
    setIsDictationPaused(false);
    isDictationPausedRef.current = false;
    activeDictatingTextRef.current = "";
    setAnswerTimeline([]);
    setAnswerCurrentTime(0);
    setBrowserWords([]);
    setBrowserWordIdx(-1);
    if (markEnded) {
      lastVocalizeEndTimeRef.current = Date.now();
    }
  }, []);

  useEffect(() => {
    return () => {
      browserSpeechRef.current?.stop();
      cancelAllBrowserSpeech();
    };
  }, []);

  // Continuous Copilot Listening & Hardware Audio refs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isListeningModeActiveRef = useRef(false);
  const activeThreadIdRef = useRef<string | null>(activeThreadId);
  activeThreadIdRef.current = activeThreadId;
  const [activeMicStream, setActiveMicStream] = useState<MediaStream | null>(null);
  const [lastVoiceAiAnswer, setLastVoiceAiAnswer] = useState<{ text: string; citations: Citation[] }>({ text: "", citations: [] });
  const [lastUserSpeech, setLastUserSpeech] = useState<string>("");

  const messageListRef = useRef<HTMLDivElement>(null);
  const prevMsgCountRef = useRef<number>(messages.length);
  const prevLastMsgLoadingRef = useRef<boolean>(Boolean(messages[messages.length - 1]?.isLoading));

  // Auto-scroll message list ONLY when a new message is appended or an active bottom answer finishes loading.
  // Never scroll on dictation play/pause/resume or message deletions.
  useEffect(() => {
    const prevCount = prevMsgCountRef.current;
    const prevLastLoading = prevLastMsgLoadingRef.current;
    const currCount = messages.length;
    const currLastLoading = Boolean(messages[currCount - 1]?.isLoading);

    prevMsgCountRef.current = currCount;
    prevLastMsgLoadingRef.current = currLastLoading;

    const listEl = messageListRef.current;
    if (!listEl || currCount === 0) return;

    if (currCount > prevCount) {
      listEndRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    if (currCount === prevCount && prevLastLoading && !currLastLoading) {
      const distanceFromBottom =
        listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;
      if (distanceFromBottom < 140) {
        listEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [messages]);

  // Auto-resize RAG input textarea up to 4 lines, then scroll internally afterwards
  useEffect(() => {
    const el = inputRef.current;
    if (!el || listeningMode) return;

    const resize = () => {
      el.style.height = "auto";
      const nextHeight = Math.max(
        RAG_INPUT_MIN_HEIGHT_PX,
        Math.min(el.scrollHeight, RAG_INPUT_MAX_HEIGHT_PX)
      );
      el.style.height = `${nextHeight}px`;
      el.style.overflowY = el.scrollHeight > RAG_INPUT_MAX_HEIGHT_PX ? "auto" : "hidden";
    };

    resize();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => resize());
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, [input, listeningMode]);

  // Focus input when user selects an Ask reference from a PDF bounding box
  useEffect(() => {
    if (activeChatReference) {
      inputRef.current?.focus();
    }
  }, [activeChatReference]);

  /* ── Multi-Thread Database Lifecycle & Message Actions ─────────────────── */

  // Load conversation threads for this PDF from database
  useEffect(() => {
    if (!activeDocId) return;
    let cancelled = false;

    async function loadInitialThreads() {
      try {
        const list = await listConversations(activeDocId);
        if (cancelled) return;
        setThreads(list);
        if (list.length > 0) {
          const targetId = list[0].id;
          setActiveThreadId(targetId);

          const detail = await getConversation(targetId);
          if (cancelled || !detail) return;
          const loadedMsgs: RAGMessage[] = detail.messages.map((m) => ({
            id: m.id,
            role: m.role,
            text: m.content,
            citations: m.citations,
            isLoading: false,
          }));
          setMessages(loadedMsgs);
        }
      } catch (err) {
        console.warn("Failed to load threads from DB:", err);
      }
    }

    loadInitialThreads();
    return () => {
      cancelled = true;
    };
  }, [activeDocId, setMessages]);

  const switchThread = useCallback(
    async (threadId: string) => {
      stopAllDictationPlayback(false);
      prevMsgCountRef.current = 0;
      setActiveThreadId(threadId);
      setIsThreadDropdownOpen(false);
      try {
        const detail = await getConversation(threadId);
        if (!detail) return;
        const mapped: RAGMessage[] = detail.messages.map((m) => ({
          id: m.id,
          role: m.role,
          text: m.content,
          citations: m.citations,
          isLoading: false,
        }));
        setMessages(mapped);
      } catch (err) {
        console.warn("Failed to switch thread:", err);
      }
    },
    [setMessages, stopAllDictationPlayback]
  );

  const handleCreateNewThread = useCallback(async () => {
    if (!activeDocId || isCreatingThread) return;
    stopAllDictationPlayback(false);
    setIsCreatingThread(true);
    try {
      const nextNum = threads.length + 1;
      const created = await createConversation(activeDocId, `Discussion ${nextNum}`);
      setThreads((prev) => [created, ...prev]);
      setActiveThreadId(created.id);
      setMessages([]);
      setIsThreadDropdownOpen(false);
    } catch (err) {
      console.warn("Failed to create thread:", err);
    } finally {
      setIsCreatingThread(false);
    }
  }, [activeDocId, isCreatingThread, threads.length, setMessages, stopAllDictationPlayback]);

  const handleDeleteThread = useCallback(
    async (threadId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const confirmed = await new Promise<boolean>((resolve) => {
        setConfirmModal({
          title: "Delete Thread",
          message: "Delete this conversation thread? This action cannot be undone.",
          confirmLabel: "Delete",
          confirmDanger: true,
          onConfirm: () => { setConfirmModal(null); resolve(true); },
          onCancel: () => { setConfirmModal(null); resolve(false); },
        });
      });
      if (!confirmed) return;
      try {
        await deleteConversation(threadId);
        const remaining = threads.filter((t) => t.id !== threadId);
        setThreads(remaining);
        if (activeThreadId === threadId) {
          if (remaining.length > 0) {
            switchThread(remaining[0].id);
          } else {
            handleCreateNewThread();
          }
        }
      } catch (err) {
        console.warn("Failed to delete thread:", err);
      }
    },
    [threads, activeThreadId, switchThread, handleCreateNewThread]
  );

  const handleStartRenameThread = useCallback(
    (threadId: string, currentTitle: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      setRenamingThreadId(threadId);
      setRenamingThreadTitle(currentTitle);
    },
    []
  );

  const handleSaveRenameThread = useCallback(
    async (threadId: string) => {
      const trimmed = renamingThreadTitle.trim();
      if (!trimmed) {
        setRenamingThreadId(null);
        return;
      }
      try {
        await updateConversation(threadId, { title: trimmed });
        setThreads((prev) =>
          prev.map((t) => (t.id === threadId ? { ...t, title: trimmed } : t))
        );
        setConversations((prev) =>
          prev.map((t) => (t.id === threadId ? { ...t, title: trimmed } : t))
        );
      } catch (err) {
        console.error("Failed to rename thread:", err);
      } finally {
        setRenamingThreadId(null);
      }
    },
    [renamingThreadTitle, setConversations]
  );

  /* ── Dictate AI Answer: Unified Voice Engine (ElevenLabs AI vs Browser Built-in) ── */
  const playBrowserSpeechForAnswer = useCallback(
    (cleanText: string, startWordIndex = 0) => {
      if (answerAudioRef.current) {
        try {
          answerAudioRef.current.onloadedmetadata = null;
          answerAudioRef.current.ontimeupdate = null;
          answerAudioRef.current.onended = null;
          answerAudioRef.current.onerror = null;
          answerAudioRef.current.pause();
        } catch {}
      }
      activeDictationEngineRef.current = "browser";
      setIsDictationPaused(false);
      isDictationPausedRef.current = false;
      setAnswerTimeline([]);
      setAnswerCurrentTime(0);
      activeDictatingTextRef.current = cleanText;

      const clearDictationState = () => {
        activeDictationEngineRef.current = null;
        setDictatingMsgId(null);
        dictatingMsgIdRef.current = null;
        setIsDictationPaused(false);
        isDictationPausedRef.current = false;
        activeDictatingTextRef.current = "";
        setBrowserWords([]);
        setBrowserWordIdx(-1);
        lastVocalizeEndTimeRef.current = Date.now();
      };

      if (answerAudioRef.current) {
        try {
          answerAudioRef.current.pause();
          answerAudioRef.current.currentTime = 0;
          answerAudioRef.current.src = "";
        } catch {}
      }
      setAnswerTimeline([]);
      setAnswerCurrentTime(0);

      getBrowserSpeech().speak({
        text: cleanText,
        lang: selectedLang,
        rate: 1.0,
        preferredVoice: selectedVoice,
        startWordIndex,
        callbacks: {
          onWordsReady: setBrowserWords,
          onWordChange: setBrowserWordIdx,
          onEnd: clearDictationState,
          onError: clearDictationState,
        },
      });
    },
    [selectedVoice, selectedLang, getBrowserSpeech]
  );

  const dictateAnswer = useCallback(
    async (msgId: string, text: string) => {
      if (dictatingMsgIdRef.current === msgId) {
        if (!isDictationPausedRef.current) {
          // Pause playback and preserve exact current word / audio timestamp
          if (activeDictationEngineRef.current === "ai" && answerAudioRef.current) {
            try {
              answerAudioRef.current.pause();
            } catch {}
          } else {
            getBrowserSpeech().pause();
          }
          setIsDictationPaused(true);
          isDictationPausedRef.current = true;
          return;
        }

        // Resume playback from the current paused position (never scroll or restart from word 0)
        setIsDictationPaused(false);
        isDictationPausedRef.current = false;
        if (activeDictationEngineRef.current === "ai" && answerAudioRef.current) {
          answerAudioRef.current.play().catch(() => {
            stopAllDictationPlayback(true);
          });
        } else {
          getBrowserSpeech().resume();
        }
        return;
      }

      const cleanText = sanitizeSpeechText(text);
      if (!cleanText) {
        stopAllDictationPlayback(true);
        return;
      }

      stopAllDictationPlayback(false);
      setDictatingMsgId(msgId);
      dictatingMsgIdRef.current = msgId;
      setIsDictationPaused(false);
      isDictationPausedRef.current = false;
      activeDictatingTextRef.current = cleanText;

      // ── If Browser Built-in Voices selected in top bar, use SpeechSynthesis directly ──
      if (voiceEngineRef.current === "browser") {
        playBrowserSpeechForAnswer(convertMathToSpokenText(cleanText));
        return;
      }

      browserSpeechRef.current?.stop();
      cancelAllBrowserSpeech();
      setBrowserWords([]);
      setBrowserWordIdx(-1);
      activeDictationEngineRef.current = "ai";

      // ── Otherwise attempt ElevenLabs AI Emotional Voice ──
      try {
        const tts = await synthesizeElevenLabs(convertMathToSpokenTextKeepCues(cleanText), selectedElevenVoice);
        if (dictatingMsgIdRef.current !== msgId) return;
        if (!tts || !tts.audio_base64) {
          throw new Error("No audio returned from AI voice service");
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
        const timeline = tts.words || [];
        setAnswerTimeline(timeline);
        setAnswerCurrentTime(0);

        audio.onloadedmetadata = () => {
          if (dictatingMsgIdRef.current !== msgId) return;
          if (
            timeline.length === 0 &&
            Number.isFinite(audio.duration) &&
            audio.duration > 0
          ) {
            const fallbackWords = cleanText.split(/\s+/).filter(Boolean);
            if (fallbackWords.length > 0) {
              const totalChars = fallbackWords.reduce((sum, w) => sum + Math.max(1, w.length), 0);
              let t = 0;
              const synthTimeline: WordTimestamp[] = fallbackWords.map((word) => {
                const dur = (Math.max(1, word.length) / totalChars) * audio.duration;
                const entry = { word, start: t, end: t + dur };
                t += dur;
                return entry;
              });
              setAnswerTimeline(synthTimeline);
            }
          }
          audio.play().catch(() => {
            activeDictationEngineRef.current = null;
            setDictatingMsgId(null);
            dictatingMsgIdRef.current = null;
            setIsDictationPaused(false);
            isDictationPausedRef.current = false;
            activeDictatingTextRef.current = "";
            lastVocalizeEndTimeRef.current = Date.now();
          });
        };

        audio.ontimeupdate = () => {
          setAnswerCurrentTime(audio.currentTime);
        };

        audio.onended = () => {
          activeDictationEngineRef.current = null;
          setDictatingMsgId(null);
          dictatingMsgIdRef.current = null;
          setIsDictationPaused(false);
          isDictationPausedRef.current = false;
          activeDictatingTextRef.current = "";
          lastVocalizeEndTimeRef.current = Date.now();
          setAnswerTimeline([]);
        };

        audio.onerror = () => {
          console.warn("Audio element error during AI voice playback; falling back to browser voice");
          activeDictationEngineRef.current = null;
          activeDictatingTextRef.current = "";
          lastVocalizeEndTimeRef.current = Date.now();
          triggerVoiceFallback("AI Emotional Voice playback error. Switched to Browser Built-in Voice.");
          playBrowserSpeechForAnswer(convertMathToSpokenText(cleanText));
        };
      } catch (err: any) {
        if (dictatingMsgIdRef.current !== msgId) return;
        console.warn("AI Voice error in dictateAnswer; switching to Browser Built-in Voice:", err);
        activeDictationEngineRef.current = null;
        activeDictatingTextRef.current = "";
        lastVocalizeEndTimeRef.current = Date.now();
        const msg = String(err?.message || "").toLowerCase();
        const notice = msg.includes("quota") || msg.includes("credit") || msg.includes("401") || msg.includes("no audio")
          ? "ElevenLabs monthly quota reached. Switched to Browser Built-in Voice."
          : "AI Emotional Voice unavailable. Switched to Browser Built-in Voice.";
        triggerVoiceFallback(notice);
        playBrowserSpeechForAnswer(convertMathToSpokenText(cleanText));
      }
    },
    [
      selectedElevenVoice,
      getBrowserSpeech,
      triggerVoiceFallback,
      playBrowserSpeechForAnswer,
      stopAllDictationPlayback,
    ]
  );

  // Handle switching between Browser Voices and AI Voices mid-dictation in RAG panel
  const prevEngineRef = useRef(voiceEngine);
  useEffect(() => {
    if (prevEngineRef.current === voiceEngine) return;
    prevEngineRef.current = voiceEngine;

    // If an answer is currently playing (not paused), cleanly restart it in the newly selected engine
    if (dictatingMsgIdRef.current && activeDictatingTextRef.current && !isDictationPausedRef.current) {
      const msgId = dictatingMsgIdRef.current;
      const text = activeDictatingTextRef.current;
      stopAllDictationPlayback(false);
      dictateAnswer(msgId, text);
    } else {
      // Otherwise ensure all prior engine audio/speech is stopped
      if (answerAudioRef.current) {
        try {
          answerAudioRef.current.pause();
          answerAudioRef.current.currentTime = 0;
          answerAudioRef.current.src = "";
        } catch {}
      }
      browserSpeechRef.current?.stop();
      cancelAllBrowserSpeech();
    }
  }, [voiceEngine, dictateAnswer, stopAllDictationPlayback]);

  const handleSaveEdit = useCallback(
    async (messageId: string) => {
      if (!activeThreadId || !editMsgContent.trim()) return;
      const trimmed = editMsgContent.trim();
      setEditingMsgId(null);

      const msgIdx = messages.findIndex((m) => m.id === messageId);
      if (msgIdx === -1) return;

      if (
        dictatingMsgIdRef.current &&
        messages.slice(msgIdx).some((m) => m.id === dictatingMsgIdRef.current)
      ) {
        stopAllDictationPlayback(false);
      }

      const pruned = messages.slice(0, msgIdx + 1);
      pruned[msgIdx] = { ...pruned[msgIdx], text: trimmed };
      const tempAiId = genId();
      setMessages([...pruned, { id: tempAiId, role: "assistant", text: "", isLoading: true }]);

      try {
        const res = await editConversationMessage(
          activeThreadId,
          messageId,
          trimmed,
          paragraphs,
          pdfUrl || undefined,
          undefined,
          effectiveThreadInstructionRef.current
        );
        const updatedUser = res.user_message;
        const updatedAi = res.assistant_message;
        setMessages([
          ...messages.slice(0, msgIdx),
          { id: updatedUser.id, role: "user", text: updatedUser.content },
          {
            id: updatedAi.id,
            role: "assistant",
            text: updatedAi.content,
            citations: updatedAi.citations || [],
            isLoading: false,
          },
        ]);
        if (
          (voiceEngineRef.current === "browser" ||
            isListeningModeActiveRef.current ||
            listeningMode) &&
          updatedAi.content
        ) {
          dictateAnswer(updatedAi.id, updatedAi.content);
        }
      } catch (err) {
        console.error("Failed to edit message:", err);
        getConversation(activeThreadId).then((detail) => {
          if (detail) {
            setMessages(
              detail.messages.map((m) => ({
                id: m.id,
                role: m.role,
                text: m.content,
                citations: m.citations,
              }))
            );
          }
        });
      }
    },
    [
      activeThreadId,
      dictateAnswer,
      editMsgContent,
      listeningMode,
      messages,
      paragraphs,
      pdfUrl,
      setMessages,
      stopAllDictationPlayback,
    ]
  );

  const handleRetryMessage = useCallback(
    async (messageId: string) => {
      if (!activeThreadId) return;
      if (dictatingMsgIdRef.current === messageId) {
        stopAllDictationPlayback(false);
      }
      setRetryingMsgId(messageId);
      updateMessage(messageId, { isLoading: true, text: "" });

      try {
        const res = await retryConversationMessage(
          activeThreadId,
          messageId,
          paragraphs,
          pdfUrl || undefined,
          undefined,
          effectiveThreadInstructionRef.current
        );
        updateMessage(messageId, {
          text: res.content,
          citations: res.citations || [],
          isLoading: false,
        });
      } catch (err) {
        console.error("Failed to retry message:", err);
        updateMessage(messageId, {
          isLoading: false,
          text: "Failed to regenerate answer. Please try again.",
        });
      } finally {
        setRetryingMsgId(null);
      }
    },
    [activeThreadId, paragraphs, pdfUrl, stopAllDictationPlayback, updateMessage]
  );

  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      const targetIdx = messages.findIndex((m) => m.id === messageId);
      if (targetIdx === -1) return;
      if (messages[targetIdx].role !== "user") return;

      const belowCount = messages.length - targetIdx;
      const confirmPrompt =
        belowCount > 1
          ? "Delete this query, its response, and all queries/responses below it?"
          : "Delete this query?";
      const confirmed = await new Promise<boolean>((resolve) => {
        setConfirmModal({
          title: "Delete Messages",
          message: confirmPrompt,
          confirmLabel: "Delete",
          confirmDanger: true,
          onConfirm: () => { setConfirmModal(null); resolve(true); },
          onCancel: () => { setConfirmModal(null); resolve(false); },
        });
      });
      if (!confirmed) return;

      try {
        if (activeThreadId) {
          const res = await deleteConversationMessage(activeThreadId, messageId);
          if (!res.ok && res.status !== 404) {
            console.error("Failed to delete message:", res.status);
            return;
          }
        }

        const removedIds = new Set(messages.slice(targetIdx).map((m) => m.id));
        if (dictatingMsgIdRef.current && removedIds.has(dictatingMsgIdRef.current)) {
          stopAllDictationPlayback(false);
        }
        if (editingMsgId && removedIds.has(editingMsgId)) {
          setEditingMsgId(null);
        }

        deleteMessagesFrom(messageId);

        if (activeDocId) {
          listConversations(activeDocId)
            .then((fresh) => {
              if (fresh && fresh.length > 0) setThreads(fresh);
            })
            .catch(() => {});
        }
      } catch (err) {
        console.error("Failed to delete message:", err);
      }
    },
    [
      activeDocId,
      activeThreadId,
      deleteMessagesFrom,
      editingMsgId,
      messages,
      stopAllDictationPlayback,
    ]
  );

  const handleCopyMessage = useCallback((msgId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 1500);
  }, []);

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
      let options: MediaRecorderOptions = {};
      if (typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function") {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          options = { mimeType: "audio/webm;codecs=opus" };
        } else if (MediaRecorder.isTypeSupported("audio/webm")) {
          options = { mimeType: "audio/webm" };
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          options = { mimeType: "audio/mp4" };
        }
      }
      const mr = new MediaRecorder(stream, options);
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      mr.start(200);
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
          const mime = mr.mimeType || "audio/webm";
          const blob = new Blob(audioChunksRef.current, { type: mime });
          audioChunksRef.current = [];
          if (blob.size < 400) {
            resolve("");
            return;
          }
          const text = await transcribeAudio(blob);
          resolve(text);
        } catch (err) {
          console.warn("transcribeAudio error:", err);
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

  /* ── Stop In-Flight Query ─────────────────────────────────────────────── */
  const stopCurrentQuery = useCallback(() => {
    // 1. Abort in-flight network query
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch {}
      abortControllerRef.current = null;
    }

    // 2. Stop any active audio playback / dictation
    stopAllDictationPlayback(false);

    // 3. Clear auto-submit silence timer and accumulated speech
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    listeningAccumulatedRef.current = "";
    setVoiceTranscript("");
    setActiveProcessingQuery("");
    setInput("");

    // 4. Update the active AI message if it was still loading
    if (activeAiMsgIdRef.current) {
      updateMessage(activeAiMsgIdRef.current, {
        text: "⏹ Query cancelled.",
        isLoading: false,
      });
      activeAiMsgIdRef.current = null;
    }

    // 5. Unlock submission
    isSubmittingRef.current = false;
    setIsSubmitting(false);
  }, [updateMessage, stopAllDictationPlayback]);

  // Global Escape key listener to stop query or clear voice buffer at any time
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isSubmittingRef.current) {
          e.preventDefault();
          stopCurrentQuery();
        } else if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
          listeningAccumulatedRef.current = "";
          setVoiceTranscript("");
          setInput("");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [stopCurrentQuery]);

  /* ── Handle Question Submission ────────────────────────────────────────── */
  const submitQuestion = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      // Block submission if empty or if another query is already in progress
      if (!trimmed || isSubmittingRef.current) {
        return;
      }

      // Filter out isolated filler noise
      const words = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
      const fillerWords = new Set(["um", "uh", "ah", "hmm", "okay", "yeah", "yes", "hey", "hello", "hi", "so"]);
      if (words.length === 1 && fillerWords.has(words[0].replace(/[^a-z]/g, ""))) {
        return;
      }

      // Mutex lock: guarantee only one query runs at a time
      isSubmittingRef.current = true;
      setIsSubmitting(true);
      setActiveProcessingQuery(trimmed);
      lastSubmitTimeRef.current = Date.now();

      // Abort any prior controller if one existed
      if (abortControllerRef.current) {
        try { abortControllerRef.current.abort(); } catch {}
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Clear any pending silence timer & accumulated voice
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      listeningAccumulatedRef.current = "";

      // Stop previous audio playback before launching new query
      stopAllDictationPlayback(false);

      const userMsgId = genId();
      const aiMsgId = genId();
      activeAiMsgIdRef.current = aiMsgId;
      setLastUserSpeech(trimmed);

      const currentRef = activeChatReference;
      setActiveChatReference(null);

      const userDisplayText = currentRef
        ? `📌 [Page ${currentRef.page}]: "${currentRef.text.length > 70 ? currentRef.text.slice(0, 70) + '…' : currentRef.text}"\n\n${trimmed}`
        : trimmed;

      const queryToSend = currentRef
        ? `[Explicit Document Section Reference - Page ${currentRef.page}: "${currentRef.text}"]\n\nUser Question: ${trimmed}`
        : trimmed;

      addMessage({ id: userMsgId, role: "user", text: userDisplayText });
      setInput("");
      setVoiceTranscript("");

      addMessage({
        id: aiMsgId,
        role: "assistant",
        text: "",
        isLoading: true,
      });

      try {
        let answerText = "";
        let citations: Citation[] = [];

        // Previous conversation turns for context continuity when continuing thread
        const chatHistory = messagesRef.current
          .filter((m) => !m.isLoading && m.text && m.text.trim())
          .slice(-6)
          .map((m) => ({
            role: m.role,
            content: m.text,
          }));

        // Prefer database conversation thread query if active thread exists
        const targetThreadId = activeThreadIdRef.current || activeThreadId;
        if (targetThreadId) {
          try {
            const res = await queryConversation(
              targetThreadId,
              queryToSend,
              paragraphs,
              pdfUrl || undefined,
              controller.signal,
              undefined,
              effectiveThreadInstructionRef.current
            );
            answerText = res.assistant_message.content;
            citations = (res.assistant_message.citations || []).map((c: any) => ({
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

            // Ensure the explicitly referenced bounding box is included as citation
            if (currentRef && !citations.some((c) => c.page === currentRef.page)) {
              citations.unshift({
                id: genId(),
                label: `Page ${currentRef.page}`,
                page: currentRef.page,
                paragraphId: currentRef.paragraphId,
                bbox: currentRef.bbox ? {
                  x: currentRef.bbox.x,
                  y: currentRef.bbox.y,
                  w: currentRef.bbox.w,
                  h: currentRef.bbox.h,
                } : undefined,
                source: "pdf",
                snippet: currentRef.text.slice(0, 160),
              });
            }
            updateMessage(userMsgId, { id: res.user_message.id, text: res.user_message.content });
            updateMessage(aiMsgId, {
              id: res.assistant_message.id,
              text: answerText,
              citations,
              isLoading: false,
            });
            setLastVoiceAiAnswer({ text: answerText, citations });

            // Refresh threads list in background to pick up any auto-titling
            listConversations(activeDocId).then((fresh) => {
              if (fresh && fresh.length > 0) setThreads(fresh);
            });
            activeAiMsgIdRef.current = null;

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

            // Auto-start dictation in Browser Voice mode or Listening Mode
            if (
              (voiceEngineRef.current === "browser" || isListeningModeActiveRef.current) &&
              answerText
            ) {
              dictateAnswer(res.assistant_message.id, answerText);
            }
            return;
          } catch (threadErr: any) {
            if (controller.signal.aborted) return;
            console.warn("queryConversation failed, falling back to direct RAG:", threadErr);
          }
        }

        if (activeDocId) {
          const res = await queryDocument(
            activeDocId,
            queryToSend,
            effectiveThreadInstructionRef.current,
            undefined,
            paragraphs,
            pdfUrl || undefined,
            controller.signal,
            chatHistory
          );
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

        // If user cancelled while waiting for response, discard
        if (controller.signal.aborted) return;

        updateMessage(aiMsgId, {
          text: answerText,
          citations,
          isLoading: false,
        });
        setLastVoiceAiAnswer({ text: answerText, citations });
        activeAiMsgIdRef.current = null;

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

        // Auto-start dictation in Browser Voice mode or Listening Mode with word-level highlighting
        if (
          (voiceEngineRef.current === "browser" || isListeningModeActiveRef.current) &&
          answerText
        ) {
          dictateAnswer(aiMsgId, answerText);
        }
      } catch (err: any) {
        if (err.name === "AbortError" || controller.signal.aborted) {
          // Handled via stopCurrentQuery
          return;
        }
        updateMessage(aiMsgId, {
          text: `Could not retrieve answer: ${err.message || "Request failed"}`,
          isLoading: false,
        });
        activeAiMsgIdRef.current = null;
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        setActiveProcessingQuery("");
      }
    },
    [activeDocId, activeThreadId, addMessage, updateMessage, dictateAnswer, navigateToParagraph, stopAllDictationPlayback, paragraphs, pdfUrl, activeChatReference, setActiveChatReference]
  );

  /* ── Speech Recognition & Real-Time Listening Setup ────────────────────── */
  // Accumulates ALL finalized speech segments across the listening session so
  // the full utterance (not just the last chunk) is auto-submitted on silence.
  const listeningAccumulatedRef = useRef<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    const langMap: Record<string, string> = {
      en: "en-US",
      hi: "hi-IN",
      fr: "fr-FR",
      de: "de-DE",
      es: "es-ES",
      ja: "ja-JP",
    };

    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = langMap[selectedLang] || "en-US";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let newFinal = "";
      let interim = "";

      for (let i = e.resultIndex; i < e.results.length; ++i) {
        const item = e.results[i];
        const textChunk = item[0]?.transcript?.trim() || "";
        if (!textChunk) continue;
        if (item.isFinal) {
          newFinal += (newFinal ? " " : "") + textChunk;
        } else {
          interim += (interim ? " " : "") + textChunk;
        }
      }

      const spokenChunk = (newFinal || interim).trim();
      if (!spokenChunk) return;

      // 1. ACOUSTIC ECHO REJECTION & INTELLIGENT BARGE-IN
      // If RIFT is vocalizing out of the laptop speakers:
      const isSpeakingNow = Boolean(
        dictatingMsgIdRef.current ||
        (typeof window !== "undefined" && window.speechSynthesis?.speaking)
      );

      if (isSpeakingNow) {
        const activeText = (activeDictatingTextRef.current || "").toLowerCase();
        const incomingWords = spokenChunk.toLowerCase().split(/\s+/).filter(Boolean);

        // Check for explicit interrupt keywords
        const interruptKeywords = new Set([
          "stop", "wait", "hold", "pause", "quiet", "listen", "no", "cancel", "shh", "enough"
        ]);
        const hasInterruptKeyword = incomingWords.some((w) =>
          interruptKeywords.has(w.replace(/[^a-z]/g, ""))
        );

        // Acoustic Echo Detection:
        // Does the incoming spoken chunk match what the AI is currently reading aloud?
        const cleanSpokenWords = incomingWords.map((w) => w.replace(/[^a-z0-9]/g, "")).filter(Boolean);
        let isEcho = false;

        if (!hasInterruptKeyword && cleanSpokenWords.length > 0) {
          const spokenPhrase = cleanSpokenWords.join(" ");
          const normalizedActive = activeText.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ");

          if (normalizedActive.includes(spokenPhrase)) {
            isEcho = true;
          } else {
            // Check word overlap ratio
            const matchedCount = cleanSpokenWords.filter((w) => w.length > 2 && normalizedActive.includes(w)).length;
            if (matchedCount / cleanSpokenWords.length >= 0.75) {
              isEcho = true;
            }
          }
        }

        if (isEcho) {
          // Discard speaker audio feedback loop; continue reading smoothly
          return;
        }

        // Distinct user speech or interrupt command detected: BARGE-IN!
        stopAllDictationPlayback(true);

        // If the user spoke a short interrupt command (e.g. "stop", "wait"), halt and wait for next question
        if (hasInterruptKeyword && cleanSpokenWords.length <= 2) {
          listeningAccumulatedRef.current = "";
          setVoiceTranscript("");
          setInput("");
          return;
        }

        // Otherwise, user is asking a new question! Reset for new question
        listeningAccumulatedRef.current = "";
        setLastVoiceAiAnswer({ text: "", citations: [] });
      }

      // 2. Ignore phantom echoes or tail results within 450ms of vocalization ending or submitting
      if (
        Date.now() - lastVocalizeEndTimeRef.current < 450 ||
        Date.now() - lastSubmitTimeRef.current < 450
      ) {
        return;
      }

      // 3. SHIELD IN-FLIGHT QUERY:
      // While RIFT is reasoning/synthesizing, do NOT allow microphone audio to override or abort the query!
      if (isSubmittingRef.current) {
        return;
      }

      // When user starts speaking a new query, clear previous query/answer from voice HUD so it starts fresh!
      if (lastVoiceAiAnswer.text) {
        setLastVoiceAiAnswer({ text: "", citations: [] });
      }
      if (lastUserSpeech) {
        setLastUserSpeech("");
      }

      // Append only genuinely new finalized words to accumulator
      if (newFinal) {
        listeningAccumulatedRef.current +=
          (listeningAccumulatedRef.current ? " " : "") + newFinal;
      }

      // Display = everything accumulated so far + live interim preview
      const accumulated = listeningAccumulatedRef.current;
      const displayText = (
        accumulated + (interim ? (accumulated ? " " : "") + interim : "")
      ).trim();

      if (displayText) {
        setVoiceTranscript(displayText);
        setInput(displayText);

        // Smart Adaptive Patience: wait dynamically depending on grammar/connectors
        if (isListeningModeActiveRef.current) {
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          const delayMs = computeSilenceDelay(displayText);

          silenceTimerRef.current = setTimeout(() => {
            if (isSubmittingRef.current) return;
            const textToSubmit = (listeningAccumulatedRef.current || displayText).trim();
            if (!textToSubmit) return;

            // Filter out lone filler noises
            const words = textToSubmit.toLowerCase().split(/\s+/).filter(Boolean);
            const fillerWords = new Set(["um", "uh", "ah", "hmm", "okay", "yeah", "yes", "hey", "hello", "hi", "so"]);
            if (words.length === 1 && fillerWords.has(words[0].replace(/[^a-z]/g, ""))) {
              listeningAccumulatedRef.current = "";
              setVoiceTranscript("");
              setInput("");
              return;
            }

            // Reset accumulator before submitting so the next utterance starts fresh
            listeningAccumulatedRef.current = "";
            setLastUserSpeech(textToSubmit);
            setVoiceTranscript("");
            setInput("");
            submitQuestion(textToSubmit);
          }, delayMs);
        }
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      const errType = e?.error;
      // Normal speech pauses must not cancel listening mode
      if (errType === "no-speech" || errType === "aborted") {
        return;
      }
      if (errType === "network") {
        // Browser cloud STT blocked (Brave, VPN, ad-blocker) — show notice
        setVoiceNotice("Listening mode: browser cloud STT offline. Check your network or browser settings.");
      } else if (errType === "not-allowed") {
        setVoiceError("Microphone permission denied. Please allow microphone access.");
      } else {
        console.warn("SpeechRec error:", errType);
      }
    };

    rec.onend = () => {
      if (isListeningModeActiveRef.current) {
        // If user stopped talking and has accumulated text, trigger submit promptly
        const pending = listeningAccumulatedRef.current.trim();
        if (pending && !isSubmittingRef.current && !dictatingMsgIdRef.current) {
          const hasRealWords = pending.split(/\s+/).some((w) => w.replace(/[^a-zA-Z0-9]/g, "").length >= 2);
          if (hasRealWords) {
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = setTimeout(() => {
              if (isSubmittingRef.current) return;
              const textToSubmit = listeningAccumulatedRef.current.trim();
              if (textToSubmit) {
                listeningAccumulatedRef.current = "";
                setLastUserSpeech(textToSubmit);
                setVoiceTranscript("");
                setInput("");
                submitQuestion(textToSubmit);
              }
            }, 350);
          }
        }

        // Debounced restart keeps continuous listening active (to support barge-in)
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        restartTimerRef.current = setTimeout(() => {
          if (isListeningModeActiveRef.current) {
            try {
              rec.start();
            } catch (err) {
              console.warn("SpeechRec restart error:", err);
            }
          }
        }, 120);
      }
    };

    recognitionRef.current = rec;

    return () => {
      try {
        rec.abort();
      } catch {}
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    };
  }, [submitQuestion, selectedLang]);

  // Toggle Listening Mode (continuous listening & auto-send)
  const toggleListeningMode = useCallback(async () => {
    // If voice typing is currently active, stop it before turning on continuous mode
    if (isVoiceTyping) {
      if (voiceRecRef.current) {
        try {
          voiceRecRef.current.abort();
        } catch {}
      }
      setIsVoiceTyping(false);
      setInterimTranscript("");
    }

    if (!listeningMode) {
      // 1. Wipe all previous voice buffers & state so listening mode starts 100% clean
      listeningAccumulatedRef.current = "";
      setVoiceTranscript("");
      setLastUserSpeech("");
      setLastVoiceAiAnswer({ text: "", citations: [] });
      setInput("");
      setActiveChatReference(null);
      setActiveProcessingQuery("");
      activeDictatingTextRef.current = "";
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      setVoiceNotice(null);
      setVoiceError(null);

      setListeningMode(true);
      isListeningModeActiveRef.current = true;
      try {
        const stream = await getCleanMicStream();
        if (stream) {
          setActiveMicStream(stream);
        }
      } catch (err) {
        console.warn("Could not acquire mic stream:", err);
      }
      try {
        recognitionRef.current?.start();
      } catch (err) {
        console.warn("SpeechRec start error:", err);
      }
    } else {
      setListeningMode(false);
      isListeningModeActiveRef.current = false;
      try {
        recognitionRef.current?.abort();
      } catch {}
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      listeningAccumulatedRef.current = "";
      setVoiceTranscript("");
      setActiveProcessingQuery("");
      activeDictatingTextRef.current = "";
      setVoiceNotice(null);
      setVoiceError(null);
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      setActiveMicStream(null);
    }
  }, [isVoiceTyping, listeningMode, getCleanMicStream]);

  /* ── Dedicated Voice Input Typing (Web Speech API + Backend Gemini Flash STT) ── */
  const startVoiceTyping = useCallback(async () => {
    if (typeof window === "undefined") return;

    // Stop continuous listening mode if it was active
    if (listeningMode) {
      setListeningMode(false);
      isListeningModeActiveRef.current = false;
      try {
        recognitionRef.current?.abort();
      } catch {}
    }

    // Abort previous voice typing session if any
    if (voiceRecRef.current) {
      try {
        voiceRecRef.current.abort();
      } catch {}
      voiceRecRef.current = null;
    }

    setVoiceError(null);
    setVoiceNotice(null);
    setInterimTranscript("");
    hasWebSpeechProducedTextRef.current = false;
    baseTextRef.current = input.trim();

    // 1. Immediately start capturing microphone audio into local MediaRecorder
    // This runs 100% locally in the browser and NEVER fails with a 'network' error!
    await startMediaRecording();
    setIsVoiceTyping(true);

    // 2. Concurrently attempt browser Web Speech API for real-time live typing
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      try {
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;

        const langMap: Record<string, string> = {
          en: "en-US",
          hi: "hi-IN",
          fr: "fr-FR",
          de: "de-DE",
          es: "es-ES",
          ja: "ja-JP",
        };
        rec.lang = langMap[selectedLang] || "en-US";

        rec.onstart = () => {
          setIsVoiceTyping(true);
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rec.onresult = (event: any) => {
          let finalTrans = "";
          let interimTrans = "";

          for (let i = 0; i < event.results.length; ++i) {
            const item = event.results[i];
            const textChunk = item[0]?.transcript?.trim() || "";
            if (!textChunk) continue;
            if (item.isFinal) {
              finalTrans += (finalTrans ? " " : "") + textChunk;
            } else {
              interimTrans += (interimTrans ? " " : "") + textChunk;
            }
          }

          setInterimTranscript(interimTrans);

          const currentSpoken = (finalTrans + (interimTrans ? (finalTrans ? " " : "") + interimTrans : "")).trim();
          if (currentSpoken) {
            hasWebSpeechProducedTextRef.current = true;
            const base = baseTextRef.current;
            const fullText = base ? `${base} ${currentSpoken}` : currentSpoken;
            setInput(fullText);
            setVoiceTranscript(currentSpoken);
          }
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rec.onerror = (event: any) => {
          const errType = event?.error;
          if (errType === "no-speech" || errType === "aborted") return;

          if (errType === "network") {
            // Browser cloud speech service unreachable (Brave Shield, VPN, ad blocker)
            // DO NOT stop recording! Local MediaRecorder is actively recording audio for backend Gemini STT!
            setVoiceNotice("Browser cloud STT offline — recording with Gemini Flash AI STT. Keep speaking…");
            console.warn("Web Speech API network error: will transcribe with Gemini Flash backend STT.");
          } else if (errType === "not-allowed") {
            setVoiceError("Microphone permission denied. Please allow microphone in browser.");
            setIsVoiceTyping(false);
          } else {
            setVoiceNotice(`Using backend AI STT (${errType})`);
          }
        };

        rec.onend = () => {
          // If Web Speech API ends naturally, don't kill voice typing if user is still speaking
        };

        voiceRecRef.current = rec;
        rec.start();
      } catch (err: any) {
        console.warn("Web Speech start error; using backend STT:", err);
        setVoiceNotice("Recording with Gemini Flash AI STT…");
      }
    } else {
      setVoiceNotice("Recording with Gemini Flash AI STT…");
    }
  }, [input, selectedLang, listeningMode, startMediaRecording]);

  const stopVoiceTyping = useCallback(async () => {
    setIsVoiceTyping(false);
    setInterimTranscript("");

    if (voiceRecRef.current) {
      try {
        voiceRecRef.current.stop();
      } catch {}
      voiceRecRef.current = null;
    }

    // If Web Speech API already transcribed speech, we are done!
    if (hasWebSpeechProducedTextRef.current) {
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const len = inputRef.current.value.length;
          inputRef.current.setSelectionRange(len, len);
        }
      }, 60);
      return;
    }

    // If Web Speech API gave a 'network' error or produced no text:
    // Transcribe with the Gemini Flash AI backend STT!
    setIsTranscribing(true);
    try {
      const text = await stopMediaRecordingAndTranscribe();
      if (text && text.trim()) {
        const base = baseTextRef.current;
        const fullText = base ? `${base} ${text.trim()}` : text.trim();
        setInput(fullText);
        setVoiceTranscript(text.trim());
        setVoiceNotice(null);
      }
    } catch (err: any) {
      console.warn("Backend STT transcription error:", err);
      setVoiceError("Audio transcription failed. Please try again.");
    } finally {
      setIsTranscribing(false);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const len = inputRef.current.value.length;
          inputRef.current.setSelectionRange(len, len);
        }
      }, 60);
    }
  }, [stopMediaRecordingAndTranscribe]);

  const toggleVoiceTyping = useCallback(() => {
    if (isVoiceTyping) {
      stopVoiceTyping();
    } else {
      startVoiceTyping();
    }
  }, [isVoiceTyping, stopVoiceTyping, startVoiceTyping]);

  // Clean up speech recognition on unmount
  useEffect(() => {
    return () => {
      if (voiceRecRef.current) {
        try {
          voiceRecRef.current.abort();
        } catch {}
      }
    };
  }, []);

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
        background: "rgba(2, 6, 10, 0.94)",
        backdropFilter: "none",
        WebkitBackdropFilter: "none",
        borderRadius: "20px",
        border: "1px solid rgba(0, 245, 212, 0.14)",
        boxShadow: "0 16px 45px rgba(0, 0, 0, 0.75)",
        overflow: "hidden",
        contain: "layout paint",
      }}
    >
      {/* ── Header Row: Ask RIFT Bar with Multi-Thread Dropdown & Controls ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "7px",
          padding: "7px 10px",
          background: "linear-gradient(180deg, rgba(3, 12, 16, 0.98), rgba(2, 6, 10, 0.98))",
          borderBottom: "1px solid rgba(0, 245, 212, 0.12)",
          flexShrink: 0,
          position: "relative",
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <Sparkles size={12} style={{ color: "#00f5d4" }} />
          <span
            style={{
              fontSize: "11px",
              fontWeight: 800,
              letterSpacing: "0.08em",
              color: "#f0fdfa",
              fontFamily: "var(--font-heading)",
            }}
          >
            ASK RIFT
          </span>
        </div>

        {/* Thread Switcher Dropdown Toggle */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setIsThreadDropdownOpen((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "9.5px",
              fontFamily: "var(--font-mono)",
              color: "#00f5d4",
              background: "rgba(0, 245, 212, 0.08)",
              padding: "2.5px 7px",
              borderRadius: "5px",
              border: "1px solid rgba(0, 245, 212, 0.25)",
              cursor: "pointer",
              transition: "all 0.15s ease",
              maxWidth: "130px",
            }}
            title="Switch or manage conversation threads"
          >
            <MessageSquare size={10} />
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "85px",
              }}
            >
              {activeThread?.title || "Discussion"}
            </span>
            <ChevronDown size={9} style={{ opacity: 0.7 }} />
          </button>

          {/* Minimalist Thread Dropdown Menu */}
          {isThreadDropdownOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                left: 0,
                width: "220px",
                background: "#030a0e",
                border: "1px solid rgba(0, 245, 212, 0.3)",
                borderRadius: "8px",
                boxShadow: "0 14px 40px rgba(0,0,0,0.9), 0 0 16px rgba(0,245,212,0.12)",
                padding: "6px",
                zIndex: 100,
              }}
            >
              <div
                style={{
                  fontSize: "8.5px",
                  fontFamily: "var(--font-mono)",
                  color: "#64748b",
                  padding: "3px 6px",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Threads ({threads.length})
              </div>
              <div style={{ maxHeight: "170px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "2px" }}>
                {threads.map((t) => {
                  const isActive = t.id === activeThreadId;
                  const isRenaming = renamingThreadId === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => {
                        if (!isRenaming) switchThread(t.id);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "5px 7px",
                        borderRadius: "5px",
                        cursor: isRenaming ? "default" : "pointer",
                        background: isActive ? "rgba(0, 245, 212, 0.12)" : "transparent",
                        border: isActive ? "1px solid rgba(0, 245, 212, 0.3)" : "1px solid transparent",
                        transition: "all 0.1s ease",
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive && !isRenaming) e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive && !isRenaming) e.currentTarget.style.background = "transparent";
                      }}
                    >
                      {isRenaming ? (
                        <div
                          style={{ display: "flex", alignItems: "center", gap: "3px", width: "100%" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            value={renamingThreadTitle}
                            onChange={(e) => setRenamingThreadTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveRenameThread(t.id);
                              if (e.key === "Escape") setRenamingThreadId(null);
                            }}
                            autoFocus
                            style={{
                              flex: 1,
                              minWidth: 0,
                              background: "rgba(0, 0, 0, 0.65)",
                              border: "1px solid rgba(0, 245, 212, 0.6)",
                              borderRadius: "4px",
                              padding: "2px 5px",
                              fontSize: "11px",
                              color: "#f0fdfa",
                              outline: "none",
                              fontFamily: "inherit",
                            }}
                          />
                          <button
                            onClick={() => handleSaveRenameThread(t.id)}
                            style={{
                              border: "none",
                              background: "rgba(0, 245, 212, 0.2)",
                              color: "#00f5d4",
                              cursor: "pointer",
                              padding: "2px 4px",
                              borderRadius: "3px",
                              display: "flex",
                              alignItems: "center",
                            }}
                            title="Save name"
                          >
                            <Check size={10} />
                          </button>
                          <button
                            onClick={() => setRenamingThreadId(null)}
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "#64748b",
                              cursor: "pointer",
                              padding: "2px 4px",
                              borderRadius: "3px",
                              display: "flex",
                              alignItems: "center",
                            }}
                            title="Cancel"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: "flex", alignItems: "center", gap: "5px", overflow: "hidden", flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: "8px", color: isActive ? "#00f5d4" : "#64748b" }}>●</span>
                            <span
                              style={{
                                fontSize: "11px",
                                color: isActive ? "#f0fdfa" : "#94a3b8",
                                fontWeight: isActive ? 600 : 400,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={t.title}
                            >
                              {t.title}
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "3px", flexShrink: 0, marginLeft: "4px" }}>
                            <span style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: "#64748b" }}>
                              {t.message_count}
                            </span>
                            {/* Rename Thread button - just like deleting it */}
                            <button
                              onClick={(e) => handleStartRenameThread(t.id, t.title, e)}
                              style={{
                                border: "none",
                                background: "transparent",
                                color: "#64748b",
                                cursor: "pointer",
                                padding: "2px",
                                display: "flex",
                                alignItems: "center",
                              }}
                              title="Rename chat"
                              onMouseEnter={(e) => (e.currentTarget.style.color = "#00f5d4")}
                              onMouseLeave={(e) => (e.currentTarget.style.color = "#64748b")}
                            >
                              <Pencil size={10} />
                            </button>
                            {/* Delete Thread button */}
                            {threads.length > 1 && (
                              <button
                                onClick={(e) => handleDeleteThread(t.id, e)}
                                style={{
                                  border: "none",
                                  background: "transparent",
                                  color: "#64748b",
                                  cursor: "pointer",
                                  padding: "2px",
                                  display: "flex",
                                  alignItems: "center",
                                }}
                                title="Delete thread"
                                onMouseEnter={(e) => (e.currentTarget.style.color = "#f43f5e")}
                                onMouseLeave={(e) => (e.currentTarget.style.color = "#64748b")}
                              >
                                <Trash2 size={10} />
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ height: "1px", background: "rgba(255, 255, 255, 0.06)", margin: "4px 0" }} />

              <button
                onClick={handleCreateNewThread}
                disabled={isCreatingThread}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "5px",
                  padding: "5px 0",
                  fontSize: "10px",
                  fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                  color: "#00f5d4",
                  background: "rgba(0, 245, 212, 0.08)",
                  border: "1px dashed rgba(0, 245, 212, 0.3)",
                  borderRadius: "5px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <Plus size={10} />
                <span>New Discussion</span>
              </button>
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Thread Response Style & Instruction Control */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => {
              setIsThreadDropdownOpen(false);
              setIsStylePopoverOpen((v) => !v);
            }}
            title="Response style & custom instructions"
            aria-label="Response style and custom instructions"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              height: "22px",
              padding: "0 7px",
              borderRadius: "5px",
              background: hasCustomThreadStyle
                ? "rgba(0, 245, 212, 0.14)"
                : "rgba(255, 255, 255, 0.04)",
              border: `1px solid ${
                hasCustomThreadStyle
                  ? "rgba(0, 245, 212, 0.42)"
                  : "rgba(255, 255, 255, 0.08)"
              }`,
              color: hasCustomThreadStyle ? "#00f5d4" : "#94a3b8",
              fontSize: "10px",
              fontWeight: 600,
              fontFamily: "var(--font-mono)",
              cursor: "pointer",
              transition: "all 0.15s ease",
              whiteSpace: "nowrap",
            }}
          >
            <SlidersHorizontal size={11} />
            <span>
              {threadLengthPreset === "concise"
                ? "Concise"
                : threadLengthPreset === "detailed"
                  ? "Detailed"
                  : "Style"}
            </span>
            {hasCustomThreadStyle && (
              <span
                style={{
                  width: "5px",
                  height: "5px",
                  borderRadius: "9999px",
                  background: "#00f5d4",
                }}
              />
            )}
          </button>

          {isStylePopoverOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                width: "268px",
                padding: "12px",
                borderRadius: "10px",
                background: "#0a1019",
                border: "1px solid rgba(0, 245, 212, 0.25)",
                boxShadow: "0 12px 32px rgba(0, 0, 0, 0.65)",
                zIndex: 60,
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#e2e8f0",
                    letterSpacing: "0.02em",
                  }}
                >
                  Response Style &amp; Rules
                </span>
                <button
                  onClick={() => setIsStylePopoverOpen(false)}
                  aria-label="Close style menu"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#64748b",
                    cursor: "pointer",
                    padding: "2px",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <X size={13} />
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <span style={{ fontSize: "10px", color: "#94a3b8" }}>
                  Default length
                </span>
                <div style={{ display: "flex", gap: "5px" }}>
                  {(["auto", "concise", "detailed"] as ResponseLengthPreset[]).map(
                    (preset) => {
                      const active = threadLengthPreset === preset;
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setThreadLengthPreset(preset)}
                          style={{
                            flex: 1,
                            padding: "5px 6px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 600,
                            textTransform: "capitalize",
                            cursor: "pointer",
                            background: active
                              ? "rgba(0, 245, 212, 0.16)"
                              : "rgba(255, 255, 255, 0.04)",
                            border: `1px solid ${
                              active
                                ? "rgba(0, 245, 212, 0.55)"
                                : "rgba(255, 255, 255, 0.08)"
                            }`,
                            color: active ? "#00f5d4" : "#cbd5e1",
                          }}
                        >
                          {preset}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <span style={{ fontSize: "10px", color: "#94a3b8" }}>
                  Thread instructions (Markdown &amp; voice safe)
                </span>
                <textarea
                  value={threadCustomInstruction}
                  onChange={(e) => setThreadCustomInstruction(e.target.value)}
                  rows={3}
                  placeholder="e.g. Answer in 3 crisp bullets, or use a comparison table when comparing options..."
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "7px 8px",
                    borderRadius: "6px",
                    background: "rgba(15, 23, 42, 0.9)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#f1f5f9",
                    fontSize: "11px",
                    lineHeight: 1.4,
                    resize: "vertical",
                    outline: "none",
                  }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: "6px",
                }}
              >
                <button
                  type="button"
                  onClick={async () => {
                    await handleSaveThreadStyle("auto", "");
                    setIsStylePopoverOpen(false);
                  }}
                  disabled={isSavingThreadStyle}
                  style={{
                    padding: "5px 8px",
                    borderRadius: "6px",
                    background: "transparent",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    color: "#94a3b8",
                    fontSize: "11px",
                    cursor: "pointer",
                  }}
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await handleSaveThreadStyle(
                      threadLengthPreset,
                      threadCustomInstruction
                    );
                    setIsStylePopoverOpen(false);
                  }}
                  disabled={isSavingThreadStyle}
                  style={{
                    padding: "5px 10px",
                    borderRadius: "6px",
                    background: "rgba(0, 245, 212, 0.18)",
                    border: "1px solid rgba(0, 245, 212, 0.48)",
                    color: "#00f5d4",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: isSavingThreadStyle ? "wait" : "pointer",
                  }}
                >
                  {isSavingThreadStyle ? "Saving..." : "Apply"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Quick New Thread '+' Button */}
        <button
          onClick={handleCreateNewThread}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "22px",
            height: "22px",
            borderRadius: "5px",
            background: "rgba(255, 255, 255, 0.04)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            color: "#94a3b8",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
          title="Start new chat thread for this document"
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#00f5d4";
            e.currentTarget.style.borderColor = "rgba(0, 245, 212, 0.4)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#94a3b8";
            e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
          }}
        >
          <Plus size={11} />
        </button>

        {/* Clear Thread History button (shown when there are saved messages) */}
        {messages.length > 0 && (
          <button
            onClick={async () => {
              const confirmed = await new Promise<boolean>((resolve) => {
                setConfirmModal({
                  title: "Clear History",
                  message: "Clear saved chat history for this document? This action cannot be undone.",
                  confirmLabel: "Clear All",
                  confirmDanger: true,
                  onConfirm: () => { setConfirmModal(null); resolve(true); },
                  onCancel: () => { setConfirmModal(null); resolve(false); },
                });
              });
              if (confirmed) {
                stopAllDictationPlayback(false);
                clearChatHistory();
              }
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "3px",
              fontSize: "9.5px",
              fontFamily: "var(--font-mono)",
              padding: "2.5px 6px",
              borderRadius: "5px",
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              color: "#94a3b8",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#f43f5e";
              e.currentTarget.style.borderColor = "rgba(244, 63, 94, 0.4)";
              e.currentTarget.style.background = "rgba(244, 63, 94, 0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#94a3b8";
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
            }}
            title="Clear chat history in this thread"
          >
            <RotateCcw size={9} />
            <span>Clear</span>
          </button>
        )}

        {/* Single Listening Mode Toggle Button */}
        <button
          onClick={toggleListeningMode}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "9.5px",
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
            padding: "2.5px 7px",
            borderRadius: "5px",
            cursor: "pointer",
            transition: "all 0.15s ease",
            background: listeningMode
              ? "linear-gradient(135deg, rgba(0, 245, 212, 0.25), rgba(13, 148, 136, 0.35))"
              : "rgba(255, 255, 255, 0.04)",
            border: listeningMode
              ? "1px solid rgba(0, 245, 212, 0.65)"
              : "1px solid rgba(255, 255, 255, 0.09)",
            color: listeningMode ? "#00f5d4" : "#94a3b8",
            boxShadow: listeningMode ? "0 0 12px rgba(0, 245, 212, 0.35)" : "none",
          }}
          title={
            listeningMode
              ? "Listening Mode ACTIVE: Continuously listens and auto-sends when you speak"
              : "Enable Listening Mode: Continuous real-time voice interaction with noise rejection"
          }
        >
          <Radio size={10} className={listeningMode ? "animate-pulse text-teal-400" : ""} />
          <span>{listeningMode ? "Listening" : "Listen"}</span>
        </button>
      </div>

      {listeningMode ? (
        <ChatGPTVoiceInterface
          micStream={activeMicStream}
          isListening={listeningMode && !isSubmitting && (!dictatingMsgId || isDictationPaused)}
          isSubmitting={isSubmitting}
          isDictating={Boolean(dictatingMsgId && !isDictationPaused)}
          voiceTranscript={voiceTranscript}
          activeQueryText={activeProcessingQuery || voiceTranscript}
          activeAnswerText={lastVoiceAiAnswer.text}
          activeAnswerCitations={lastVoiceAiAnswer.citations}
          onToggleListening={() => {
            if (isListeningModeActiveRef.current) {
              isListeningModeActiveRef.current = false;
              try {
                recognitionRef.current?.abort();
              } catch {}
            } else {
              isListeningModeActiveRef.current = true;
              try {
                recognitionRef.current?.start();
              } catch {}
            }
          }}
          onStopQuery={stopCurrentQuery}
          onExitVoiceMode={() => toggleListeningMode()}
          onCitationClick={handleCitationClick}
          onDirectSubmit={(q) => {
            if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = null;
            }
            listeningAccumulatedRef.current = "";
            setLastUserSpeech(q);
            setVoiceTranscript("");
            setInput("");
            submitQuestion(q);
          }}
        />
      ) : (
        <>
          {/* ── Message List ── */}
      <div
        ref={messageListRef}
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
                background: "rgba(0, 245, 212, 0.12)",
                border: "1px solid rgba(0, 245, 212, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Sparkles size={20} color="#00f5d4" />
            </div>
            <div>
              <div style={{ fontWeight: 600, color: "#f0fdfa", marginBottom: "4px" }}>
                Grounded PDF Intelligence
              </div>
              <div style={{ fontSize: "11px", color: "#94a3b8", maxWidth: "260px" }}>
                Type or speak a question. Answers are cross-grounded with PDF chunks and web citations.
              </div>
            </div>

            {/* Quick starter chips */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px", width: "100%", maxWidth: "280px" }}>
              {["Summarize the key findings", "What are the main methodology steps?", "Explain conclusions"].map((q) => (
                <button
                  key={q}
                  onClick={() => !isSubmitting && submitQuestion(q)}
                  disabled={isSubmitting}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "8px",
                    background: "rgba(4, 18, 24, 0.75)",
                    border: "1px solid rgba(0, 245, 212, 0.16)",
                    color: "#ccfbf1",
                    fontSize: "11px",
                    textAlign: "left",
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                    opacity: isSubmitting ? 0.5 : 1,
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(0, 245, 212, 0.14)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0, 245, 212, 0.45)";
                    (e.currentTarget as HTMLButtonElement).style.color = "#ffffff";
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 12px rgba(0, 245, 212, 0.2)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(4, 18, 24, 0.75)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0, 245, 212, 0.16)";
                    (e.currentTarget as HTMLButtonElement).style.color = "#ccfbf1";
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
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
            const isActivelyDictating = isDictating && !isDictationPaused;
            const isPausedDictating = isDictating && isDictationPaused;
            const isEditing = editingMsgId === msg.id;

            return (
              <div
                key={msg.id}
                onMouseEnter={() => setHoveredMsgId(msg.id)}
                onMouseLeave={() => setHoveredMsgId(null)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: isUser ? "flex-end" : "flex-start",
                  gap: "4px",
                  position: "relative",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span
                    style={{
                      fontSize: "9.5px",
                      fontFamily: "var(--font-mono)",
                      color: isUser ? "#5eead4" : "#00f5d4",
                    }}
                  >
                    {isUser ? "You" : "RIFT AI"}
                  </span>
                </div>

                <div
                  style={{
                    maxWidth: "92%",
                    padding: "10px 13px",
                    borderRadius: isUser ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
                    background: isUser
                      ? "linear-gradient(135deg, rgba(13, 148, 136, 0.35), rgba(4, 38, 40, 0.75))"
                      : "linear-gradient(135deg, rgba(4, 18, 24, 0.95), rgba(2, 6, 10, 0.98))",
                    border: isUser
                      ? "1px solid rgba(0, 245, 212, 0.45)"
                      : "1px solid rgba(0, 245, 212, 0.22)",
                    boxShadow: isUser
                      ? "0 4px 18px rgba(0, 245, 212, 0.15)"
                      : "0 4px 24px rgba(0, 0, 0, 0.75), 0 0 14px rgba(0, 245, 212, 0.08)",
                    fontSize: "13px",
                    lineHeight: "1.6",
                    color: "#f0fdfa",
                    position: "relative",
                  }}
                >
                  {/* Floating Micro-Action Bar on Hover */}
                  {hoveredMsgId === msg.id && !msg.isLoading && !isEditing && (
                    <div
                      style={{
                        position: "absolute",
                        top: "-11px",
                        right: isUser ? "6px" : "auto",
                        left: isUser ? "auto" : "6px",
                        display: "flex",
                        alignItems: "center",
                        gap: "2px",
                        background: "#030a0e",
                        border: "1px solid rgba(0, 245, 212, 0.25)",
                        borderRadius: "5px",
                        padding: "2px 3px",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.85), 0 0 10px rgba(0,245,212,0.1)",
                        zIndex: 20,
                      }}
                    >
                      {!isUser && (
                        <button
                          onClick={() => dictateAnswer(msg.id, msg.text)}
                          style={{
                            border: "none",
                            background: isDictating ? "rgba(0, 245, 212, 0.2)" : "transparent",
                            color: isDictating ? "#00f5d4" : "#94a3b8",
                            cursor: "pointer",
                            padding: "2px 4px",
                            display: "flex",
                            alignItems: "center",
                            borderRadius: "3px",
                          }}
                          title={
                            isActivelyDictating
                              ? "Pause reading"
                              : isPausedDictating
                              ? "Resume reading"
                              : "Read aloud"
                          }
                        >
                          {isActivelyDictating ? (
                            <Pause size={10} fill="currentColor" />
                          ) : (
                            <Play size={10} fill="currentColor" style={{ marginLeft: "1px" }} />
                          )}
                        </button>
                      )}

                      {isUser && (
                        <button
                          onClick={() => {
                            setEditingMsgId(msg.id);
                            setEditMsgContent(msg.text);
                          }}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "#94a3b8",
                            cursor: "pointer",
                            padding: "2px 4px",
                            display: "flex",
                            alignItems: "center",
                            borderRadius: "3px",
                          }}
                          title="Edit question & re-run"
                          onMouseEnter={(e) => (e.currentTarget.style.color = "#00f5d4")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
                        >
                          <Pencil size={10} />
                        </button>
                      )}

                      {!isUser && (
                        <button
                          onClick={() => handleRetryMessage(msg.id)}
                          disabled={retryingMsgId === msg.id}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "#94a3b8",
                            cursor: "pointer",
                            padding: "2px 4px",
                            display: "flex",
                            alignItems: "center",
                            borderRadius: "3px",
                          }}
                          title="Retry / Regenerate answer"
                          onMouseEnter={(e) => (e.currentTarget.style.color = "#00f5d4")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
                        >
                          <RotateCw size={10} className={retryingMsgId === msg.id ? "animate-spin text-teal-400" : ""} />
                        </button>
                      )}

                      <button
                        onClick={() => handleCopyMessage(msg.id, msg.text)}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: copiedMsgId === msg.id ? "#00f5d4" : "#94a3b8",
                          cursor: "pointer",
                          padding: "2px 4px",
                          display: "flex",
                          alignItems: "center",
                          borderRadius: "3px",
                        }}
                        title="Copy text"
                      >
                        {copiedMsgId === msg.id ? <Check size={10} /> : <Copy size={10} />}
                      </button>

                      {isUser && (
                        <button
                          onClick={() => handleDeleteMessage(msg.id)}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "#94a3b8",
                            cursor: "pointer",
                            padding: "2px 4px",
                            display: "flex",
                            alignItems: "center",
                            borderRadius: "3px",
                          }}
                          title="Delete query and all messages below"
                          onMouseEnter={(e) => (e.currentTarget.style.color = "#f43f5e")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
                        >
                          <Trash2 size={10} />
                        </button>
                      )}
                    </div>
                  )}

                  {msg.isLoading ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 0" }}>
                      <ThinkingWave />
                      <span style={{ fontSize: "11px", color: "#00f5d4", fontFamily: "var(--font-mono)" }}>
                        Synthesizing grounded answer…
                      </span>
                    </div>
                  ) : isEditing ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%", minWidth: "240px" }}>
                      <textarea
                        value={editMsgContent}
                        onChange={(e) => setEditMsgContent(e.target.value)}
                        style={{
                          width: "100%",
                          minHeight: "55px",
                          padding: "7px 9px",
                          fontSize: "12px",
                          lineHeight: "1.5",
                          color: "#f0fdfa",
                          background: "rgba(0, 0, 0, 0.45)",
                          border: "1px solid rgba(0, 245, 212, 0.4)",
                          borderRadius: "6px",
                          outline: "none",
                          resize: "vertical",
                          fontFamily: "inherit",
                        }}
                        autoFocus
                      />
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "5px" }}>
                        <button
                          onClick={() => setEditingMsgId(null)}
                          style={{
                            padding: "2.5px 8px",
                            fontSize: "10.5px",
                            borderRadius: "4px",
                            border: "1px solid rgba(255, 255, 255, 0.15)",
                            background: "transparent",
                            color: "#94a3b8",
                            cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSaveEdit(msg.id)}
                          style={{
                            padding: "2.5px 9px",
                            fontSize: "10.5px",
                            fontWeight: 600,
                            borderRadius: "4px",
                            border: "none",
                            background: "linear-gradient(135deg, #00f5d4, #0d9488)",
                            color: "#02060a",
                            cursor: "pointer",
                          }}
                        >
                          Save & Submit
                        </button>
                      </div>
                    </div>
                    ) : isDictating ? (
                    <WordKaraokeText
                      text={msg.text}
                      wordsTimeline={answerTimeline}
                      currentTime={answerCurrentTime}
                      browserWords={browserWords}
                      activeWordIndex={browserWordIdx}
                      isActive={true}
                      isPlaying={!isDictationPaused}
                      autoPageContainerRef={messageListRef}
                      enableMarkdown={true}
                      citations={msg.citations}
                      onCitationClick={handleCitationClick}
                      fontSize="13px"
                      lineHeight="1.6"
                      inactiveColor="#f1f5f9"
                      onSeekTime={(sec) => {
                        if (answerAudioRef.current) {
                          answerAudioRef.current.currentTime = sec;
                          setAnswerCurrentTime(sec);
                          if (isDictationPausedRef.current) {
                            setIsDictationPaused(false);
                            isDictationPausedRef.current = false;
                            answerAudioRef.current.play().catch(() => {});
                          }
                        }
                      }}
                      onSeekWordIndex={(wordIdx) => {
                        const targetText =
                          activeDictatingTextRef.current || sanitizeSpeechText(msg.text);
                        if (targetText) {
                          setIsDictationPaused(false);
                          isDictationPausedRef.current = false;
                          playBrowserSpeechForAnswer(targetText, wordIdx);
                        }
                      }}
                    />
                  ) : isUser ? (
                    <div style={{ whiteSpace: "pre-wrap" }}>{msg.text}</div>
                  ) : (
                    <MarkdownMessage
                      text={msg.text}
                      fontSize="13px"
                      lineHeight="1.6"
                      textColor="#f1f5f9"
                      citations={msg.citations}
                      onCitationClick={handleCitationClick}
                    />
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
                    {msg.citations.map((c, cIdx) => (
                      <CitationChip
                        key={c.id}
                        citation={c}
                        index={c.number ?? cIdx + 1}
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

      {/* ── Unified Input Row: ONE text box + ONE voice input button + ONE send button ── */}
      <div
        style={{
          borderTop: "1px solid rgba(0, 245, 212, 0.12)",
          background: "rgba(1, 4, 7, 0.98)",
          padding: "8px 12px 10px",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          flexShrink: 0,
        }}
      >
        {/* Error notification if microphone permission or API is blocked */}
        {voiceError && (
          <div
            style={{
              fontSize: "11px",
              color: "#fca5a5",
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "6px",
              padding: "4px 8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
            }}
          >
            <span>⚠️ {voiceError}</span>
            <button
              onClick={() => setVoiceError(null)}
              style={{
                background: "transparent",
                border: "none",
                color: "#fca5a5",
                cursor: "pointer",
                fontSize: "11px",
                padding: "0 4px",
              }}
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        {/* Notice if Web Speech was offline and fell back to backend STT */}
        {voiceNotice && isVoiceTyping && (
          <div
            style={{
              fontSize: "10.5px",
              fontFamily: "var(--font-mono)",
              color: "#5eead4",
              background: "rgba(0, 245, 212, 0.08)",
              border: "1px solid rgba(0, 245, 212, 0.25)",
              borderRadius: "5px",
              padding: "3px 8px",
            }}
          >
            ℹ️ {voiceNotice}
          </div>
        )}

        {/* Live speech preview & waveform while voice typing (inspired by RIFT-Break-into-knowledge-) */}
        {(isVoiceTyping || isTranscribing) && (
          <div
            style={{
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              color: "#00f5d4",
              padding: "6px 10px",
              background: "linear-gradient(135deg, rgba(2, 18, 24, 0.96) 0%, rgba(1, 10, 16, 0.96) 100%)",
              border: "1px solid rgba(0, 245, 212, 0.45)",
              borderRadius: "10px",
              boxShadow: "0 4px 18px rgba(0, 0, 0, 0.7), 0 0 16px rgba(0, 245, 212, 0.22)",
              backdropFilter: "blur(14px)",
              display: "flex",
              alignItems: "center",
              gap: "9px",
              transition: "all 0.2s ease",
            }}
          >
            {/* Multi-bar cyber audio waveform */}
            <WaveformAnimation
              active={isVoiceTyping || isTranscribing}
              bars={8}
              height={14}
              barWidth={2.5}
              gap={2.5}
              gradient="linear-gradient(180deg, #00f5d4, #0d9488)"
              color="#00f5d4"
              glow
            />

            {isTranscribing ? (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, minWidth: 0 }}>
                <Loader2 size={12} className="animate-spin text-teal-400" />
                <span style={{ color: "#5eead4", fontWeight: 600 }}>
                  Transcribing voice with Gemini AI STT…
                </span>
              </div>
            ) : interimTranscript ? (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, minWidth: 0, overflow: "hidden" }}>
                <span style={{ color: "#00f5d4", fontWeight: 700, letterSpacing: "0.03em" }}>HEARING:</span>
                <span
                  style={{
                    color: "#f0fdfa",
                    fontStyle: "italic",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  &ldquo;{interimTranscript}&rdquo;
                </span>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, minWidth: 0 }}>
                <span style={{ color: "#00f5d4", fontWeight: 600 }}>
                  Listening…
                </span>
                <span style={{ color: "#5eead4", opacity: 0.85, fontSize: "10.5px" }}>
                  Speak your question into the microphone
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={stopVoiceTyping}
              style={{
                marginLeft: "auto",
                fontSize: "9.5px",
                fontFamily: "var(--font-mono)",
                color: "rgba(255, 255, 255, 0.65)",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: "5px",
                padding: "2px 7px",
                cursor: "pointer",
                transition: "all 0.15s ease",
                flexShrink: 0,
              }}
              title="Stop voice typing (Esc)"
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#00f5d4";
                e.currentTarget.style.borderColor = "rgba(0, 245, 212, 0.4)";
                e.currentTarget.style.background = "rgba(0, 245, 212, 0.12)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "rgba(255, 255, 255, 0.65)";
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.12)";
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
              }}
            >
              Done (Esc)
            </button>
          </div>
        )}

        {/* Continuous listening mode live indicator with Cancel action */}
        {listeningMode && !isVoiceTyping && voiceTranscript && (
          <div
            style={{
              fontSize: "10.5px",
              fontFamily: "var(--font-mono)",
              color: "#00f5d4",
              padding: "3px 8px",
              background: "rgba(0, 245, 212, 0.08)",
              border: "1px solid rgba(0, 245, 212, 0.25)",
              borderRadius: "5px",
              display: "flex",
              alignItems: "center",
              gap: "7px",
            }}
          >
            <span className="animate-pulse">●</span>
            <span style={{ fontStyle: "italic", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              &ldquo;{voiceTranscript}&rdquo;
            </span>
            <button
              onClick={() => {
                if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = null;
                listeningAccumulatedRef.current = "";
                setVoiceTranscript("");
                setInput("");
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "#f87171",
                cursor: "pointer",
                fontSize: "10px",
                fontFamily: "var(--font-mono)",
                padding: "0 4px",
              }}
              title="Cancel pending voice question"
            >
              ✕ Cancel
            </button>
          </div>
        )}


        {/* Active Reference Chip (selected by clicking Ask on any PDF Bounding Box) */}
        {activeChatReference && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
              padding: "5px 10px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, rgba(0, 245, 212, 0.12), rgba(13, 148, 136, 0.18))",
              border: "1px solid rgba(0, 245, 212, 0.45)",
              boxShadow: "0 2px 12px rgba(0, 245, 212, 0.15)",
              fontSize: "11px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden", minWidth: 0 }}>
              <Sparkles size={12} color="#00f5d4" style={{ flexShrink: 0 }} />
              <span
                style={{
                  fontSize: "10px",
                  fontFamily: "var(--font-mono)",
                  color: "#00f5d4",
                  fontWeight: 700,
                  flexShrink: 0,
                  background: "rgba(0, 245, 212, 0.2)",
                  padding: "1px 5px",
                  borderRadius: "3px",
                }}
              >
                Page {activeChatReference.page} Ref
              </span>
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: "#f0fdfa",
                  fontSize: "11px",
                }}
                title={activeChatReference.text}
              >
                &ldquo;{activeChatReference.text}&rdquo;
              </span>
            </div>
            <button
              onClick={() => setActiveChatReference(null)}
              style={{
                border: "none",
                background: "transparent",
                color: "#64748b",
                cursor: "pointer",
                padding: "2px",
                display: "flex",
                alignItems: "center",
                flexShrink: 0,
              }}
              title="Remove reference"
              onMouseEnter={(e) => (e.currentTarget.style.color = "#f43f5e")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#64748b")}
            >
              <X size={12} />
            </button>
          </div>
        )}

        <div style={{ display: "flex", gap: "6px", alignItems: "flex-end" }}>
          {/* Main Text Input Pill */}
          <div
            className={isVoiceTyping ? "rift-input-voice-glow" : undefined}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "flex-end",
              gap: "6px",
              borderRadius: "18px",
              border: isVoiceTyping
                ? "1.5px solid rgba(0, 245, 212, 0.85)"
                : "1px solid rgba(0, 245, 212, 0.25)",
              background: isVoiceTyping
                ? "linear-gradient(180deg, rgba(3, 18, 24, 0.98), rgba(2, 8, 12, 0.98))"
                : "rgba(2, 6, 10, 0.92)",
              padding: "0 6px 0 12px",
              boxShadow: isVoiceTyping
                ? "0 0 24px rgba(0, 245, 212, 0.35), inset 0 0 12px rgba(0, 245, 212, 0.12)"
                : "0 4px 18px rgba(0, 0, 0, 0.6)",
              transition: "border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease",
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (isVoiceTyping) {
                  baseTextRef.current = e.target.value;
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  if (isSubmitting) {
                    stopCurrentQuery();
                  } else if (isVoiceTyping) {
                    stopVoiceTyping();
                  } else if (listeningMode) {
                    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                    silenceTimerRef.current = null;
                    listeningAccumulatedRef.current = "";
                    setVoiceTranscript("");
                    setInput("");
                  }
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (isSubmittingRef.current) return;
                  if (isVoiceTyping) {
                    stopVoiceTyping();
                  }
                  submitQuestion(input);
                }
              }}
              placeholder={
                activeChatReference
                  ? `Ask about Page ${activeChatReference.page} reference (e.g. explain, detail, simplify)…`
                  : isVoiceTyping
                  ? "Listening… speak now into microphone"
                  : listeningMode
                  ? "Listening actively… (or type your question)"
                  : "Ask a question about the PDF… (or click mic to speak)"
              }
              rows={1}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                padding: "8px 0",
                color: "#f0fdfa",
                fontSize: "12.5px",
                resize: "none",
                fontFamily: "inherit",
                lineHeight: `${RAG_INPUT_LINE_HEIGHT_PX}px`,
                minHeight: `${RAG_INPUT_MIN_HEIGHT_PX}px`,
                maxHeight: `${RAG_INPUT_MAX_HEIGHT_PX}px`,
                overflowY: "hidden",
                boxSizing: "border-box",
              }}
            />

            {/* Inline Mini Equalizer when voice typing */}
            {isVoiceTyping && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginRight: "4px",
                  marginBottom: "8px",
                }}
              >
                <WaveformAnimation
                  active={isVoiceTyping}
                  bars={4}
                  height={13}
                  barWidth={2}
                  gap={2}
                  gradient="linear-gradient(180deg, #00f5d4, #0d9488)"
                  color="#00f5d4"
                  glow
                />
              </div>
            )}

            {/* Voice Input Button inside pill */}
            <div
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "3px",
              }}
            >
              {isVoiceTyping && (
                <span
                  className="rift-mic-ripple"
                  style={{
                    position: "absolute",
                    inset: "-4px",
                    borderRadius: "50%",
                    border: "1.5px solid rgba(0, 245, 212, 0.75)",
                    pointerEvents: "none",
                  }}
                />
              )}
              <button
                type="button"
                onClick={toggleVoiceTyping}
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  border: isVoiceTyping
                    ? "1.5px solid #00f5d4"
                    : "1px solid transparent",
                  background: isVoiceTyping
                    ? "radial-gradient(circle at 35% 35%, #00f5d4, #0d9488)"
                    : listeningMode
                    ? "rgba(0, 245, 212, 0.2)"
                    : "transparent",
                  color: isVoiceTyping
                    ? "#020406"
                    : listeningMode
                    ? "#00f5d4"
                    : "#94a3b8",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                  boxShadow: isVoiceTyping
                    ? "0 0 16px rgba(0, 245, 212, 0.85), 0 0 30px rgba(0, 245, 212, 0.4)"
                    : "none",
                  transform: isVoiceTyping ? "scale(1.08)" : "scale(1)",
                }}
                title={
                  isVoiceTyping
                    ? "Click to stop voice typing (Esc)"
                    : listeningMode
                    ? "Listening mode is currently on"
                    : "Voice typing: Click to speak question into input"
                }
              >
                {isVoiceTyping ? (
                  <MicOff size={13} strokeWidth={2.4} />
                ) : (
                  <Mic size={13} />
                )}
              </button>
            </div>
          </div>

          {/* Send or Stop Button */}
          {isSubmitting ? (
            <button
              onClick={stopCurrentQuery}
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "50%",
                border: "1.5px solid rgba(248, 113, 113, 0.8)",
                background: "linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(185, 28, 28, 0.95))",
                color: "#ffffff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow: "0 0 16px rgba(239, 68, 68, 0.65)",
                transition: "all 0.15s ease",
              }}
              title="Stop query (Esc)"
            >
              <Square size={12} fill="currentColor" strokeWidth={0} />
            </button>
          ) : (
            <button
              onClick={() => {
                if (isVoiceTyping) {
                  stopVoiceTyping();
                }
                submitQuestion(input);
              }}
              disabled={!input.trim()}
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "50%",
                border: "none",
                background: input.trim()
                  ? "linear-gradient(135deg, #00f5d4, #0d9488)"
                  : "rgba(255, 255, 255, 0.06)",
                color: input.trim() ? "#020406" : "#fff",
                cursor: input.trim() ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                opacity: input.trim() ? 1 : 0.4,
                transition: "all 0.15s ease",
                boxShadow: input.trim() ? "0 0 14px rgba(0, 245, 212, 0.45)" : "none",
              }}
              title="Send query"
            >
              <Send size={13} strokeWidth={2.2} />
            </button>
          )}
        </div>
      </div>
    </>
  )}

      {/* ── In-App Confirmation Modal ── */}
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          confirmDanger={confirmModal.confirmDanger}
          onConfirm={confirmModal.onConfirm}
          onCancel={confirmModal.onCancel}
        />
      )}
</div>              
  );
}
