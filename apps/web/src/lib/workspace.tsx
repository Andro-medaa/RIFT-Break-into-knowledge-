/**
 * Workspace-level state shared across PDF viewer, Transcript, and RAG panel.
 * Single source of truth for paragraph sync, playback, and conversation.
 */

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ScriptSegmentItem } from "./api";

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

  /* ── RAG ── */
  messages: RAGMessage[];
  ragMode: RAGMode;
  listenState: ListenState;
  pendingQuery: string;
  documentId: string | null;

  /* ── Actions ── */
  setDocumentId: (id: string | null) => void;
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
  addMessage: (m: RAGMessage) => void;
  updateMessage: (id: string, patch: Partial<RAGMessage>) => void;
  setRAGMode: (m: RAGMode) => void;
  setListenState: (s: ListenState) => void;
  setPendingQuery: (q: string) => void;
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
}: {
  children: ReactNode;
  initialPdfUrl?: string;
  initialDocumentId?: string;
}) {
  const [documentId, setDocumentId] = useState<string | null>(initialDocumentId ?? null);
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
  const [messages, setMessages] = useState<RAGMessage[]>([]);
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

  return (
    <Ctx.Provider
      value={{
        documentId,
        setDocumentId,
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
        messages,
        ragMode,
        listenState,
        pendingQuery,
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
        addMessage,
        updateMessage,
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

