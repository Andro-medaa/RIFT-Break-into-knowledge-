'use client';

import React, { useState, useEffect } from 'react';
import { LessonSegment, MoveType, ReadingSession } from '../../types/lesson';
import { DocumentChunk } from '../../types/api';
import { AudioPlayer } from '../audio/AudioPlayer';

interface LessonPlanViewProps {
  docId: string | null;
  docTitle?: string;
  chunks: DocumentChunk[];
  activeChunkId: string | null;
  onSelectChunk: (chunkId: string) => void;
  apiBaseUrl?: string;
  initialSegments?: LessonSegment[];
  initialSessionId?: string;
  initialSegOrd?: number;
  initialSentIdx?: number;
}

const MOVE_THEMES: Record<MoveType, { label: string; bg: string; border: string; color: string; icon: string }> = {
  intro: {
    label: 'Intro & Hook',
    bg: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.5)',
    color: '#34d399',
    icon: '✨',
  },
  explain: {
    label: 'Core Explanation',
    bg: 'rgba(56, 189, 248, 0.15)',
    border: 'rgba(56, 189, 248, 0.5)',
    color: '#38bdf8',
    icon: '💡',
  },
  example: {
    label: 'Vivid Example',
    bg: 'rgba(168, 85, 247, 0.15)',
    border: 'rgba(168, 85, 247, 0.5)',
    color: '#c084fc',
    icon: '🎯',
  },
  analogy: {
    label: 'Relatable Analogy',
    bg: 'rgba(245, 158, 11, 0.15)',
    border: 'rgba(245, 158, 11, 0.5)',
    color: '#fbbf24',
    icon: '⚡',
  },
  check: {
    label: 'Concept Check',
    bg: 'rgba(244, 63, 94, 0.15)',
    border: 'rgba(244, 63, 94, 0.5)',
    color: '#fb7185',
    icon: '❓',
  },
  recap: {
    label: 'Key Takeaway',
    bg: 'rgba(99, 102, 241, 0.15)',
    border: 'rgba(99, 102, 241, 0.5)',
    color: '#818cf8',
    icon: '🏆',
  },
};

