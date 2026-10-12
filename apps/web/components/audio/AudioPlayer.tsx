'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LessonSegment, MoveType } from '../../types/lesson';
import { Waveform } from './Waveform';
import { saveSessionCursor } from '../../lib/storage/indexedDb';
import confetti from 'canvas-confetti';

interface AudioPlayerProps {
  segments: LessonSegment[];
  activeSegOrd?: number;
  activeSentIdx?: number;
  sessionId?: string;
  docId?: string | null;
  docTitle?: string;
  onActiveSentenceChange: (segOrd: number, sentIdx: number, chunkIds: string[]) => void;
  apiBaseUrl?: string;
}

const MOVE_COLORS: Record<MoveType, string> = {
  intro: '#34d399',
  explain: '#38bdf8',
  example: '#c084fc',
  analogy: '#fbbf24',
  check: '#fb7185',
  recap: '#818cf8',
};

const MOVE_EXAGGERATION: Record<MoveType, number> = {
  intro: 0.35,
  explain: 0.40,
  example: 0.65,
  analogy: 0.75,
  check: 0.55,
  recap: 0.30,
};

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  segments,
  activeSegOrd = 0,
  activeSentIdx = 0,
  sessionId,
  docId,
  docTitle = 'Document',
  onActiveSentenceChange,
  apiBaseUrl = 'http://localhost:8000',
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [segIdx, setSegIdx] = useState<number>(activeSegOrd);
  const [sentIdx, setSentIdx] = useState<number>(activeSentIdx);
  const [speed, setSpeed] = useState<number>(1.0);
  const [loadingAudio, setLoadingAudio] = useState<boolean>(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  const abortCtrlRef = useRef<AbortController | null>(null);

  // Sync external cursor props if changed
  useEffect(() => {
    if (activeSegOrd !== segIdx && activeSegOrd < segments.length) {
      setSegIdx(activeSegOrd);
    }
  }, [activeSegOrd, segments.length, segIdx]);

  // Guaranteed flush on page unload or backgrounding
  useEffect(() => {
    const flushCursor = () => {
      if (sessionId && docId) {
        saveSessionCursor({
          sessionId,
          docId,
          docTitle,
          segOrd: segIdx,
          sentIdx: sentIdx,
          segments,
          updatedAt: Date.now(),
        }).catch(() => {});

        fetch(`${apiBaseUrl}/sessions/${sessionId}/cursor`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seg_ord: segIdx, sent_idx: sentIdx }),
          keepalive: true,
        }).catch(() => {});
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushCursor();
      }
    };

    window.addEventListener('beforeunload', flushCursor);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', flushCursor);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [sessionId, docId, docTitle, segIdx, sentIdx, segments, apiBaseUrl]);

  const currentSegment = segments[segIdx] || segments[0];
  const currentSentence = currentSegment?.sentences[sentIdx] || currentSegment?.sentences[0];
  const currentMove: MoveType = currentSegment ? currentSegment.move : 'explain';
  const emotionColor = MOVE_COLORS[currentMove] || '#38bdf8';
  const exaggeration = MOVE_EXAGGERATION[currentMove] || 0.40;

  // Initialize Web Audio Context & Analyser
  const ensureAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtxClass();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;
      analyser.connect(ctx.destination);

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return { ctx: audioCtxRef.current, analyser: analyserRef.current };
  }, []);

  // Fetch and decode sentence audio
  const fetchAudioBuffer = useCallback(
    async (text: string, move: MoveType, speedVal: number): Promise<AudioBuffer | null> => {
      const cacheKey = `${text}:${move}:${speedVal.toFixed(2)}`;
      if (bufferCacheRef.current.has(cacheKey)) {
        return bufferCacheRef.current.get(cacheKey)!;
      }

      const { ctx } = ensureAudioContext();
      if (!ctx) return null;

      const fallbacks = [apiBaseUrl, 'http://127.0.0.1:8000'];
      for (const base of fallbacks) {
        try {
          const res = await fetch(`${base}/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, move, speed: speedVal }),
          });
          if (!res.ok) continue;

          const arrayBuf = await res.arrayBuffer();
          const decoded = await ctx.decodeAudioData(arrayBuf);
          bufferCacheRef.current.set(cacheKey, decoded);
          return decoded;
        } catch {
          // Try next fallback
        }
      }
      return null;
    },
    [apiBaseUrl, ensureAudioContext]
  );

  // Stop currently playing audio node immediately (barge-in / pause support)
  const stopCurrentAudio = useCallback(() => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.onended = null;
        currentSourceRef.current.stop();
        currentSourceRef.current.disconnect();
      } catch {
        // Source node already stopped
      }
      currentSourceRef.current = null;
    }
  }, []);

  // Play audio for a specific segment and sentence index
  const playSentence = useCallback(
    async (targetSeg: number, targetSent: number, speedMultiplier: number = speed) => {
      if (targetSeg >= segments.length) {
        setIsPlaying(false);
        return;
      }

      const segment = segments[targetSeg];
      if (!segment || targetSent >= segment.sentences.length) {
        // Move to next segment
        if (targetSeg + 1 < segments.length) {
          playSentence(targetSeg + 1, 0, speedMultiplier);
        } else {
          setIsPlaying(false);
        }
        return;
      }

      stopCurrentAudio();
      setSegIdx(targetSeg);
      setSentIdx(targetSent);
      setLoadingAudio(true);

      const sentence = segment.sentences[targetSent];
      // Notify parent to highlight synced chunk in PDF viewer
      onActiveSentenceChange(targetSeg, targetSent, segment.chunk_ids);

      // Persist cursor to backend session if sessionId provided
      if (sessionId) {
        fetch(`${apiBaseUrl}/sessions/${sessionId}/cursor`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seg_ord: targetSeg, sent_idx: targetSent }),
        }).catch(() => {});
      }

      // Persist to local IndexedDB for instant tab reload resumption
      if (sessionId && docId) {
        saveSessionCursor({
          sessionId,
          docId,
          docTitle,
          segOrd: targetSeg,
          sentIdx: targetSent,
          segments,
          updatedAt: Date.now(),
        }).catch(() => {});
      }

      const buffer = await fetchAudioBuffer(sentence.text, segment.move, speedMultiplier);
      setLoadingAudio(false);

      if (!buffer) {
        setIsPlaying(false);
        return;
      }

      const { ctx, analyser } = ensureAudioContext();
      if (!ctx || !analyser) return;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = speedMultiplier;
      source.connect(analyser);

      source.onended = () => {
        // Auto-advance to next sentence
        if (targetSent + 1 < segment.sentences.length) {
          playSentence(targetSeg, targetSent + 1, speedMultiplier);
        } else if (targetSeg + 1 < segments.length) {
          playSentence(targetSeg + 1, 0, speedMultiplier);
        } else {
          setIsPlaying(false);
          // Step 10: Chapter milestone celebration!
          try {
            confetti({
              particleCount: 120,
              spread: 80,
              origin: { y: 0.6 },
              colors: ['#38bdf8', '#818cf8', '#34d399', '#f59e0b', '#ec4899'],
            });
            setTimeout(() => {
              confetti({ particleCount: 60, angle: 60, spread: 55, origin: { x: 0 } });
              confetti({ particleCount: 60, angle: 120, spread: 55, origin: { x: 1 } });
            }, 300);
          } catch {
            // Ignore in headless / test
          }
        }
      };

      currentSourceRef.current = source;
      source.start(0);
      setIsPlaying(true);

      // Prefetch next sentence in background
      if (targetSent + 1 < segment.sentences.length) {
        fetchAudioBuffer(segment.sentences[targetSent + 1].text, segment.move, speedMultiplier);
      }
    },
    [
      segments,
      speed,
      stopCurrentAudio,
      onActiveSentenceChange,
      sessionId,
      apiBaseUrl,
      fetchAudioBuffer,
      ensureAudioContext,
    ]
  );

  // Listen for global barge-in interruption events (<50ms instantaneous client-side mute)
  useEffect(() => {
    const handleBargeIn = () => {
      stopCurrentAudio();
      setIsPlaying(false);
    };
    const handleResume = () => {
      // Resume playback at saved cursor
      playSentence(segIdx, sentIdx, speed);
    };

    window.addEventListener('rift:barge-in', handleBargeIn);
    window.addEventListener('rift:resume-lesson', handleResume);
    return () => {
      window.removeEventListener('rift:barge-in', handleBargeIn);
      window.removeEventListener('rift:resume-lesson', handleResume);
    };
  }, [stopCurrentAudio, playSentence, segIdx, sentIdx, speed]);

  const handleTogglePlay = () => {
    if (isPlaying) {
      stopCurrentAudio();
      setIsPlaying(false);
    } else {
      playSentence(segIdx, sentIdx, speed);
    }
  };

  const handleNext = () => {
    if (!currentSegment) return;
    if (sentIdx + 1 < currentSegment.sentences.length) {
      playSentence(segIdx, sentIdx + 1, speed);
    } else if (segIdx + 1 < segments.length) {
      playSentence(segIdx + 1, 0, speed);
    }
  };

  const handlePrev = () => {
    if (sentIdx > 0) {
      playSentence(segIdx, sentIdx - 1, speed);
    } else if (segIdx > 0) {
      const prevSeg = segments[segIdx - 1];
      playSentence(segIdx - 1, Math.max(0, prevSeg.sentences.length - 1), speed);
    }
  };

  const handleSpeedChange = (newSpeed: number) => {
    setSpeed(newSpeed);
    if (isPlaying) {
      playSentence(segIdx, sentIdx, newSpeed);
    }
  };

  if (!segments || segments.length === 0) {
    return null;
  }

  return (
    <div
      id="narrator-transport-bar"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px 16px',
        background: 'rgba(15, 23, 42, 0.9)',
        backdropFilter: 'blur(16px)',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.4)',
        borderRadius: '12px',
        margin: '8px 12px',
      }}
    >
      {/* Upper Line: Active Move & Spoken Script Preview */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            id="narrator-move-badge"
            style={{
              padding: '2px 8px',
              borderRadius: '6px',
              background: `rgba(${parseInt(emotionColor.slice(1, 3), 16)}, ${parseInt(emotionColor.slice(3, 5), 16)}, ${parseInt(emotionColor.slice(5, 7), 16)}, 0.15)`,
              border: `1px solid ${emotionColor}`,
              color: emotionColor,
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {currentMove} ({exaggeration.toFixed(2)})
          </span>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
            Segment {segIdx + 1}/{segments.length} • Sentence {sentIdx + 1}/{currentSegment?.sentences.length || 1}
          </span>
        </div>

        {/* Real-Time Waveform Visualizer */}
        <Waveform
          analyser={analyserRef.current}
          isPlaying={isPlaying}
          emotionColor={emotionColor}
          width={180}
          height={32}
        />
      </div>

      {/* Spoken Text Preview */}
      <div
        id="narrator-active-sentence"
        style={{
          fontSize: '12px',
          color: '#e2e8f0',
          lineHeight: 1.45,
          fontStyle: 'italic',
          background: 'rgba(255, 255, 255, 0.03)',
          padding: '6px 10px',
          borderRadius: '6px',
          borderLeft: `3px solid ${emotionColor}`,
        }}
      >
        {loadingAudio ? 'Synthesizing voice with emotional modulation...' : `"${currentSentence?.text || currentSegment?.script}"`}
      </div>

      {/* Controls Row: Transport buttons & speed */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Previous sentence button */}
          <button
            id="btn-transport-prev"
            type="button"
            onClick={handlePrev}
            disabled={segIdx === 0 && sentIdx === 0}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#f8fafc',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '12px',
              cursor: segIdx === 0 && sentIdx === 0 ? 'not-allowed' : 'pointer',
              opacity: segIdx === 0 && sentIdx === 0 ? 0.4 : 1,
            }}
          >
            ⏮ Prev
          </button>

          {/* Play / Pause toggle */}
          <button
            id="btn-transport-play"
            type="button"
            onClick={handleTogglePlay}
            style={{
              background: isPlaying
                ? 'rgba(239, 68, 68, 0.2)'
                : 'linear-gradient(135deg, rgba(14, 165, 233, 0.9) 0%, rgba(99, 102, 241, 0.9) 100%)',
              border: isPlaying ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(56, 189, 248, 0.5)',
              color: '#ffffff',
              borderRadius: '6px',
              padding: '6px 16px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: isPlaying ? 'none' : '0 2px 10px rgba(14, 165, 233, 0.3)',
            }}
          >
            <span>{isPlaying ? '⏸ Pause' : '▶ Narrate Lesson'}</span>
          </button>

          {/* Next sentence button */}
          <button
            id="btn-transport-next"
            type="button"
            onClick={handleNext}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#f8fafc',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Next ⏭
          </button>
        </div>

        {/* Speed Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Speed:</span>
          {[0.8, 1.0, 1.2, 1.5].map((sVal) => (
            <button
              key={sVal}
              id={`btn-speed-${sVal}`}
              type="button"
              onClick={() => handleSpeedChange(sVal)}
              style={{
                background: speed === sVal ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                border: speed === sVal ? '1px solid rgba(56, 189, 248, 0.6)' : '1px solid rgba(255, 255, 255, 0.06)',
                color: speed === sVal ? '#38bdf8' : '#94a3b8',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '10px',
                fontWeight: speed === sVal ? 700 : 400,
                cursor: 'pointer',
              }}
            >
              {sVal}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
