/**
 * Workspace-level state shared across PDF viewer, Transcript, and RAG panel.
 * Single source of truth for paragraph sync, playback, and conversation.
 */

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ScriptSegmentItem, ConversationItem } from "./api";
import { cancelAllBrowserSpeech } from "./browserSpeech";

/* ── Types ─────────────────────────────────────────────────────────────────── */

export interface TranscriptParagraph {
  id: string;
  index: number;
  text: string;
  /** Normalised [0-1] bounding box on the PDF page */
  bbox?: { page: number; x: number; y: number; w: number; h: number };
}

export interface RAGMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations?: Citation[];
  isLoading?: boolean;
}

export interface Citation {
  id: string;
  number?: number;
  label: string;
  page?: number;
  paragraphId?: string;
  bbox?: { x: number; y: number; w: number; h: number };
  chunkType?: string;
  imageUrl?: string;
  source?: "pdf" | "web";
  url?: string;
  snippet?: string;
}

export type PlaybackState = "idle" | "playing" | "paused";
export type RAGMode = "speak" | "listen";
export type ListenState = "idle" | "listening" | "processing";
export type VoiceEngine = "ai" | "browser";

export interface PlaybackCommand {
  type: "continue" | "repeat_single";
  paragraphId: string;
  bbox?: { page: number; x: number; y: number; w: number; h: number };
  timestamp: number;
}

export interface ResumeAnchor {
  paragraphId: string;
  label?: string;
  page: number;
  textPreview?: string;
  timestamp: number;
}

export interface ChatReference {
  paragraphId: string;
  page: number;
  text: string;
  bbox?: { page: number; x: number; y: number; w: number; h: number };
  timestamp: number;
}

interface WorkspaceState {
  /* ── PDF ── */
  pdfUrl: string | null;
  numPages: number;
  currentPage: number;
  zoom: number;
  panMode: boolean;

  /* ── Sync ── */
  activeParagraphId: string | null;
  activeBBox: { page: number; x: number; y: number; w: number; h: number } | null;

  /* ── Transcript & Script ── */
  paragraphs: TranscriptParagraph[];
  scriptSegments: ScriptSegmentItem[];
  playbackState: PlaybackState;
  selectedVoice: SpeechSynthesisVoice | null;
  selectedElevenVoice: string;
  selectedLang: string;
  voiceEngine: VoiceEngine;
  voiceFallbackNotice: string | null;

  /* ── RAG ── */
  messages: RAGMessage[];
  currentConversationId: string | null;
  conversations: ConversationItem[];
  ragMode: RAGMode;
  listenState: ListenState;
  pendingQuery: string;
  documentId: string | null;
  scriptInstruction: string;

  /* ── Actions ── */
  setDocumentId: (id: string | null) => void;
  setScriptInstruction: (instruction: string) => void;
  setCurrentConversationId: (id: string | null) => void;
  setConversations: React.Dispatch<React.SetStateAction<ConversationItem[]>>;
  setPdfUrl: (url: string) => void;
  setNumPages: (n: number) => void;
  setCurrentPage: (p: number) => void;
  setZoom: (z: number) => void;
  togglePanMode: () => void;
  setActiveParagraph: (id: string | null) => void;
  setActiveBBox: (bbox: { page: number; x: number; y: number; w: number; h: number } | null) => void;
  setParagraphs: (p: TranscriptParagraph[]) => void;
  setScriptSegments: (s: ScriptSegmentItem[]) => void;
  setPlaybackState: (s: PlaybackState) => void;
  setSelectedVoice: (v: SpeechSynthesisVoice | null) => void;
  setSelectedElevenVoice: (v: string) => void;
  setSelectedLang: (l: string) => void;
  setVoiceEngine: (engine: VoiceEngine) => void;
  setVoiceFallbackNotice: (notice: string | null) => void;
  triggerVoiceFallback: (reason?: string) => void;
  setMessages: React.Dispatch<React.SetStateAction<RAGMessage[]>>;
  addMessage: (m: RAGMessage) => void;
  updateMessage: (id: string, patch: Partial<RAGMessage>) => void;
  deleteMessagesFrom: (id: string) => void;
  clearChatHistory: () => void;
  setRAGMode: (m: RAGMode) => void;
  setListenState: (s: ListenState) => void;
  setPendingQuery: (q: string) => void;