export const LessonPlanView: React.FC<LessonPlanViewProps> = ({
  docId,
  docTitle,
  chunks,
  activeChunkId,
  onSelectChunk,
  apiBaseUrl = 'http://localhost:8000',
  initialSegments,
  initialSessionId,
  initialSegOrd = 0,
  initialSentIdx = 0,
}) => {
  const [session, setSession] = useState<ReadingSession | null>(
    initialSessionId && docId
      ? {
          id: initialSessionId,
          doc_id: docId,
          seg_ord: initialSegOrd,
          sent_idx: initialSentIdx,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      : null
  );
  const [segments, setSegments] = useState<LessonSegment[]>(initialSegments || []);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSegId, setExpandedSegId] = useState<string | null>(null);
  const [activeSpokenSeg, setActiveSpokenSeg] = useState<number>(initialSegOrd);
  const [activeSpokenSent, setActiveSpokenSent] = useState<number>(initialSentIdx);

  // Sync initial restoration props if provided
  useEffect(() => {
    if (initialSegments && initialSegments.length > 0) {
      setSegments(initialSegments);
      setActiveSpokenSeg(initialSegOrd);
      setActiveSpokenSent(initialSentIdx);
    }
  }, [initialSegments, initialSegOrd, initialSentIdx]);

  const totalEstDurationMs = segments.reduce((sum, seg) => {
    return sum + seg.sentences.reduce((sSum, s) => sSum + s.duration_estimate_ms, 0);
  }, 0);
  const totalMinutes = Math.floor(totalEstDurationMs / 60000);
  const totalSeconds = Math.round((totalEstDurationMs % 60000) / 1000);

  const handleGeneratePlan = async () => {
    if (!docId) {
      setError('Please ingest a document first before generating a lesson plan.');
      return;
    }

    setLoading(true);
    setError(null);

    const fallbacks = [apiBaseUrl, 'http://127.0.0.1:8000'];
    let lastErr = '';

    for (const base of fallbacks) {
      try {
        // Step 1: Initialize reading session
        const sessionRes = await fetch(`${base}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ doc_id: docId }),
        });

        if (!sessionRes.ok) {
          throw new Error(`Failed to initialize session (${sessionRes.status})`);
        }
        const sessionJson = await sessionRes.json();
        const newSession: ReadingSession = sessionJson.data;
        setSession(newSession);

        // Step 2: Request structured lesson plan
        const planRes = await fetch(`${base}/sessions/${newSession.id}/plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ doc_id: docId }),
        });

        if (!planRes.ok) {
          throw new Error(`Failed to generate lesson plan (${planRes.status})`);
        }
        const planJson = await planRes.json();
        const planSegments: LessonSegment[] = planJson.data.segments;
        setSegments(planSegments);
        setLoading(false);
        return;
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
      }
    }

    setError(`Generation failed: ${lastErr}`);
    setLoading(false);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(16px)',
        borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
        color: '#f8fafc',
        fontFamily: 'inherit',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(30, 41, 59, 0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>🎓</span>
            <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>
              Structured Lesson Planner
            </h3>
          </div>
          {segments.length > 0 && (
            <span
              style={{
                fontSize: '11px',
                padding: '3px 8px',
                borderRadius: '999px',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                color: '#34d399',
                fontWeight: 600,
              }}
            >
              {segments.length} Segments • ~{totalMinutes}m {totalSeconds}s
            </span>
          )}
        </div>

        <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 12px 0', lineHeight: 1.4 }}>
          Gemini 2.5 Flash crafts a charismatic teaching script with discrete moves synced to document bounding boxes.
        </p>

        <button
          id="btn-generate-lesson-plan"
          onClick={handleGeneratePlan}
          disabled={loading || !docId}
          style={{
            width: '100%',
            padding: '10px 16px',
            borderRadius: '8px',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            background: loading
              ? 'rgba(56, 189, 248, 0.2)'
              : 'linear-gradient(135deg, rgba(14, 165, 233, 0.8) 0%, rgba(99, 102, 241, 0.8) 100%)',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '13px',
            cursor: loading || !docId ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 14px rgba(14, 165, 233, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
        >
          {loading ? (
            <>
              <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span>
              Planning Charismatic Lesson...
            </>
          ) : (
            <>
              <span>✨</span>
              {segments.length > 0 ? 'Regenerate Lesson Plan' : 'Generate Lesson Plan'}
            </>
          )}
        </button>

        {error && (
          <div
            style={{
              marginTop: '10px',
              padding: '8px 12px',
              borderRadius: '6px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              fontSize: '11px',
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Segments list body */}
      <div
        id="lesson-segments-list"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {segments.length === 0 && !loading && (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: '#64748b',
              fontSize: '13px',
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📖</div>
            <p style={{ margin: 0, fontWeight: 500, color: '#94a3b8' }}>No lesson planned yet</p>
            <p style={{ margin: '6px 0 0 0', fontSize: '11px' }}>
              Click <strong>&quot;Generate Lesson Plan&quot;</strong> above to generate a spoken teacher script from the ingested textbook.
            </p>
          </div>
        )}

        {segments.map((seg) => {
          const theme = MOVE_THEMES[seg.move] || MOVE_THEMES.explain;
          const isLinkedActive = seg.chunk_ids.some((id) => id === activeChunkId);
          const isExpanded = expandedSegId === seg.id;

          return (
            <div
              key={seg.id}
              data-segment-id={seg.id}
              data-segment-move={seg.move}
              onClick={() => {
                if (seg.chunk_ids.length > 0) {
                  onSelectChunk(seg.chunk_ids[0]);
                }
              }}
              style={{
                borderRadius: '10px',
                padding: '12px',
                background: isLinkedActive ? 'rgba(56, 189, 248, 0.12)' : 'rgba(30, 41, 59, 0.4)',
                border: isLinkedActive
                  ? '1px solid rgba(56, 189, 248, 0.6)'
                  : '1px solid rgba(255, 255, 255, 0.06)',
                boxShadow: isLinkedActive ? '0 0 15px rgba(56, 189, 248, 0.2)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {/* Move Badge & Chunk Tag */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '6px',
                      background: theme.bg,
                      border: `1px solid ${theme.border}`,
                      color: theme.color,
                      fontSize: '11px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span>{theme.icon}</span>
                    {theme.label.toUpperCase()}
                  </span>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>#{seg.ord + 1}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {seg.chunk_ids.map((cid) => (
                    <span
                      key={cid}
                      style={{
                        fontSize: '10px',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#cbd5e1',
                      }}
                    >
                      Chunk {cid.slice(0, 6)}
                    </span>
                  ))}
                </div>
              </div>

              {/* Conversational Script */}
              <p
                style={{
                  fontSize: '12.5px',
                  lineHeight: 1.55,
                  color: '#e2e8f0',
                  margin: '0 0 8px 0',
                }}
              >
                &ldquo;{seg.script}&rdquo;
              </p>

              {/* Sentences Inspector Toggle */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                  paddingTop: '6px',
                  marginTop: '6px',
                }}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedSegId(isExpanded ? null : seg.id);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#38bdf8',
                    fontSize: '11px',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span>{isExpanded ? '▼' : '▶'}</span>
                  {seg.sentences.length} Timed Sentences
                </button>

                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  {(seg.sentences.reduce((sum, s) => sum + s.duration_estimate_ms, 0) / 1000).toFixed(1)}s spoken
                </span>
              </div>

              {/* Expanded Sentences list */}
              {isExpanded && (
                <div
                  style={{
                    marginTop: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    background: 'rgba(15, 23, 42, 0.4)',
                    padding: '8px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.04)',
                  }}
                >
                  {seg.sentences.map((sentence, sIdx) => (
                    <div
                      key={sIdx}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: '8px',
                        fontSize: '11.5px',
                        color: '#cbd5e1',
                      }}
                    >
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <span style={{ color: '#64748b', fontSize: '10px' }}>{sIdx + 1}.</span>
                        <span>{sentence.text}</span>
                      </div>
                      <span
                        style={{
                          fontSize: '10px',
                          color: '#38bdf8',
                          whiteSpace: 'nowrap',
                          background: 'rgba(56, 189, 248, 0.1)',
                          padding: '1px 4px',
                          borderRadius: '3px',
                        }}
                      >
                        {(sentence.duration_estimate_ms / 1000).toFixed(1)}s
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Step 6: Emotional Narration Engine (Web Audio Transport Bar) */}
      {segments.length > 0 && (
        <AudioPlayer
          segments={segments}
          sessionId={session ? session.id : undefined}
          docId={docId}
          docTitle={docTitle}
          activeSegOrd={activeSpokenSeg}
          activeSentIdx={activeSpokenSent}
          onActiveSentenceChange={(sOrd, sIdx, chunkIds) => {
            setActiveSpokenSeg(sOrd);
            setActiveSpokenSent(sIdx);
            if (chunkIds && chunkIds.length > 0) {
              onSelectChunk(chunkIds[0]);
            }
          }}
          apiBaseUrl={apiBaseUrl}
        />
      )}
    </div>
  );
};
