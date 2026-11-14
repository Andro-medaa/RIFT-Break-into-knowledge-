/**
 * TranscriptPanel – Minimalist teleprompter with ElevenLabs TTS,
 * word-level karaoke highlighting, wave motion, and Gemini AI script generation.
 *
 * Space-optimized: ALL controls live in the compact header row so that
 * the scripts receive maximum vertical space without any bottom dock.
 */
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Play,
  Pause,
  Square,
  Volume2,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Sparkles,
  Loader2,
  ToggleLeft,
  ToggleRight,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  X,
  ImageIcon,
} from "lucide-react";
import { useWorkspace } from "@/lib/workspace";
import {
  generateScript,
  synthesizeElevenLabs,
  getElevenLabsVoices,
  type VoiceOption,
  type WordTimestamp,
} from "@/lib/api";
import {
  BrowserSpeechController,
  cancelAllBrowserSpeech,
  type SpeechWordToken,
} from "@/lib/browserSpeech";
import { WordKaraokeText } from "./WordKaraokeText";
import { convertMathToSpokenText, convertMathToSpokenTextKeepCues } from "@/lib/markdownSpeech";
import { CyberMascotLoader } from "@/components/common/CyberMascotLoader";

/* ── Available languages ─────────────────────────────────────────────────── */
const LANG_OPTIONS = [
  { code: "en", label: "EN" },
  { code: "hi", label: "HI" },
  { code: "fr", label: "FR" },
  { code: "de", label: "DE" },
  { code: "es", label: "ES" },
  { code: "ja", label: "JA" },
];

const SPEEDS = [0.85, 1.0, 1.2, 1.5];

/* ── Curated ElevenLabs Voices ─────────────────────────────────────────── */
const CURATED_VOICES: VoiceOption[] = [
  {
    voice_id: "hpp4J3VqNfWAUOO0d1Us",
    name: "Bella",
    description: "Female (Soft & Gentle)",
    category: "premade",
    preview_url:
      "https://storage.googleapis.com/eleven-public-prod/premade/voices/hpp4J3VqNfWAUOO0d1Us/dab0f5ba-3aa4-48a8-9fad-f138fea1126d.mp3",
  },
  {
    voice_id: "EXAVITQu4vr4xnSDxMaL",
    name: "Sarah",
    description: "Female (Soft & Expressive)",
    category: "premade",
    preview_url:
      "https://storage.googleapis.com/eleven-public-prod/premade/voices/EXAVITQu4vr4xnSDxMaL/01a3e33c-6e99-4ee7-8543-ff2216a32186.mp3",
  },
  {
    voice_id: "pFZP5JQG7iQjIQuC4Bku",
    name: "Lily",
    description: "Female (Velvety Actress, British)",
    category: "premade",
    preview_url:
      "https://storage.googleapis.com/eleven-public-prod/premade/voices/pFZP5JQG7iQjIQuC4Bku/89b68b35-b3dd-4348-a84a-a3c13a3c2b30.mp3",
  },
  {
    voice_id: "cgSgspJ2msm6clMCkdW9",
    name: "Jessica",
    description: "Female (Playful, Bright & Warm)",
    category: "premade",
    preview_url:
      "https://storage.googleapis.com/eleven-public-prod/premade/voices/cgSgspJ2msm6clMCkdW9/56a97bf8-b69b-448f-846c-c3a11683d45a.mp3",
  },
  {
    voice_id: "pNInz6obpgDQGcFmaJgB",
    name: "Adam",
    description: "Male (Deep & Grounded)",
    category: "premade",
    preview_url:
      "https://storage.googleapis.com/eleven-public-prod/premade/voices/pNInz6obpgDQGcFmaJgB/d6905d7a-dd26-4187-bfff-1bd3a5ea7cac.mp3",
  },
  {
    voice_id: "bIHbv24MWmeRgasZH58o",
    name: "Will",
    description: "Male (Relaxed Optimist)",
    category: "premade",
    preview_url:
      "https://storage.googleapis.com/eleven-public-prod/premade/voices/bIHbv24MWmeRgasZH58o/8caf8f3d-ad29-4980-af41-53f20c72d7a4.mp3",
  },
  {
    voice_id: "SOYHLrjzK2X1ezoPC6cr",
    name: "Harry",
    description: "Male (Fierce & Character)",
    category: "premade",
    preview_url:
      "https://storage.googleapis.com/eleven-public-prod/premade/voices/SOYHLrjzK2X1ezoPC6cr/86d178f6-f4b6-4e0e-85be-3de19f490794.mp3",
  },
  {
    voice_id: "cjVigY5qzO86Huf0OWal",
    name: "Eric",
    description: "Male (Smooth & Trustworthy)",
    category: "premade",
    preview_url:
      "https://storage.googleapis.com/eleven-public-prod/premade/voices/cjVigY5qzO86Huf0OWal/d098fda0-6456-4030-b3d8-63aa048c9070.mp3",
  },
];