  /* ── Interactive Playback & Resume Anchor ── */
  playbackCommand: PlaybackCommand | null;
  savedResumeAnchor: ResumeAnchor | null;
  isRepeatingSingle: boolean;
  activeChatReference: ChatReference | null;
  playFromParagraph: (id: string, bbox?: { page: number; x: number; y: number; w: number; h: number }) => void;
  repeatParagraph: (id: string, bbox?: { page: number; x: number; y: number; w: number; h: number }) => void;
  resumePreviousPlayback: () => void;
  clearResumeAnchor: () => void;
  setIsRepeatingSingle: (val: boolean) => void;
  setActiveChatReference: (ref: ChatReference | null) => void;
  askAboutParagraph: (p: { id: string; text: string; bbox?: { page: number; x: number; y: number; w: number; h: number } }) => void;

  /** Navigate to a paragraph or bbox — syncs PDF page, bounding box reticles, and transcript scroll */
  navigateToParagraph: (
    id: string,
    explicitBbox?: { page: number; x: number; y: number; w: number; h: number }
  ) => void;
  navigateToBBox: (
    page: number,
    bbox: { x: number; y: number; w: number; h: number },
    id?: string
  ) => void;
  /** Ref callbacks so panels can register their scroll containers */
  transcriptScrollRef: React.RefObject<HTMLDivElement | null>;
}

/* ── Context ────────────────────────────────────────────────────────────────── */

const Ctx = createContext<WorkspaceState | null>(null);

