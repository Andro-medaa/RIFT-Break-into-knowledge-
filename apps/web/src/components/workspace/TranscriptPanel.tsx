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
  Sparkles,
  Loader2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useWorkspace } from "@/lib/workspace";
import {
  generateScript,
  synthesizeElevenLabs,
  getElevenLabsVoices,
  type VoiceOption,
  type WordTimestamp,
} from "@/lib/api";

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

/* ── 4 curated ElevenLabs Voices (2 male, 2 female) ──────────────────────── */
const FOUR_VOICES: VoiceOption[] = [
  { voice_id: "pNInz6obpgDQGcFmaJgB", name: "Adam", description: "Male (Deep & Grounded)", category: "premade" },
  { voice_id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", description: "Female (Soft & Gentle)", category: "premade" },
  { voice_id: "tSVwqkJGEKjLklhiN0Nx", name: "Viraj", description: "Male (Rich Narrator)", category: "premade" },
  { voice_id: "m4hBEimiy2ffkQ0hHMVD", name: "Katie", description: "Female (Authentic & Clear)", category: "premade" },
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
            background: "linear-gradient(180deg, #38bdf8, #818cf8)",
            borderRadius: "2px",
            animationDelay: `${i * 0.12}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ── ElevenLabs-style Word-Level Karaoke Text ────────────────────────────── */
function KaraokeSegmentText({
  text,
  wordsTimeline,
  currentTime,
  isActiveSeg,
  isPlaying,
  onSeekWord,
}: {
  text: string;
  wordsTimeline: WordTimestamp[];
  currentTime: number;
  isActiveSeg: boolean;
  isPlaying: boolean;
  onSeekWord: (sec: number) => void;
}) {
  // If we have precise timestamps from ElevenLabs for the active segment
  if (isActiveSeg && wordsTimeline.length > 0) {
    return (
      <div style={{ lineHeight: "1.75", fontSize: "13.5px" }}>
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
                  : "rgba(148, 163, 184, 0.65)",
                fontWeight: isCurrent ? 600 : 400,
                textShadow: isCurrent ? "0 0 10px rgba(34, 211, 238, 0.8)" : "none",
                transform: isCurrent ? "scale(1.05)" : "scale(1)",
                border: isCurrent
                  ? "1px solid rgba(34, 211, 238, 0.45)"
                  : "1px solid transparent",
              }}
              title={`At ${item.start.toFixed(2)}s - click to play`}
            >
              {item.word}{" "}
            </span>
          );
        })}
      </div>
    );
  }

  // Fallback presentation for inactive segments or before audio starts
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <div
      style={{
        lineHeight: "1.75",
        fontSize: "13.5px",
        color: isActiveSeg ? "#f1f5f9" : "rgba(203, 213, 225, 0.6)",
      }}
    >
      {words.join(" ")}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main TranscriptPanel
══════════════════════════════════════════════════════════════════════════════ */
export default function TranscriptPanel() {
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
  } = useWorkspace();

  // Voice & Language state (guaranteed 4 voices: Adam, Bella, Viraj, Katie)
  const [voices, setVoices] = useState<VoiceOption[]>(FOUR_VOICES);
  const [selectedVoiceId, setSelectedVoiceId] = useState(selectedElevenVoice || "pNInz6obpgDQGcFmaJgB");
  const [selectedLang, setSelectedLang] = useState("en");
  const [selectedSpeed, setSelectedSpeed] = useState(1.0);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [voiceDropdownOpen, setVoiceDropdownOpen] = useState(false);
  const [showParsedText, setShowParsedText] = useState(false);

  // Keep workspace voice synced with Transcript panel voice
  useEffect(() => {
    if (selectedVoiceId && setSelectedElevenVoice) {
      setSelectedElevenVoice(selectedVoiceId);
    }
  }, [selectedVoiceId, setSelectedElevenVoice]);

  // Audio Playback & Karaoke state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeSegIdx, setActiveSegIdx] = useState(0);
  const [currentAudioTime, setCurrentAudioTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(1);
  const [activeTimeline, setActiveTimeline] = useState<WordTimestamp[]>([]);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Segments to display: AI script by default, or parsed text when toggled
  const displayItems = useMemo(() => {
    if (showParsedText && paragraphs.length > 0) {
      return paragraphs.map((p, idx) => ({
        id: p.id,
        chunkId: p.id,
        text: p.text,
        page: p.bbox?.page ?? 1,
        bbox: p.bbox,
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
        idx,
      }));
    }
    return [];
  }, [scriptSegments, paragraphs, showParsedText]);

  // Load voices from backend while ensuring all 4 voices (Adam, Bella, Viraj, Katie) are preserved
  useEffect(() => {
    getElevenLabsVoices()
      .then((vList) => {
        if (vList && vList.length > 0) {
          const map = new Map<string, VoiceOption>();
          FOUR_VOICES.forEach((v) => map.set(v.name.toLowerCase(), v));
          vList.forEach((v) => {
            const key = v.name.toLowerCase();
            if (map.has(key)) {
              map.set(key, { ...map.get(key)!, voice_id: v.voice_id });
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

    let cancelled = false;
    setIsGeneratingScript(true);

    generateScript(documentId, "natural", selectedLang, false, paragraphs)
      .then((res) => {
        if (!cancelled && res && res.segments && res.segments.length > 0) {
          setScriptSegments(res.segments);
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
  }, [documentId, selectedLang, scriptSegments, paragraphs, setScriptSegments, setActiveParagraph, navigateToParagraph]);

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

  // Teleprompter smooth auto-center scroll to active segment
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
  }, [activeSegIdx]);

  /* ── Generate AI Script with Gemini ────────────────────────────────────── */
  const handleGenerateScript = useCallback(async () => {
    if (!documentId) return;
    setIsGeneratingScript(true);
    try {
      // Force regeneration — deletes cache and creates fresh script
      const res = await generateScript(documentId, "natural", selectedLang, true, paragraphs);
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
  }, [documentId, selectedLang, setScriptSegments, setActiveParagraph, navigateToParagraph]);

  /* ── Synthesize & Play Segment Audio ───────────────────────────────────── */
  const playSegmentAudio = useCallback(
    async (segIndex: number) => {
      const item = displayItems[segIndex];
      if (!item) return;

      setActiveSegIdx(segIndex);
      const targetId = item.chunkId || item.id;
      setActiveParagraph(targetId);
      navigateToParagraph(targetId, item.bbox);
      setIsAudioLoading(true);

      try {
        const ttsData = await synthesizeElevenLabs(item.text, selectedVoiceId);
        if (!ttsData || !ttsData.audio_base64) {
          setIsAudioLoading(false);
          return;
        }

        const audioBlob = new Blob(
          [Uint8Array.from(atob(ttsData.audio_base64), (c) => c.charCodeAt(0))],
          { type: "audio/mp3" }
        );
        const audioUrl = URL.createObjectURL(audioBlob);

        if (!audioRef.current) {
          audioRef.current = new Audio();
        }

        const audio = audioRef.current;
        audio.src = audioUrl;
        audio.playbackRate = selectedSpeed;
        setActiveTimeline(ttsData.words || []);
        setCurrentAudioTime(0);

        audio.onloadedmetadata = () => {
          setAudioDuration(audio.duration || 1);
          setIsAudioLoading(false);
          audio.play().then(() => setPlaybackState("playing")).catch(() => setPlaybackState("idle"));
        };

        audio.ontimeupdate = () => {
          setCurrentAudioTime(audio.currentTime);
        };

        audio.onended = () => {
          if (segIndex < displayItems.length - 1) {
            playSegmentAudio(segIndex + 1);
          } else {
            setPlaybackState("idle");
            setActiveTimeline([]);
          }
        };

        audio.onerror = () => {
          setIsAudioLoading(false);
          setPlaybackState("idle");
        };
      } catch (err) {
        console.warn("TTS error:", err);
        setIsAudioLoading(false);
        setPlaybackState("idle");
      }
    },
    [displayItems, selectedVoiceId, selectedSpeed, setActiveParagraph, navigateToParagraph, setPlaybackState]
  );

  const togglePlayback = useCallback(() => {
    if (playbackState === "playing") {
      audioRef.current?.pause();
      setPlaybackState("paused");
    } else if (playbackState === "paused") {
      audioRef.current?.play();
      setPlaybackState("playing");
    } else {
      playSegmentAudio(activeSegIdx);
    }
  }, [playbackState, activeSegIdx, playSegmentAudio, setPlaybackState]);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlaybackState("idle");
    setCurrentAudioTime(0);
    setActiveTimeline([]);
  }, [setPlaybackState]);

  const seekToWordTime = useCallback((sec: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = sec;
      setCurrentAudioTime(sec);
    }
  }, []);

  // Item 4: Immediately re-synthesize current segment when voice changes mid-playback
  const prevVoiceRef = useRef(selectedVoiceId);
  useEffect(() => {
    if (prevVoiceRef.current === selectedVoiceId) return;
    prevVoiceRef.current = selectedVoiceId;

    // Only re-synthesize if currently playing
    if (playbackState !== "playing" && playbackState !== "paused") return;
    const item = displayItems[activeSegIdx];
    if (!item) return;

    // Re-synthesize with new voice and resume
    (async () => {
      try {
        setIsAudioLoading(true);
        const ttsData = await synthesizeElevenLabs(item.text, selectedVoiceId);
        if (!ttsData || !ttsData.audio_base64) {
          setIsAudioLoading(false);
          return;
        }

        const audioBlob = new Blob(
          [Uint8Array.from(atob(ttsData.audio_base64), (c) => c.charCodeAt(0))],
          { type: "audio/mp3" }
        );
        const audioUrl = URL.createObjectURL(audioBlob);

        if (!audioRef.current) {
          audioRef.current = new Audio();
        }

        const audio = audioRef.current;
        audio.pause();
        audio.src = audioUrl;
        audio.playbackRate = selectedSpeed;
        setActiveTimeline(ttsData.words || []);

        audio.onloadedmetadata = () => {
          setAudioDuration(audio.duration || 1);
          setIsAudioLoading(false);
          audio.play().then(() => setPlaybackState("playing")).catch(() => setPlaybackState("idle"));
        };

        audio.ontimeupdate = () => {
          setCurrentAudioTime(audio.currentTime);
        };

        audio.onended = () => {
          if (activeSegIdx < displayItems.length - 1) {
            playSegmentAudio(activeSegIdx + 1);
          } else {
            setPlaybackState("idle");
            setActiveTimeline([]);
          }
        };

        audio.onerror = () => {
          setIsAudioLoading(false);
          setPlaybackState("idle");
        };
      } catch (err) {
        console.warn("Voice change re-synthesis error:", err);
        setIsAudioLoading(false);
      }
    })();
  }, [selectedVoiceId, playbackState, activeSegIdx, displayItems, selectedSpeed, setPlaybackState, playSegmentAudio]);

  const isPlaying = playbackState === "playing";

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
      {/* ── Compact Header Row: All options & playback in one slim bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          background: "rgba(8, 12, 22, 0.95)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.07)",
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
              ? "linear-gradient(135deg, #06b6d4, #2563eb)"
              : "rgba(255, 255, 255, 0.08)",
            border: `1px solid ${isPlaying ? "#38bdf8" : "rgba(255, 255, 255, 0.15)"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#fff",
            flexShrink: 0,
            transition: "all 0.15s ease",
          }}
          title={isPlaying ? "Pause dictation" : "Play dictation"}
        >
          {isAudioLoading ? (
            <Loader2 size={13} className="animate-spin text-cyan-400" />
          ) : isPlaying ? (
            <Pause size={13} fill="#fff" />
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
              background: showParsedText ? "rgba(139, 92, 246, 0.15)" : "rgba(255, 255, 255, 0.05)",
              border: `1px solid ${showParsedText ? "rgba(139, 92, 246, 0.4)" : "rgba(255, 255, 255, 0.1)"}`,
              color: showParsedText ? "#c084fc" : "#94a3b8",
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
              color: "#38bdf8",
              background: "rgba(6, 182, 212, 0.12)",
              padding: "2px 6px",
              borderRadius: "4px",
              border: "1px solid rgba(6, 182, 212, 0.25)",
            }}
          >
            {activeSegIdx + 1}/{displayItems.length}
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* AI Script Generation button */}
        <button
          onClick={handleGenerateScript}
          disabled={isGeneratingScript || !documentId}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
            background: "linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(6, 182, 212, 0.2))",
            border: "1px solid rgba(139, 92, 246, 0.4)",
            color: "#c084fc",
            padding: "3px 8px",
            borderRadius: "6px",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
          title="Generate clean 1-2 sentence spoken script segments with Gemini Flash"
        >
          {isGeneratingScript ? (
            <Loader2 size={11} className="animate-spin text-purple-400" />
          ) : (
            <Sparkles size={11} color="#c084fc" />
          )}
          <span>{isGeneratingScript ? "Writing..." : "AI Script"}</span>
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
                  width: "165px",
                  background: "rgba(15, 23, 42, 0.96)",
                  backdropFilter: "blur(16px)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "8px",
                  padding: "4px",
                  boxShadow: "0 10px 25px rgba(0, 0, 0, 0.6)",
                  zIndex: 50,
                }}
              >
                {voices.map((v) => (
                  <div
                    key={v.voice_id}
                    onClick={() => {
                      setSelectedVoiceId(v.voice_id);
                      setSelectedElevenVoice(v.voice_id);
                      setVoiceDropdownOpen(false);
                    }}
                    style={{
                      padding: "6px 8px",
                      fontSize: "11px",
                      borderRadius: "5px",
                      cursor: "pointer",
                      color: v.voice_id === selectedVoiceId ? "#38bdf8" : "#cbd5e1",
                      background: v.voice_id === selectedVoiceId ? "rgba(6, 182, 212, 0.18)" : "transparent",
                      transition: "all 0.1s ease",
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{v.name}</div>
                    <div style={{ fontSize: "9px", color: "#64748b" }}>{v.description}</div>
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
            <option key={s} value={s} style={{ background: "#0f172a" }}>
              {s}x
            </option>
          ))}
        </select>
      </div>

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
            background: "linear-gradient(90deg, #06b6d4, #818cf8)",
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
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-secondary)",
              gap: "12px",
              padding: "24px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                border: "2px solid rgba(6, 182, 212, 0.25)",
                borderTopColor: "#22d3ee",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Sparkles size={14} className="text-cyan-400" />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#f1f5f9" }}>
                Generating AI Spoken Script…
              </span>
            </div>
            <span style={{ fontSize: "11px", color: "#64748b", maxWidth: "240px", lineHeight: "1.5" }}>
              Creating concise spoken lines synced to PDF bounding boxes
            </span>
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
            <Sparkles size={22} color="#06b6d4" />
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
                background: "rgba(6, 182, 212, 0.15)",
                border: "1px solid rgba(6, 182, 212, 0.35)",
                color: "#67e8f9",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              <Sparkles size={12} />
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
                  playSegmentAudio(i);
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
                    ? "linear-gradient(135deg, rgba(8, 47, 73, 0.45), rgba(15, 23, 42, 0.7))"
                    : "transparent",
                  border: isActive
                    ? "1px solid rgba(34, 211, 238, 0.4)"
                    : "1px solid transparent",
                  boxShadow: isActive ? "0 4px 20px rgba(6, 182, 212, 0.12)" : "none",
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
                      background: "linear-gradient(180deg, #38bdf8, #818cf8)",
                    }}
                  />
                )}

                {/* Page indicator pill */}
                <div
                  style={{
                    fontSize: "9px",
                    fontFamily: "var(--font-mono)",
                    color: isActive ? "#38bdf8" : "#64748b",
                    padding: "2px 5px",
                    borderRadius: "4px",
                    background: "rgba(255, 255, 255, 0.04)",
                    flexShrink: 0,
                    marginTop: "2px",
                  }}
                >
                  p.{item.page}
                </div>

                {/* Karaoke word text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <KaraokeSegmentText
                    text={item.text}
                    wordsTimeline={isActive ? activeTimeline : []}
                    currentTime={currentAudioTime}
                    isActiveSeg={isActive}
                    isPlaying={isPlaying}
                    onSeekWord={seekToWordTime}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