/* ── Minimal wave motion bar while dictating ─────────────────────────────── */
function DictationWave({ active = false }: { active?: boolean }) {
  if (!active) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "2px",
        height: "16px",
      }}
      title="Dictating..."
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="wave-bar"
          style={{
            width: "2.5px",
            background: "linear-gradient(180deg, #00f5d4, #0d9488)",
            borderRadius: "2px",
            animationDelay: `${i * 0.12}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ── Main TranscriptPanel ────────────────────────────────────────────────── */
export default function TranscriptPanel({
  isMobile = false,
  isExpanded = false,
  onToggleMobileExpand,
  onOpenChat,
}: {
  isMobile?: boolean;
  isExpanded?: boolean;
  onToggleMobileExpand?: () => void;
  onOpenChat?: () => void;
} = {}) {
  const {
    documentId,
    paragraphs,
    scriptSegments,
    setScriptSegments,
    activeParagraphId,
    setActiveParagraph,
    playbackState,
    setPlaybackState,
    navigateToParagraph,
    selectedElevenVoice,
    setSelectedElevenVoice,
    selectedVoice,
    voiceEngine,
    setVoiceEngine,
    triggerVoiceFallback,
    playbackCommand,
    savedResumeAnchor,
    resumePreviousPlayback,
    clearResumeAnchor,
    scriptInstruction,
    setScriptInstruction,
  } = useWorkspace();

  const voiceEngineRef = useRef(voiceEngine);
  useEffect(() => {
    voiceEngineRef.current = voiceEngine;
  }, [voiceEngine]);

  const playbackStateRef = useRef(playbackState);
  useEffect(() => {
    playbackStateRef.current = playbackState;
  }, [playbackState]);

  const playbackSessionRef = useRef(0);

  // Voice & Language state (Bella default, with Sarah, Lily, Jessica, Adam, Will, Harry, Eric)
  const [voices, setVoices] = useState<VoiceOption[]>(CURATED_VOICES);
  const [selectedVoiceId, setSelectedVoiceId] = useState(selectedElevenVoice || "hpp4J3VqNfWAUOO0d1Us");
  const [selectedLang, setSelectedLang] = useState("en");
  const [selectedSpeed, setSelectedSpeed] = useState(1.0);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [voiceDropdownOpen, setVoiceDropdownOpen] = useState(false);
  const [showParsedText, setShowParsedText] = useState(false);
  const [instructionDrawerOpen, setInstructionDrawerOpen] = useState(false);
  const [instructionDraft, setInstructionDraft] = useState(scriptInstruction);

  // Keep workspace voice synced with Transcript panel voice
  useEffect(() => {
    if (selectedVoiceId && setSelectedElevenVoice) {
      setSelectedElevenVoice(selectedVoiceId);
    }
  }, [selectedVoiceId, setSelectedElevenVoice]);

  // Audio preview player for voice demo clips (zero ElevenLabs API calls)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);

  const toggleVoicePreview = useCallback((v: VoiceOption) => {
    if (!v.preview_url) return;

    // Toggle off if currently playing this voice
    if (previewingVoiceId === v.voice_id) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.currentTime = 0;
      }
      setPreviewingVoiceId(null);
      return;
    }

    // Stop any previously playing preview
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
    }

    const audio = new Audio(v.preview_url);
    previewAudioRef.current = audio;
    setPreviewingVoiceId(v.voice_id);

    audio.onended = () => {
      setPreviewingVoiceId((current) => (current === v.voice_id ? null : current));
    };

    audio.onerror = () => {
      setPreviewingVoiceId((current) => (current === v.voice_id ? null : current));
    };

    audio.play().catch(() => {
      setPreviewingVoiceId((current) => (current === v.voice_id ? null : current));
    });
  }, [previewingVoiceId]);

  // If voice dropdown closes, immediately stop any playing voice preview
  useEffect(() => {
    if (!voiceDropdownOpen && previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
      setPreviewingVoiceId(null);
    }
  }, [voiceDropdownOpen]);

  // Clean up preview audio on unmount
  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.src = "";
      }
    };
  }, []);

  // Audio Playback & Karaoke state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const browserSpeechRef = useRef<BrowserSpeechController | null>(null);
  const [activeSegIdx, setActiveSegIdx] = useState(0);
  const [timelineSegIdx, setTimelineSegIdx] = useState<number | null>(null);
  const [currentAudioTime, setCurrentAudioTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(1);
  const [activeTimeline, setActiveTimeline] = useState<WordTimestamp[]>([]);
  const [browserWords, setBrowserWords] = useState<SpeechWordToken[]>([]);
  const [browserWordIdx, setBrowserWordIdx] = useState<number>(-1);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const getBrowserSpeech = useCallback(() => {
    if (!browserSpeechRef.current) {
      browserSpeechRef.current = new BrowserSpeechController();
    }
    return browserSpeechRef.current;
  }, []);

  useEffect(() => {
    return () => {
      browserSpeechRef.current?.stop();
    };
  }, []);

  // Chapter heading toast overlay state
  const [activeChapterToast, setActiveChapterToast] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastHeadingRef = useRef<string | null>(null);

  // Segments to display: AI script by default, or parsed text when toggled
  const displayItems = useMemo(() => {
    if (showParsedText && paragraphs.length > 0) {
      return paragraphs.map((p, idx) => ({
        id: p.id,
        chunkId: p.id,
        text: p.text,
        page: p.bbox?.page ?? 1,
        bbox: p.bbox,
        chapterHeading: undefined,
        chunkType: p.chunkType,
        imageUrl: p.imageUrl,
        idx,
      }));
    }
    if (scriptSegments && scriptSegments.length > 0) {
      return scriptSegments.map((s, idx) => ({
        id: s.id,
        chunkId: s.chunk_id,
        text: s.text,
        page: s.page_number,
        bbox: s.bbox ? { page: s.page_number, ...s.bbox } : undefined,
        chapterHeading: s.chapter_heading,
        chunkType: s.chunk_type,
        imageUrl: s.image_url,
        idx,
      }));
    }
    return [];
  }, [scriptSegments, paragraphs, showParsedText]);

  // Load voices from backend while ensuring all curated voices are preserved
  useEffect(() => {
    getElevenLabsVoices()
      .then((vList) => {
        if (vList && vList.length > 0) {
          const map = new Map<string, VoiceOption>();
          CURATED_VOICES.forEach((v) => map.set(v.voice_id, v));
          vList.forEach((v) => {
            if (map.has(v.voice_id)) {
              map.set(v.voice_id, { ...map.get(v.voice_id)!, ...v });
            } else {
              map.set(v.voice_id, v);
            }
          });
          setVoices(Array.from(map.values()));
        }
      })
      .catch(() => {});
  }, []);

  // Automatically load / generate AI script with bbox links as the default
  useEffect(() => {
    if (!documentId) return;
    if (scriptSegments && scriptSegments.length > 0) return;
    if (paragraphs.length === 0) return;

    let cancelled = false;
    setIsGeneratingScript(true);

    generateScript(
      documentId,
      "natural",
      selectedLang,
      false,
      paragraphs,
      undefined,
      scriptInstruction || undefined
    )
      .then((res) => {
        if (!cancelled && res && res.segments && res.segments.length > 0) {
          setScriptSegments(res.segments);
          if (typeof res.instruction === "string") {
            setScriptInstruction(res.instruction);
          }
          setActiveSegIdx(0);
          const first = res.segments[0];
          const targetId = first.chunk_id || first.id;
          if (targetId) {
            setActiveParagraph(targetId);
            if (first.bbox && first.page_number) {
              navigateToParagraph(targetId, {
                page: first.page_number,
                ...first.bbox,
              });
            } else {
              navigateToParagraph(targetId);
            }
          }
        }
      })
      .catch((err) => {
        console.warn("Auto script generation error:", err);
      })
      .finally(() => {
        if (!cancelled) setIsGeneratingScript(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    documentId,
    selectedLang,
    scriptSegments,
    paragraphs,
    scriptInstruction,
    setScriptSegments,
    setScriptInstruction,
    setActiveParagraph,
    navigateToParagraph,
  ]);

  // Sync active segment when activeParagraphId changes from outside (e.g. clicking bbox)
  useEffect(() => {
    if (!activeParagraphId || displayItems.length === 0) return;

    // Resolve the chunk_id from activeParagraphId if it's a segment id
    let resolvedId = activeParagraphId;
    if (activeParagraphId.startsWith("seg_")) {
      const withoutPrefix = activeParagraphId.slice(4);
      const lastUnderscore = withoutPrefix.lastIndexOf("_");
      if (lastUnderscore > 0) {
        resolvedId = withoutPrefix.slice(0, lastUnderscore);
      }
    }

    const foundIdx = displayItems.findIndex(
      (item) =>
        item.chunkId === activeParagraphId ||
        item.id === activeParagraphId ||
        item.chunkId === resolvedId ||
        item.id === resolvedId
    );
    if (foundIdx >= 0 && foundIdx !== activeSegIdx) {
      setActiveSegIdx(foundIdx);
    }
  }, [activeParagraphId, displayItems, activeSegIdx]);

  // Teleprompter smooth auto-center scroll to active segment & trigger chapter heading toast
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const targetEl = document.getElementById(`transcript-seg-${activeSegIdx}`);
    if (!targetEl) return;

    const containerRect = container.getBoundingClientRect();
    const elRect = targetEl.getBoundingClientRect();
    const scrollOffset =
      container.scrollTop +
      (elRect.top - containerRect.top) -
      containerRect.height / 2 +
      elRect.height / 2;

    container.scrollTo({ top: scrollOffset, behavior: "smooth" });

    // Check for chapter heading changes on segment change
    const currentItem = displayItems[activeSegIdx];
    const heading = currentItem?.chapterHeading;
    if (heading && heading !== lastHeadingRef.current) {
      lastHeadingRef.current = heading;
      setActiveChapterToast(heading);
      setToastVisible(true);

      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = setTimeout(() => {
        setToastVisible(false);
      }, 4000);
    }
  }, [activeSegIdx, displayItems]);

  /* ── Generate AI Script with Gemini ────────────────────────────────────── */
  const regenerateWithInstruction = useCallback(
    async (explicitInstruction?: string) => {
      if (!documentId) return;
      setIsGeneratingScript(true);
      try {
        const res = await generateScript(
          documentId,
          "natural",
          selectedLang,
          true,
          paragraphs,
          undefined,
          explicitInstruction
        );
        if (explicitInstruction !== undefined) {
          setScriptInstruction(explicitInstruction.trim());
        } else if (typeof res?.instruction === "string") {
          setScriptInstruction(res.instruction);
        }
        if (res && res.segments && res.segments.length > 0) {
          setScriptSegments(res.segments);
          setShowParsedText(false);
          setActiveSegIdx(0);
          const first = res.segments[0];
          const targetId = first.chunk_id || first.id;
          if (targetId) {
            setActiveParagraph(targetId);
            if (first.bbox && first.page_number) {
              navigateToParagraph(targetId, {
                page: first.page_number,
                ...first.bbox,
              });
            } else {
              navigateToParagraph(targetId);
            }
          }
        }
      } catch (err) {
        console.warn("Script generation failed:", err);
      } finally {
        setIsGeneratingScript(false);
      }
    },
    [
      documentId,
      selectedLang,
      paragraphs,
      setScriptSegments,
      setScriptInstruction,
      setActiveParagraph,
      navigateToParagraph,
    ]
  );

  const handleGenerateScript = useCallback(
    () => regenerateWithInstruction(scriptInstruction || undefined),
    [regenerateWithInstruction, scriptInstruction]
  );

  /* ── Synthesize & Play Segment Audio ───────────────────────────────────── */
  const isRepeatingSingleRef = useRef(false);
  const lastProcessedCmdRef = useRef<number>(0);
  const playSegmentAudioRef = useRef<((segIndex: number, repeatSingle?: boolean) => void) | null>(null);

  const playBrowserSpeech = useCallback(
    (text: string, segIndex: number, startWordIndex = 0) => {
      // Hard stop and clear any AI audio immediately to ensure zero voice overlap
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
          audioRef.current.src = "";
        } catch {}
      }
      setActiveTimeline([]);
      setBrowserWords([]);
      setBrowserWordIdx(-1);
      setCurrentAudioTime(0);
      setTimelineSegIdx(null);

      getBrowserSpeech().speak({
        text,
        lang: selectedLang,
        rate: selectedSpeed,
        preferredVoice: selectedVoice,
        startWordIndex,
        callbacks: {
          onWordsReady: setBrowserWords,
          onWordChange: setBrowserWordIdx,
          onStart: () => {
            setIsAudioLoading(false);
            setPlaybackState("playing");
            // Bind timeline to segIndex only once browser speech begins
            setTimelineSegIdx(segIndex);
          },
          onEnd: () => {
            setBrowserWords([]);
            setBrowserWordIdx(-1);
            setTimelineSegIdx(null);
            if (isRepeatingSingleRef.current) {
              setPlaybackState("idle");
            } else if (segIndex < displayItems.length - 1) {
              // Asynchronous tick delay to allow Chromium speech engine to cleanly dispose
              // of finished utterance before initiating next segment
              setTimeout(() => {
                playSegmentAudioRef.current?.(segIndex + 1, false);
              }, 70);
            } else {
              setPlaybackState("idle");
            }
          },
          onError: () => {
            setIsAudioLoading(false);
            setBrowserWords([]);
            setBrowserWordIdx(-1);
            setTimelineSegIdx(null);
            setPlaybackState("idle");
          },
        },
      });
    },
    [selectedVoice, selectedSpeed, selectedLang, displayItems.length, setPlaybackState, getBrowserSpeech]
  );

  const playSegmentAudio = useCallback(
    async (segIndex: number, repeatSingle: boolean = false) => {
      const item = displayItems[segIndex];
      if (!item) return;

      const currentSession = ++playbackSessionRef.current;
      isRepeatingSingleRef.current = repeatSingle;
      setActiveSegIdx(segIndex);
      const targetId = item.chunkId || item.id;
      setActiveParagraph(targetId);
      navigateToParagraph(targetId, item.bbox);

      // IMMEDIATELY reset all prior segment timelines and unbind segment!
      // This is the core fix for Bug 2: never let the newly focused segment inherit
      // or display the prior segment's words while audio is generating!
      setTimelineSegIdx(null);
      setActiveTimeline([]);
      setBrowserWords([]);
      setBrowserWordIdx(-1);
      setCurrentAudioTime(0);

      // ── If Browser Built-in Voices selected, use SpeechSynthesis directly ──
      if (voiceEngineRef.current === "browser") {
        if (audioRef.current) {
          try {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            audioRef.current.src = "";
          } catch {}
        }
        playBrowserSpeech(convertMathToSpokenText(item.text), segIndex);
        return;
      }

      // ── AI Voice Mode: Hard stop any active browser speech completely ──
      browserSpeechRef.current?.stop();
      cancelAllBrowserSpeech();

      // Stop previous AI audio while fetching new segment
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch {}
      }
      setIsAudioLoading(true);

      // ── Attempt ElevenLabs AI Emotional Voice ──
      try {
        const ttsData = await synthesizeElevenLabs(convertMathToSpokenTextKeepCues(item.text), selectedVoiceId);

        // Check if session changed or user switched engine/paused during network call
        if (
          currentSession !== playbackSessionRef.current ||
          voiceEngineRef.current !== "ai"
        ) {
          setIsAudioLoading(false);
          return;
        }

        if (!ttsData || !ttsData.audio_base64) {
          throw new Error("No audio returned from AI voice service");
        }

        const audioBlob = new Blob(
          [Uint8Array.from(atob(ttsData.audio_base64), (c) => c.charCodeAt(0))],
          { type: "audio/mp3" }
        );
        const audioUrl = URL.createObjectURL(audioBlob);

        // Ensure browser speech hasn't started in the meantime
        browserSpeechRef.current?.stop();
        cancelAllBrowserSpeech();

        if (!audioRef.current) {
          audioRef.current = new Audio();
        }

        const audio = audioRef.current;
        audio.src = audioUrl;
        audio.playbackRate = selectedSpeed;

        audio.onloadedmetadata = () => {
          if (
            currentSession !== playbackSessionRef.current ||
            voiceEngineRef.current !== "ai"
          ) {
            return;
          }
          setAudioDuration(audio.duration || 1);
          setIsAudioLoading(false);
          // Bind timeline strictly to this segment now that audio is ready to dictate
          setTimelineSegIdx(segIndex);
          setActiveTimeline(ttsData.words || []);
          audio.play().then(() => setPlaybackState("playing")).catch(() => setPlaybackState("idle"));
        };

        audio.ontimeupdate = () => {
          if (currentSession === playbackSessionRef.current) {
            setCurrentAudioTime(audio.currentTime);
          }
        };

        audio.onended = () => {
          if (currentSession !== playbackSessionRef.current) return;
          setActiveTimeline([]);
          setTimelineSegIdx(null);
          setCurrentAudioTime(0);
          if (isRepeatingSingleRef.current) {
            // SINGLE REPEAT: Stop here, don't advance to next segment!
            setPlaybackState("idle");
          } else if (segIndex < displayItems.length - 1) {
            setTimeout(() => {
              playSegmentAudioRef.current?.(segIndex + 1, false);
            }, 60);
          } else {
            setPlaybackState("idle");
          }
        };

        audio.onerror = () => {
          if (currentSession !== playbackSessionRef.current) return;
          setIsAudioLoading(false);
          setActiveTimeline([]);
          setTimelineSegIdx(null);
          console.warn("AI audio playback error; seamlessly switching to Browser Built-in Voice");
          voiceEngineRef.current = "browser";
          prevEngineRef.current = "browser";
          triggerVoiceFallback("AI Emotional Voice unavailable. Switched to Browser Built-in Voice.");
          playBrowserSpeech(convertMathToSpokenText(item.text), segIndex);
        };
      } catch (err: any) {
        if (currentSession !== playbackSessionRef.current) return;
        console.warn("AI Voice error; switching to Browser Built-in Voice:", err);
        // Automatic fallback per user spec
        voiceEngineRef.current = "browser";
        prevEngineRef.current = "browser";
        triggerVoiceFallback("AI Emotional Voice unavailable. Switched to Browser Built-in Voice.");
        playBrowserSpeech(convertMathToSpokenText(item.text), segIndex);
      }
    },
    [displayItems, selectedVoiceId, selectedSpeed, voiceEngine, triggerVoiceFallback, playBrowserSpeech, setActiveParagraph, navigateToParagraph, setPlaybackState]
  );

  playSegmentAudioRef.current = playSegmentAudio;
  voiceEngineRef.current = voiceEngine;
  playbackStateRef.current = playbackState;

  useEffect(() => {
    playSegmentAudioRef.current = playSegmentAudio;
  }, [playSegmentAudio]);

  // Handle external playback commands from PDF BBoxes or Roadmap
  useEffect(() => {
    if (!playbackCommand || playbackCommand.timestamp <= lastProcessedCmdRef.current) return;
    lastProcessedCmdRef.current = playbackCommand.timestamp;

    const targetId = playbackCommand.paragraphId;
    const targetIdx = displayItems.findIndex(
      (item) => item.chunkId === targetId || item.id === targetId
    );

    if (targetIdx !== -1) {
      if (playbackCommand.type === "repeat_single") {
        playSegmentAudio(targetIdx, true);
      } else {
        playSegmentAudio(targetIdx, false);
      }
    }
  }, [playbackCommand, displayItems, playSegmentAudio]);

  const togglePlayback = useCallback(() => {
    if (playbackState === "playing") {
      if (audioRef.current) {
        try { audioRef.current.pause(); } catch {}
      }
      browserSpeechRef.current?.pause();
      setPlaybackState("paused");
    } else if (playbackState === "paused") {
      if (voiceEngine === "ai") {
        browserSpeechRef.current?.stop();
        cancelAllBrowserSpeech();
        if (audioRef.current && audioRef.current.src) {
          audioRef.current.play().then(() => setPlaybackState("playing")).catch(() => {
            playSegmentAudio(activeSegIdx);
          });
        } else {
          playSegmentAudio(activeSegIdx);
        }
      } else {
        if (audioRef.current) {
          try {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          } catch {}
        }
        browserSpeechRef.current?.resume();
        setPlaybackState("playing");
      }
    } else {
      isRepeatingSingleRef.current = false;
      playSegmentAudio(activeSegIdx, false);
    }
  }, [playbackState, activeSegIdx, voiceEngine, playSegmentAudio, setPlaybackState]);

  const stopPlayback = useCallback(() => {
    playbackSessionRef.current += 1;
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.src = "";
      } catch {}
    }
    browserSpeechRef.current?.stop();
    cancelAllBrowserSpeech();
    setBrowserWords([]);
    setBrowserWordIdx(-1);
    setPlaybackState("idle");
    setCurrentAudioTime(0);
    setActiveTimeline([]);
    setTimelineSegIdx(null);
  }, [setPlaybackState]);

  const seekToWordTime = useCallback((sec: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = sec;
      setCurrentAudioTime(sec);
    }
  }, []);

  const playPrevSegment = useCallback(() => {
    if (activeSegIdx > 0) {
      const prevIdx = activeSegIdx - 1;
      setActiveSegIdx(prevIdx);
      const item = displayItems[prevIdx];
      if (item?.chunkId) {
        navigateToParagraph(item.chunkId, item.bbox);
      }
      if (playbackState === "playing") {
        playSegmentAudio(prevIdx, false);
      }
    }
  }, [activeSegIdx, displayItems, navigateToParagraph, playbackState, playSegmentAudio]);

  const playNextSegment = useCallback(() => {
    if (activeSegIdx < displayItems.length - 1) {
      const nextIdx = activeSegIdx + 1;
      setActiveSegIdx(nextIdx);
      const item = displayItems[nextIdx];
      if (item?.chunkId) {
        navigateToParagraph(item.chunkId, item.bbox);
      }
      if (playbackState === "playing") {
        playSegmentAudio(nextIdx, false);
      }
    }
  }, [activeSegIdx, displayItems, navigateToParagraph, playbackState, playSegmentAudio]);

  const touchStartY = useRef<number | null>(null);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current !== null) {
      const delta = touchStartY.current - e.changedTouches[0].clientY;
      if (!isExpanded && delta > 25) {
        onToggleMobileExpand?.();
      } else if (isExpanded && delta < -25) {
        onToggleMobileExpand?.();
      }
    }
    touchStartY.current = null;
  }, [isExpanded, onToggleMobileExpand]);

  // Handle switching between Browser Voices and AI Voices mid-playback without overlap
  const prevEngineRef = useRef(voiceEngine);
  useEffect(() => {
    if (prevEngineRef.current === voiceEngine) return;
    const oldEngine = prevEngineRef.current;
    prevEngineRef.current = voiceEngine;

    // Invalidate any in-flight synthesis
    playbackSessionRef.current += 1;

    // Hard-stop BOTH engines immediately
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.src = "";
      } catch {}
    }
    browserSpeechRef.current?.stop();
    cancelAllBrowserSpeech();
    setBrowserWords([]);
    setBrowserWordIdx(-1);
    setActiveTimeline([]);
    setTimelineSegIdx(null);
    setCurrentAudioTime(0);

    // If script dictation was actively playing, seamlessly transition the current segment to the new engine
    if (playbackState === "playing") {
      playSegmentAudioRef.current?.(activeSegIdx, isRepeatingSingleRef.current);
    }
  }, [voiceEngine, playbackState, activeSegIdx]);

  // Immediately re-synthesize current segment when voice changes mid-playback
  const prevVoiceRef = useRef(selectedVoiceId);
  useEffect(() => {
    if (prevVoiceRef.current === selectedVoiceId) return;
    prevVoiceRef.current = selectedVoiceId;

    // This effect is strictly for ElevenLabs AI voice changes; never interrupt browser speech!
    if (voiceEngine !== "ai") return;
    if (playbackState !== "playing" && playbackState !== "paused") return;
    const item = displayItems[activeSegIdx];
    if (!item) return;

    // Invalidate prior synthesis sessions
    const currentSession = ++playbackSessionRef.current;

    setBrowserWords([]);
    setBrowserWordIdx(-1);
    setActiveTimeline([]);
    setTimelineSegIdx(null);

    // Re-synthesize with new voice and resume
    (async () => {
      try {
        setIsAudioLoading(true);
        if (audioRef.current) {
          try { audioRef.current.pause(); } catch {}
        }
        const ttsData = await synthesizeElevenLabs(convertMathToSpokenTextKeepCues(item.text), selectedVoiceId);
        if (currentSession !== playbackSessionRef.current || voiceEngineRef.current !== "ai") {
          setIsAudioLoading(false);
          return;
        }
        if (!ttsData || !ttsData.audio_base64) {
          setIsAudioLoading(false);
          return;
        }

        const audioBlob = new Blob(
          [Uint8Array.from(atob(ttsData.audio_base64), (c) => c.charCodeAt(0))],
          { type: "audio/mp3" }
        );
        const audioUrl = URL.createObjectURL(audioBlob);

        // Verify again before playing
        browserSpeechRef.current?.stop();
        cancelAllBrowserSpeech();

        if (!audioRef.current) {
          audioRef.current = new Audio();
        }

        const audio = audioRef.current;
        audio.pause();
        audio.src = audioUrl;
        audio.playbackRate = selectedSpeed;

        audio.onloadedmetadata = () => {
          if (currentSession !== playbackSessionRef.current || voiceEngineRef.current !== "ai") {
            return;
          }
          setAudioDuration(audio.duration || 1);
          setIsAudioLoading(false);
          setTimelineSegIdx(activeSegIdx);
          setActiveTimeline(ttsData.words || []);
          audio.play().then(() => setPlaybackState("playing")).catch(() => setPlaybackState("idle"));
        };

        audio.ontimeupdate = () => {
          if (currentSession === playbackSessionRef.current) {
            setCurrentAudioTime(audio.currentTime);
          }
        };

        audio.onended = () => {
          if (currentSession !== playbackSessionRef.current) return;
          setActiveTimeline([]);
          setTimelineSegIdx(null);
          if (activeSegIdx < displayItems.length - 1) {
            playSegmentAudioRef.current?.(activeSegIdx + 1);
          } else {
            setPlaybackState("idle");
          }
        };

        audio.onerror = () => {
          if (currentSession !== playbackSessionRef.current) return;
          setIsAudioLoading(false);
          setActiveTimeline([]);
          setTimelineSegIdx(null);
          setPlaybackState("idle");
        };
      } catch (err) {
        if (currentSession !== playbackSessionRef.current) return;
        console.warn("Voice change re-synthesis error:", err);
        setIsAudioLoading(false);
        setActiveTimeline([]);
        setTimelineSegIdx(null);
      }
    })();
  }, [selectedVoiceId, voiceEngine, playbackState, activeSegIdx, displayItems, selectedSpeed, setPlaybackState]);

  const isPlaying = playbackState === "playing";

  if (isMobile && !isExpanded) {
    const activeItem = displayItems[activeSegIdx];
    return (
      <div
        className="glass-panel"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "56px",
          background: "rgba(2, 6, 10, 0.96)",
          borderRadius: "16px",
          border: "1px solid rgba(0, 245, 212, 0.28)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.8), 0 0 15px rgba(0, 245, 212, 0.12)",
          overflow: "hidden",
          position: "relative",
          userSelect: "none",
          flexShrink: 0,
        }}
      >
        {/* Top Draggable Border Handle */}
        <div
          onClick={onToggleMobileExpand}
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "center",
            paddingTop: "4px",
            paddingBottom: "2px",
            cursor: "pointer",
            flexShrink: 0,
          }}
          title="Drag up or tap to expand full transcript"
        >
          <div
            style={{
              width: "36px",
              height: "3px",
              borderRadius: "999px",
              background: "rgba(0, 245, 212, 0.45)",
              boxShadow: "0 0 6px rgba(0, 245, 212, 0.3)",
            }}
          />
        </div>

        {/* Content Row: Controls Trio (Backward, Play/Pause in Middle, Forward) + Page Tag + Karaoke Text */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "0 8px 4px 8px",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          {/* Controls Trio: Backward, Play/Pause in Middle, Forward */}
          <div style={{ display: "flex", alignItems: "center", gap: "3px", flexShrink: 0 }}>
            {/* Backward */}
            <button
              type="button"
              onClick={playPrevSegment}
              disabled={activeSegIdx <= 0}
              style={{
                width: "24px",
                height: "24px",
                borderRadius: "6px",
                background: "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(0, 245, 212, 0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: activeSegIdx <= 0 ? "default" : "pointer",
                color: activeSegIdx <= 0 ? "#475569" : "#00f5d4",
                opacity: activeSegIdx <= 0 ? 0.4 : 1,
                padding: 0,
              }}
              title="Previous segment"
            >
              <ChevronLeft size={13} />
            </button>

            {/* Play/Pause in Middle */}
            <button
              type="button"
              onClick={togglePlayback}
              disabled={isAudioLoading || displayItems.length === 0}
              style={{
                width: "26px",
                height: "26px",
                borderRadius: "7px",
                background: isPlaying
                  ? "linear-gradient(135deg, #00f5d4, #0d9488)"
                  : "rgba(255, 255, 255, 0.1)",
                border: `1px solid ${isPlaying ? "#00f5d4" : "rgba(0, 245, 212, 0.4)"}`,
                boxShadow: isPlaying ? "0 0 10px rgba(0, 245, 212, 0.5)" : "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: isPlaying ? "#020406" : "#fff",
                padding: 0,
              }}
              title={isPlaying ? "Pause dictation" : "Play dictation"}
            >
              {isAudioLoading ? (
                <Loader2 size={12} className="animate-spin text-teal-400" />
              ) : isPlaying ? (
                <Pause size={12} fill="#020406" />
              ) : (
                <Play size={12} fill="#fff" style={{ marginLeft: "1px" }} />
              )}
            </button>

            {/* Forward */}
            <button
              type="button"
              onClick={playNextSegment}
              disabled={activeSegIdx >= displayItems.length - 1}
              style={{
                width: "24px",
                height: "24px",
                borderRadius: "6px",
                background: "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(0, 245, 212, 0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: activeSegIdx >= displayItems.length - 1 ? "default" : "pointer",
                color: activeSegIdx >= displayItems.length - 1 ? "#475569" : "#00f5d4",
                opacity: activeSegIdx >= displayItems.length - 1 ? 0.4 : 1,
                padding: 0,
              }}
              title="Next segment"
            >
              <ChevronRight size={13} />
            </button>
          </div>

          {/* Page Tag */}
          <span
            style={{
              fontSize: "9px",
              fontFamily: "var(--font-mono)",
              color: "#5eead4",
              background: "rgba(0, 245, 212, 0.1)",
              padding: "2px 5px",
              borderRadius: "4px",
              border: "1px solid rgba(0, 245, 212, 0.25)",
              flexShrink: 0,
            }}
          >
            p.{activeItem?.bbox?.page || 1}
          </span>

          {/* Karaoke text snippet */}
          <div
            onClick={onToggleMobileExpand}
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: "11.5px",
              color: "#e2e8f0",
              cursor: "pointer",
              lineHeight: "1.4",
            }}
            title="Tap or drag up to expand"
          >
            {activeItem ? (
              <WordKaraokeText
                text={activeItem.text}
                enableMarkdown={true}
                wordsTimeline={timelineSegIdx === activeSegIdx ? activeTimeline : undefined}
                currentTime={currentAudioTime}
                browserWords={timelineSegIdx === activeSegIdx ? browserWords : undefined}
                activeWordIndex={timelineSegIdx === activeSegIdx ? browserWordIdx : -1}
                isActive={true}
                isPlaying={isPlaying}
                fontSize="11.5px"
                lineHeight="1.4"
                onSeekTime={seekToWordTime}
              />
            ) : (
              <span style={{ color: "#64748b" }}>Transcript ready</span>
            )}
          </div>

          {/* Small chevron up to hint expandable drawer */}
          <button
            type="button"
            onClick={onToggleMobileExpand}
            style={{
              background: "none",
              border: "none",
              color: "#00f5d4",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: "2px",
              flexShrink: 0,
            }}
            title="Expand transcript drawer"
          >
            <ChevronUp size={14} />
          </button>
        </div>
      </div>
    );
  }

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
      {/* Top draggable border handle in mobile expanded view */}
      {isMobile && isExpanded && (
        <div
          onClick={onToggleMobileExpand}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "center",
            paddingTop: "6px",
            paddingBottom: "4px",
            cursor: "pointer",
            background: "rgba(1, 4, 7, 0.98)",
            borderBottom: "1px solid rgba(0, 245, 212, 0.08)",
            flexShrink: 0,
          }}
          title="Drag down or tap to collapse"
        >
          <div
            style={{
              width: "40px",
              height: "3.5px",
              borderRadius: "999px",
              background: "rgba(0, 245, 212, 0.45)",
              boxShadow: "0 0 8px rgba(0, 245, 212, 0.3)",
            }}
          />
        </div>
      )}

      {/* ── Compact Header Row: All options & playback in one slim bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          background: "rgba(1, 4, 7, 0.96)",
          borderBottom: "1px solid rgba(0, 245, 212, 0.12)",
          flexShrink: 0,
          position: "relative",
          zIndex: 20,
        }}
      >
        {/* Play/Pause Button */}
        <button
          onClick={togglePlayback}
          disabled={isAudioLoading || displayItems.length === 0}
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "7px",
            background: isPlaying
              ? "linear-gradient(135deg, #00f5d4, #0d9488)"
              : "rgba(255, 255, 255, 0.08)",
            border: `1px solid ${isPlaying ? "#00f5d4" : "rgba(255, 255, 255, 0.15)"}`,
            boxShadow: isPlaying ? "0 0 14px rgba(0, 245, 212, 0.45)" : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: isPlaying ? "#020406" : "#fff",
            flexShrink: 0,
            transition: "all 0.15s ease",
          }}
          title={isPlaying ? "Pause dictation" : "Play dictation"}
        >
          {isAudioLoading ? (
            <Loader2 size={13} className="animate-spin text-teal-400" />
          ) : isPlaying ? (
            <Pause size={13} fill={isPlaying ? "#020406" : "#fff"} />
          ) : (
            <Play size={13} fill="#fff" style={{ marginLeft: "1px" }} />
          )}
        </button>

        {/* Title + Dictation Status */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "var(--text-primary)",
              fontFamily: "var(--font-heading)",
            }}
          >
            SCRIPT
          </span>
          <DictationWave active={isPlaying} />

          {/* Parsed text toggle */}
          <button
            onClick={() => setShowParsedText((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "3px",
              fontSize: "9px",
              fontFamily: "var(--font-mono)",
              background: showParsedText ? "rgba(0, 245, 212, 0.15)" : "rgba(255, 255, 255, 0.05)",
              border: `1px solid ${showParsedText ? "rgba(0, 245, 212, 0.45)" : "rgba(255, 255, 255, 0.1)"}`,
              color: showParsedText ? "#5eead4" : "#94a3b8",
              padding: "2px 6px",
              borderRadius: "4px",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            title={showParsedText ? "Showing parsed PDF text — click for AI script" : "Showing AI script — click for parsed text"}
          >
            {showParsedText ? <ToggleRight size={11} /> : <ToggleLeft size={11} />}
            <span>{showParsedText ? "RAW" : "AI"}</span>
          </button>
        </div>

        {/* Segment counter */}
        {displayItems.length > 0 && (
          <span
            style={{
              fontSize: "9.5px",
              fontFamily: "var(--font-mono)",
              color: "#00f5d4",
              background: "rgba(0, 245, 212, 0.12)",
              padding: "2px 6px",
              borderRadius: "4px",
              border: "1px solid rgba(0, 245, 212, 0.3)",
            }}
          >
            {activeSegIdx + 1}/{displayItems.length}
          </span>
        )}

        {/* Resume bookmark button if user triggered single repeat */}
        {savedResumeAnchor && (
          <button
            onClick={resumePreviousPlayback}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "9px",
              fontFamily: "var(--font-mono)",
              background: "rgba(0, 245, 212, 0.15)",
              border: "1px solid rgba(0, 245, 212, 0.5)",
              color: "#00f5d4",
              padding: "2px 7px",
              borderRadius: "4px",
              cursor: "pointer",
              boxShadow: "0 0 10px rgba(0, 245, 212, 0.2)",
              transition: "all 0.15s ease",
            }}
            title={`Resume playback from your previous bookmark (Page ${savedResumeAnchor.page})`}
          >
            <RotateCcw size={9} />
            <span>Resume (p.{savedResumeAnchor.page})</span>
          </button>
        )}

        <div style={{ flex: 1 }} />

        {/* Unified AI Script & Guidance Button */}
        <button
          type="button"
          onClick={() => {
            if (!instructionDrawerOpen) setInstructionDraft(scriptInstruction);
            setInstructionDrawerOpen((v) => !v);
          }}
          disabled={isGeneratingScript || !documentId}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
            background:
              instructionDrawerOpen || scriptInstruction.trim()
                ? "linear-gradient(135deg, rgba(13, 148, 136, 0.35), rgba(0, 245, 212, 0.18))"
                : "rgba(13, 148, 136, 0.15)",
            border: `1px solid ${
              instructionDrawerOpen || scriptInstruction.trim()
                ? "rgba(0, 245, 212, 0.6)"
                : "rgba(0, 245, 212, 0.3)"
            }`,
            color: "#5eead4",
            padding: "3px 9px",
            borderRadius: "6px",
            cursor: "pointer",
            boxShadow:
              instructionDrawerOpen || scriptInstruction.trim()
                ? "0 0 12px rgba(0, 245, 212, 0.25)"
                : "none",
            transition: "all 0.15s ease",
          }}
          title={
            scriptInstruction.trim()
              ? `AI Script: "${scriptInstruction}" (Click to view or edit)`
              : "Generate or customize AI spoken script with Gemini Flash"
          }
        >
          {isGeneratingScript ? (
            <Loader2 size={11} className="animate-spin text-teal-400" />
          ) : (
            <Sparkles size={11} color="#00f5d4" />
          )}
          <span>{isGeneratingScript ? "Writing…" : "AI Script"}</span>
          <ChevronDown
            size={10}
            color="#94a3b8"
            style={{
              transform: instructionDrawerOpen ? "rotate(180deg)" : "none",
              transition: "transform 0.18s ease",
            }}
          />
        </button>

        {/* Voice selector dropdown */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setVoiceDropdownOpen((o) => !o)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "10px",
              fontFamily: "var(--font-mono)",
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              color: "#e2e8f0",
              padding: "3px 7px",
              borderRadius: "5px",
              cursor: "pointer",
            }}
            title="Select ElevenLabs Voice"
          >
            <span>{voices.find((v) => v.voice_id === selectedVoiceId)?.name || "Voice"}</span>
            <ChevronDown size={10} color="#94a3b8" />
          </button>

          {voiceDropdownOpen && (
            <>
              <div
                onClick={() => setVoiceDropdownOpen(false)}
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 49,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: "4px",
                  width: "220px",
                  background: "rgba(2, 6, 10, 0.98)",
                  backdropFilter: "blur(20px)",
                  border: "1px solid rgba(0, 245, 212, 0.25)",
                  borderRadius: "8px",
                  padding: "4px",
                  boxShadow: "0 10px 30px rgba(0, 0, 0, 0.8), 0 0 20px rgba(0, 245, 212, 0.12)",
                  zIndex: 50,
                  maxHeight: "340px",
                  overflowY: "auto",
                }}
              >
                {voices.map((v) => (
                  <div
                    key={v.voice_id}
                    onClick={() => {
                      if (previewAudioRef.current) {
                        previewAudioRef.current.pause();
                        previewAudioRef.current.currentTime = 0;
                        setPreviewingVoiceId(null);
                      }
                      setSelectedVoiceId(v.voice_id);
                      setSelectedElevenVoice(v.voice_id);
                      if (voiceEngine !== "ai") {
                        setVoiceEngine("ai");
                      }
                      setVoiceDropdownOpen(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 8px",
                      fontSize: "11px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      color: v.voice_id === selectedVoiceId ? "#00f5d4" : "#cbd5e1",
                      background: v.voice_id === selectedVoiceId ? "rgba(0, 245, 212, 0.16)" : "transparent",
                      transition: "all 0.1s ease",
                      gap: "6px",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>{v.name}</span>
                        {v.voice_id === selectedVoiceId && (
                          <span
                            style={{
                              fontSize: "8.5px",
                              fontFamily: "var(--font-mono)",
                              color: "#00f5d4",
                              background: "rgba(0, 245, 212, 0.15)",
                              padding: "1px 4px",
                              borderRadius: "3px",
                            }}
                          >
                            Active
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: "9px",
                          color: "#64748b",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {v.description}
                      </div>
                    </div>

                    {/* Voice demo audio clip button */}
                    {v.preview_url && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleVoicePreview(v);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "22px",
                          height: "22px",
                          borderRadius: "5px",
                          background:
                            previewingVoiceId === v.voice_id
                              ? "linear-gradient(135deg, #00f5d4, #0d9488)"
                              : "rgba(0, 245, 212, 0.12)",
                          border: `1px solid ${
                            previewingVoiceId === v.voice_id
                              ? "#00f5d4"
                              : "rgba(0, 245, 212, 0.3)"
                          }`,
                          color: previewingVoiceId === v.voice_id ? "#020406" : "#00f5d4",
                          boxShadow:
                            previewingVoiceId === v.voice_id
                              ? "0 0 10px rgba(0, 245, 212, 0.6)"
                              : "none",
                          cursor: "pointer",
                          flexShrink: 0,
                          transition: "all 0.15s ease",
                          padding: 0,
                        }}
                        title={
                          previewingVoiceId === v.voice_id
                            ? "Stop demo clip"
                            : `Listen to sample of ${v.name}'s voice`
                        }
                      >
                        {previewingVoiceId === v.voice_id ? (
                          <Square size={9} fill="#020406" />
                        ) : (
                          <Volume2 size={11} />
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Speed toggle */}
        <select
          value={selectedSpeed}
          onChange={(e) => {
            const spd = parseFloat(e.target.value);
            setSelectedSpeed(spd);
            if (audioRef.current) audioRef.current.playbackRate = spd;
          }}
          style={{
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            color: "#e2e8f0",
            padding: "2px 4px",
            borderRadius: "5px",
            cursor: "pointer",
            outline: "none",
          }}
          title="Playback speed"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s} style={{ background: "#020406" }}>
              {s}x
            </option>
          ))}
        </select>

        {/* Mobile Expanded Actions: Open Chat FAB & Collapse Sheet */}
        {isMobile && isExpanded && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "auto" }}>
            {onOpenChat && (
              <button
                type="button"
                onClick={onOpenChat}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "10px",
                  fontFamily: "var(--font-mono)",
                  padding: "3px 8px",
                  borderRadius: "6px",
                  background: "rgba(0, 245, 212, 0.15)",
                  border: "1px solid rgba(0, 245, 212, 0.4)",
                  color: "#00f5d4",
                  cursor: "pointer",
                }}
                title="Open Chat"
              >
                <MessageSquare size={11} />
                <span>Chat</span>
              </button>
            )}
            <button
              type="button"
              onClick={onToggleMobileExpand}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "24px",
                height: "24px",
                borderRadius: "6px",
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                color: "#94a3b8",
                cursor: "pointer",
              }}
              title="Collapse Drawer"
            >
              <ChevronDown size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Collapsible Script Guidance & Generation Drawer */}
      {instructionDrawerOpen && (
        <div
          style={{
            padding: "10px 12px",
            background: "linear-gradient(180deg, rgba(2, 10, 16, 0.98), rgba(1, 6, 10, 0.98))",
            borderBottom: "1px solid rgba(0, 245, 212, 0.22)",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.6)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            flexShrink: 0,
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          {/* Header row inside drawer */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Sparkles size={12} color="#00f5d4" />
              <span
                style={{
                  fontSize: "10.5px",
                  fontFamily: "var(--font-heading)",
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  color: "#f0fdfa",
                }}
              >
                AI SCRIPT GUIDANCE & GENERATION
              </span>
            </div>
            <button
              type="button"
              onClick={() => setInstructionDrawerOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "#64748b",
                cursor: "pointer",
                padding: "2px",
                display: "flex",
                alignItems: "center",
              }}
              title="Close guidance drawer"
            >
              <X size={12} />
            </button>
          </div>

          {/* Quick preset chips */}
          <div style={{ display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: "#64748b" }}>
              Presets:
            </span>
            {[
              { label: "Full PDF", prompt: "" },
              { label: "Key Concepts", prompt: "Focus strictly on key concepts and core takeaways in concise, spoken sentences." },
              { label: "Simple & Clear", prompt: "Explain everything in simple, friendly, conversational language without heavy jargon." },
              { label: "Deep Dive", prompt: "Provide thorough coverage with detailed explanations of formulas and concepts." },
            ].map((p) => {
              const isActive = (instructionDraft.trim() === "" && p.prompt === "") || instructionDraft.trim() === p.prompt;
              return (
                <button
                  key={p.label}
                  type="button"
                  disabled={isGeneratingScript}
                  onClick={() => setInstructionDraft(p.prompt)}
                  style={{
                    fontSize: "9.5px",
                    fontFamily: "var(--font-mono)",
                    padding: "2px 7px",
                    borderRadius: "4px",
                    background: isActive ? "rgba(0, 245, 212, 0.18)" : "rgba(255, 255, 255, 0.04)",
                    border: `1px solid ${isActive ? "rgba(0, 245, 212, 0.5)" : "rgba(255, 255, 255, 0.1)"}`,
                    color: isActive ? "#00f5d4" : "#94a3b8",
                    cursor: "pointer",
                    transition: "all 0.12s ease",
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <textarea
            rows={2}
            value={instructionDraft}
            onChange={(e) => setInstructionDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                if (isGeneratingScript) return;
                const next = instructionDraft.trim();
                setInstructionDrawerOpen(false);
                regenerateWithInstruction(next);
              }
            }}
            placeholder="Customize script: specify portion/page coverage, smart cross-links, tone, style, or sequence (Ctrl+Enter to generate)…"
            style={{
              width: "100%",
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(0, 245, 212, 0.28)",
              borderRadius: "6px",
              padding: "6px 8px",
              fontSize: "11.5px",
              lineHeight: "1.45",
              color: "#e2e8f0",
              outline: "none",
              resize: "vertical",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />

          <div style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "space-between" }}>
            <span style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: "#64748b" }}>
              Ctrl+Enter to generate
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {(scriptInstruction.trim() || instructionDraft.trim()) && (
                <button
                  type="button"
                  disabled={isGeneratingScript}
                  onClick={async () => {
                    setInstructionDraft("");
                    setInstructionDrawerOpen(false);
                    await regenerateWithInstruction("");
                  }}
                  style={{
                    fontSize: "10px",
                    fontFamily: "var(--font-mono)",
                    padding: "3px 8px",
                    borderRadius: "5px",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.14)",
                    color: "#94a3b8",
                    cursor: "pointer",
                    transition: "all 0.12s ease",
                  }}
                  title="Clear custom guidance and regenerate default full PDF script"
                >
                  Reset (Full PDF)
                </button>
              )}
              <button
                type="button"
                disabled={isGeneratingScript || !documentId}
                onClick={async () => {
                  const next = instructionDraft.trim();
                  setInstructionDrawerOpen(false);
                  await regenerateWithInstruction(next);
                }}
                style={{
                  fontSize: "10.5px",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "4px 12px",
                  borderRadius: "5px",
                  background: "linear-gradient(135deg, rgba(13, 148, 136, 0.35), rgba(0, 245, 212, 0.25))",
                  border: "1px solid rgba(0, 245, 212, 0.6)",
                  color: "#00f5d4",
                  boxShadow: "0 0 12px rgba(0, 245, 212, 0.25)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {isGeneratingScript ? (
                  <>
                    <Loader2 size={11} className="animate-spin text-teal-400" />
                    <span>Writing…</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={11} color="#00f5d4" />
                    <span>{instructionDraft.trim() ? "Apply & Rewrite" : "Generate Script"}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scrub progress line */}
      <div
        style={{
          width: "100%",
          height: "2px",
          background: "rgba(255, 255, 255, 0.05)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: `${Math.min(100, (currentAudioTime / audioDuration) * 100)}%`,
            height: "100%",
            background: "linear-gradient(90deg, #0d9488, #00f5d4)",
            transition: "width 0.1s linear",
          }}
        />
      </div>

      {/* ── Teleprompter Content (Takes 100% of remaining vertical space) ── */}
      <div
        ref={scrollContainerRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "16px 14px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {isGeneratingScript ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px",
            }}
          >
            <CyberMascotLoader
              size="md"
              mode="dictating"
              title="Crafting Narrative Script…"
              subtitle="Creating concise spoken lines synced to PDF equations & bounding boxes"
            />
          </div>
        ) : displayItems.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-secondary)",
              fontSize: "13px",
              gap: "10px",
              padding: "20px",
              textAlign: "center",
            }}
          >
            <Sparkles size={22} color="#00f5d4" />
            <span style={{ fontWeight: 500, color: "#cbd5e1" }}>No spoken script generated yet.</span>
            <button
              onClick={handleGenerateScript}
              disabled={isGeneratingScript}
              className="btn-tool"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                borderRadius: "8px",
                background: "rgba(0, 245, 212, 0.15)",
                border: "1px solid rgba(0, 245, 212, 0.4)",
                color: "#5eead4",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              <Sparkles size={12} color="#00f5d4" />
              <span>Generate AI Script</span>
            </button>
          </div>
        ) : (
          displayItems.map((item, i) => {
            const isActive = i === activeSegIdx;
            const dist = Math.abs(i - activeSegIdx);
            const opacity = isActive ? 1.0 : dist === 1 ? 0.65 : 0.35;

            return (
              <div
                key={item.id}
                id={`transcript-seg-${i}`}
                onClick={() => {
                  setActiveSegIdx(i);
                  const targetId = item.chunkId || item.id;
                  setActiveParagraph(targetId);
                  navigateToParagraph(targetId, item.bbox);
                  isRepeatingSingleRef.current = false;
                  playSegmentAudio(i, false);
                }}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  cursor: "pointer",
                  opacity,
                  background: isActive
                    ? "linear-gradient(135deg, rgba(4, 47, 49, 0.5), rgba(2, 10, 14, 0.8))"
                    : "transparent",
                  border: isActive
                    ? "1.5px solid rgba(0, 245, 212, 0.55)"
                    : "1.5px solid transparent",
                  boxShadow: isActive ? "0 4px 22px rgba(0, 245, 212, 0.2)" : "none",
                  transition: "all 0.2s ease",
                  position: "relative",
                }}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: "8px",
                      bottom: "8px",
                      width: "3px",
                      borderRadius: "0 2px 2px 0",
                      background: "linear-gradient(180deg, #00f5d4, #0d9488)",
                    }}
                  />
                )}

                {/* Page indicator pill & audio loading badge */}
                <div style={{ display: "flex", flexDirection: "column", gap: "3px", flexShrink: 0, marginTop: "2px" }}>
                  <div
                    style={{
                      fontSize: "9px",
                      fontFamily: "var(--font-mono)",
                      color: isActive ? "#00f5d4" : "#64748b",
                      padding: "2px 5px",
                      borderRadius: "4px",
                      background: "rgba(255, 255, 255, 0.04)",
                      textAlign: "center",
                    }}
                  >
                    p.{item.page}
                  </div>
                  {((item as any).chunkType === "image" || (item as any).imageUrl || item.text.startsWith("[Figure")) && (
                    <div
                      style={{
                        fontSize: "8.5px",
                        fontFamily: "var(--font-mono)",
                        color: "#c084fc",
                        background: "rgba(168, 85, 247, 0.15)",
                        border: "1px solid rgba(192, 132, 252, 0.35)",
                        borderRadius: "3px",
                        padding: "1px 4px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "2px",
                      }}
                      title="Figure / Diagram"
                    >
                      <ImageIcon size={7} />
                      <span>FIG</span>
                    </div>
                  )}
                  {isActive && isAudioLoading && (
                    <div
                      style={{
                        fontSize: "8px",
                        fontFamily: "var(--font-mono)",
                        color: "#5eead4",
                        display: "flex",
                        alignItems: "center",
                        gap: "2px",
                        padding: "1px 3px",
                      }}
                      title="Generating voice audio…"
                    >
                      <Loader2 size={8} className="animate-spin text-teal-400" />
                      <span>audio</span>
                    </div>
                  )}
                </div>

                {/* Karaoke word text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <WordKaraokeText
                    text={item.text}
                    enableMarkdown={true}
                    wordsTimeline={isActive && timelineSegIdx === i ? activeTimeline : undefined}
                    currentTime={currentAudioTime}
                    browserWords={isActive && timelineSegIdx === i ? browserWords : undefined}
                    activeWordIndex={isActive && timelineSegIdx === i ? browserWordIdx : -1}
                    isActive={isActive}
                    isPlaying={isPlaying}
                    fontSize="13.5px"
                    lineHeight="1.75"
                    inactiveColor="rgba(203, 213, 225, 0.6)"
                    onSeekTime={seekToWordTime}
                    onSeekWordIndex={(wordIdx) => {
                      setActiveSegIdx(i);
                      const targetId = item.chunkId || item.id;
                      setActiveParagraph(targetId);
                      navigateToParagraph(targetId, item.bbox);
                      playBrowserSpeech(convertMathToSpokenText(item.text), i, wordIdx);
                    }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Chapter Heading Toast in Bottom Right (Temporary for a few seconds on chapter start) ── */}
      {activeChapterToast && (
        <div
          style={{
            position: "absolute",
            bottom: "16px",
            right: "16px",
            zIndex: 40,
            maxWidth: "75%",
            padding: "8px 12px",
            background: "rgba(2, 6, 10, 0.95)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            borderRadius: "10px",
            border: "1px solid rgba(0, 245, 212, 0.45)",
            boxShadow: "0 8px 30px rgba(0, 0, 0, 0.8), 0 0 18px rgba(0, 245, 212, 0.25)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            pointerEvents: "none",
            transform: toastVisible ? "translateY(0) scale(1)" : "translateY(12px) scale(0.95)",
            opacity: toastVisible ? 1 : 0,
            transition: "all 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <div
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "#00f5d4",
              boxShadow: "0 0 8px #00f5d4",
              flexShrink: 0,
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <span
              style={{
                fontSize: "9px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#00f5d4",
                fontFamily: "var(--font-mono)",
              }}
            >
              Chapter / Section
            </span>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "#f8fafc",
                lineHeight: "1.3",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={activeChapterToast}
            >
              {activeChapterToast}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