export function WorkspaceProvider({
  children,
  initialPdfUrl,
  initialDocumentId,
  initialInstruction,
}: {
  children: ReactNode;
  initialPdfUrl?: string;
  initialDocumentId?: string;
  initialInstruction?: string | null;
}) {
  const [documentId, setDocumentId] = useState<string | null>(initialDocumentId ?? null);
  const [scriptInstruction, setScriptInstruction] = useState<string>(initialInstruction?.trim() || "");
  const [pdfUrl, setPdfUrl] = useState<string | null>(initialPdfUrl ?? null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1.0);
  const [panMode, setPanMode] = useState(false);
  const [activeParagraphId, setActiveParagraphId] = useState<string | null>(null);
  const [activeBBox, setActiveBBox] = useState<{
    page: number;
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [paragraphs, setParagraphs] = useState<TranscriptParagraph[]>([]);
  const [scriptSegments, setScriptSegments] = useState<ScriptSegmentItem[]>([]);
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [selectedElevenVoice, setSelectedElevenVoice] = useState("pNInz6obpgDQGcFmaJgB");
  const [selectedLang, setSelectedLang] = useState("en-US");
  const [voiceEngine, setVoiceEngineState] = useState<VoiceEngine>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("rift_voice_engine") as VoiceEngine | null;
      if (saved === "ai" || saved === "browser") return saved;
    }
    return "browser";
  });

  const setVoiceEngine = useCallback((engine: VoiceEngine) => {
    setVoiceEngineState(engine);
    // Hard-cancel any active or queued browser speech immediately on engine toggle
    cancelAllBrowserSpeech();
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("rift_voice_engine", engine);
      } catch {}
    }
  }, []);

  const [voiceFallbackNotice, setVoiceFallbackNotice] = useState<string | null>(null);
  const fallbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  const triggerVoiceFallback = useCallback((reason?: string) => {
    setVoiceEngine("browser");
    setVoiceFallbackNotice(
      reason || "⚠️ AI Emotional Voice unavailable. Switched to Browser Built-in Voice."
    );
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    fallbackTimerRef.current = setTimeout(() => {
      setVoiceFallbackNotice(null);
    }, 7000);
  }, [setVoiceEngine]);

  /* ── Interactive Playback & Resume Anchor State ── */
  const [playbackCommand, setPlaybackCommand] = useState<PlaybackCommand | null>(null);
  const [savedResumeAnchor, setSavedResumeAnchor] = useState<ResumeAnchor | null>(null);
  const [isRepeatingSingle, setIsRepeatingSingle] = useState(false);
  const [activeChatReference, setActiveChatReference] = useState<ChatReference | null>(null);

  // Load chat messages persisted in localStorage for this document thread
  const [messages, setMessages] = useState<RAGMessage[]>(() => {
    if (typeof window === "undefined" || !initialDocumentId) return [];
    try {
      const raw = localStorage.getItem(`rift_chat_thread_${initialDocumentId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map((m: any) => ({ ...m, isLoading: false }));
        }
      }
    } catch (e) {
      console.warn("Failed to load chat history from localStorage:", e);
    }
    return [];
  });

  // Re-sync messages when documentId changes
  useEffect(() => {
    if (typeof window === "undefined" || !documentId) return;
    try {
      const raw = localStorage.getItem(`rift_chat_thread_${documentId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setMessages(parsed.map((m: any) => ({ ...m, isLoading: false })));
          return;
        }
      }
      setMessages([]);
    } catch (e) {
      console.warn("Failed to sync chat history for doc:", documentId, e);
    }
  }, [documentId]);

  // Persist messages whenever completed messages update
  useEffect(() => {
    if (typeof window === "undefined" || !documentId) return;
    try {
      const completed = messages.filter((m) => !m.isLoading && m.text && m.text.trim());
      if (completed.length > 0) {
        localStorage.setItem(`rift_chat_thread_${documentId}`, JSON.stringify(completed));
      }
    } catch (e) {
      console.warn("Failed to save chat messages:", e);
    }
  }, [messages, documentId]);

  const clearChatHistory = useCallback(() => {
    setMessages([]);
    if (documentId && typeof window !== "undefined") {
      try {
        localStorage.removeItem(`rift_chat_thread_${documentId}`);
      } catch {}
    }
  }, [documentId]);

  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);

  const deleteMessagesFrom = useCallback(
    (id: string) => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === id);
        if (idx === -1) return prev;
        const next = prev.slice(0, idx);
        if (documentId && typeof window !== "undefined") {
          try {
            const remainingCompleted = next.filter((m) => !m.isLoading && m.text && m.text.trim());
            if (remainingCompleted.length > 0) {
              localStorage.setItem(`rift_chat_thread_${documentId}`, JSON.stringify(remainingCompleted));
            } else {
              localStorage.removeItem(`rift_chat_thread_${documentId}`);
            }
          } catch {}
        }
        return next;
      });
    },
    [documentId]
  );

  const [ragMode, setRAGMode] = useState<RAGMode>("speak");
  const [listenState, setListenState] = useState<ListenState>("idle");
  const [pendingQuery, setPendingQuery] = useState("");

  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);

  const addMessage = useCallback((m: RAGMessage) => {
    setMessages((prev) => [...prev, m]);
  }, []);

  const updateMessage = useCallback((id: string, patch: Partial<RAGMessage>) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    );
  }, []);

  const togglePanMode = useCallback(() => setPanMode((v) => !v), []);

  const navigateToBBox = useCallback(
    (
      page: number,
      bbox: { x: number; y: number; w: number; h: number },
      id?: string
    ) => {
      setCurrentPage(page);
      setActiveBBox({ page, ...bbox });
      if (id) {
        setActiveParagraphId(id);
        const el =
          document.getElementById(`transcript-seg-${id}`) ||
          document.getElementById(`transcript-para-${id}`) ||
          document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      } else {
        // Find matching paragraph or segment with same bbox on this page
        const match =
          paragraphs.find(
            (p) => p.bbox && p.bbox.page === page && Math.abs(p.bbox.y - bbox.y) < 0.04
          ) ||
          scriptSegments.find(
            (s) =>
              s.bbox &&
              s.page_number === page &&
              Math.abs(s.bbox.y - bbox.y) < 0.04
          );
        if (match) {
          setActiveParagraphId((match as any).chunk_id || match.id);
        }
      }
    },
    [paragraphs, scriptSegments]
  );

  const navigateToParagraph = useCallback(
    (
      id: string,
      explicitBbox?: { page: number; x: number; y: number; w: number; h: number }
    ) => {
      setActiveParagraphId(id);

      if (explicitBbox) {
        setActiveBBox(explicitBbox);
        setCurrentPage(explicitBbox.page);
      } else {
        // Find in paragraphs using exact match
        const para = paragraphs.find(
          (p) => p.id === id
        );
        if (para?.bbox) {
          setCurrentPage(para.bbox.page);
          setActiveBBox(para.bbox);
        } else {
          // If id is a segment id like "seg_{chunk_id}_{idx}", extract chunk_id
          let resolvedId = id;
          if (id.startsWith("seg_")) {
            const withoutPrefix = id.slice(4);
            const lastUnderscore = withoutPrefix.lastIndexOf("_");
            if (lastUnderscore > 0) {
              resolvedId = withoutPrefix.slice(0, lastUnderscore);
            }
          }
          // Try matching paragraph by resolved chunk_id
          const paraByChunk = paragraphs.find((p) => p.id === resolvedId);
          if (paraByChunk?.bbox) {
            setCurrentPage(paraByChunk.bbox.page);
            setActiveBBox(paraByChunk.bbox);
          } else {
            // Find in script segments
            const seg = scriptSegments.find(
              (s) =>
                s.chunk_id === id ||
                s.id === id ||
                s.chunk_id === resolvedId
            );
            if (seg?.bbox && seg.page_number) {
              setCurrentPage(seg.page_number);
              setActiveBBox({ page: seg.page_number, ...seg.bbox });
            }
          }
        }
      }

      // Scroll transcript to this paragraph or segment
      const el =
        document.getElementById(`transcript-seg-${id}`) ||
        document.getElementById(`transcript-para-${id}`) ||
        document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    },
    [paragraphs, scriptSegments]
  );

  /* ── Interactive Playback & Resume Anchor Handlers ── */
  const playFromParagraph = useCallback(
    (id: string, bbox?: { page: number; x: number; y: number; w: number; h: number }) => {
      setIsRepeatingSingle(false);
      setPlaybackCommand({
        type: "continue",
        paragraphId: id,
        bbox,
        timestamp: Date.now(),
      });
      navigateToParagraph(id, bbox);
    },
    [navigateToParagraph]
  );

  const repeatParagraph = useCallback(
    (id: string, bbox?: { page: number; x: number; y: number; w: number; h: number }) => {
      // Save current active position as anchor if not already saved and if different from target
      if (!savedResumeAnchor && activeParagraphId && activeParagraphId !== id) {
        const prevPara = paragraphs.find((p) => p.id === activeParagraphId);
        const prevPage = prevPara?.bbox?.page ?? currentPage;
        setSavedResumeAnchor({
          paragraphId: activeParagraphId,
          page: prevPage,
          textPreview: prevPara?.text ? prevPara.text.slice(0, 60) + "…" : undefined,
          timestamp: Date.now(),
        });
      }
      setIsRepeatingSingle(true);
      setPlaybackCommand({
        type: "repeat_single",
        paragraphId: id,
        bbox,
        timestamp: Date.now(),
      });
      navigateToParagraph(id, bbox);
    },
    [savedResumeAnchor, activeParagraphId, paragraphs, currentPage, navigateToParagraph]
  );

  const resumePreviousPlayback = useCallback(() => {
    if (!savedResumeAnchor) return;
    const anchor = savedResumeAnchor;
    setSavedResumeAnchor(null);
    setIsRepeatingSingle(false);
    setPlaybackCommand({
      type: "continue",
      paragraphId: anchor.paragraphId,
      timestamp: Date.now(),
    });
    navigateToParagraph(anchor.paragraphId);
  }, [savedResumeAnchor, navigateToParagraph]);

  const clearResumeAnchor = useCallback(() => {
    setSavedResumeAnchor(null);
  }, []);

  const askAboutParagraph = useCallback(
    (p: { id: string; text: string; bbox?: { page: number; x: number; y: number; w: number; h: number } }) => {
      const pageNum = p.bbox?.page ?? currentPage;
      setActiveChatReference({
        paragraphId: p.id,
        page: pageNum,
        text: p.text,
        bbox: p.bbox,
        timestamp: Date.now(),
      });
      const inputEl = document.querySelector<HTMLTextAreaElement>(
        'textarea[placeholder*="Ask"], textarea[placeholder*="Ask RIFT"]'
      );
      if (inputEl) {
        inputEl.focus();
      }
    },
    [currentPage]
  );

  return (
    <Ctx.Provider
      value={{
        documentId,
        setDocumentId,
        scriptInstruction,
        setScriptInstruction,
        pdfUrl,
        numPages,
        currentPage,
        zoom,
        panMode,
        activeParagraphId,
        activeBBox,
        paragraphs,
        scriptSegments,
        playbackState,
        selectedVoice,
        selectedElevenVoice,
        selectedLang,
        voiceEngine,
        voiceFallbackNotice,
        setVoiceEngine,
        setVoiceFallbackNotice,
        triggerVoiceFallback,
        messages,
        currentConversationId,
        conversations,
        ragMode,
        listenState,
        pendingQuery,
        playbackCommand,
        savedResumeAnchor,
        isRepeatingSingle,
        activeChatReference,
        playFromParagraph,
        repeatParagraph,
        resumePreviousPlayback,
        clearResumeAnchor,
        setIsRepeatingSingle,
        setActiveChatReference,
        askAboutParagraph,
        setPdfUrl,
        setNumPages,
        setCurrentPage,
        setZoom,
        togglePanMode,
        setActiveParagraph: setActiveParagraphId,
        setActiveBBox,
        setParagraphs,
        setScriptSegments,
        setPlaybackState,
        setSelectedVoice,
        setSelectedElevenVoice,
        setSelectedLang,
        setCurrentConversationId,
        setConversations,
        setMessages,
        addMessage,
        updateMessage,
        deleteMessagesFrom,
        clearChatHistory,
        setRAGMode,
        setListenState,
        setPendingQuery,
        navigateToParagraph,
        navigateToBBox,
        transcriptScrollRef,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkspace must be inside <WorkspaceProvider>");
  return ctx;
}

