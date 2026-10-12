'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { QaMessage, BookCitation, WebCitation } from '../../types/qa';

interface GroundedQaPanelProps {
  sessionId: string | null;
  docId: string | null;
  docTitle?: string;
  activeChunkId?: string | null;
  onSelectCitation: (chunkId: string, pageNo: number) => void;
  onResumeLesson?: () => void;
  apiBaseUrl?: string;
  initialQuestion?: string | null;
}

export const GroundedQaPanel: React.FC<GroundedQaPanelProps> = ({
  sessionId,
  docId,
  docTitle = 'Document',
  activeChunkId,
  onSelectCitation,
  onResumeLesson,
  apiBaseUrl = 'http://localhost:8000',
  initialQuestion,
}) => {
  const [messages, setMessages] = useState<QaMessage[]>([
    {
      id: 'welcome',
      role: 'teacher',
      text: `Hello! I'm your interactive AI teacher for "${docTitle}". You can interrupt anytime by speaking or typing a question. I ground my answers directly in the textbook text [amber tags] and real-world industry sources [blue cards]. What would you like to explore?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputVal, setInputVal] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [audioLoadingId, setAudioLoadingId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle incoming questions (either from input or initial voice barge-in)
  const askQuestion = useCallback(
    async (questionText: string) => {
      const q = questionText.trim();
      if (!q || !sessionId) return;

      const userMsgId = 'user-' + Date.now();
      const teacherMsgId = 'teacher-' + Date.now();

      const newMessages: QaMessage[] = [
        ...messages,
        {
          id: userMsgId,
          role: 'user',
          text: q,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
        {
          id: teacherMsgId,
          role: 'teacher',
          text: '',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isStreaming: true,
          book_citations: [],
          web_citations: [],
        },
      ];

      setMessages(newMessages);
      setInputVal('');
      setIsLoading(true);

      const fallbacks = [apiBaseUrl, 'http://127.0.0.1:8000'];
      let succeeded = false;

      for (const base of fallbacks) {
        try {
          const res = await fetch(`${base}/sessions/${sessionId}/ask?stream=true`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question: q,
              active_chunk_id: activeChunkId,
              history: messages.slice(-4).map((m) => ({ role: m.role, text: m.text })),
            }),
          });

          if (!res.ok) continue;

          const reader = res.body?.getReader();
          if (!reader) continue;

          const decoder = new TextDecoder();
          let accumulatedAnswer = '';
          let bookCits: BookCitation[] = [];
          let webCits: WebCitation[] = [];
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop() || '';

            for (const ev of events) {
              const lines = ev.trim().split('\n');
              let eventType = '';
              let dataStr = '';

              for (const line of lines) {
                if (line.startsWith('event: ')) {
                  eventType = line.replace('event: ', '').trim();
                } else if (line.startsWith('data: ')) {
                  dataStr = line.replace('data: ', '').trim();
                }
              }

              if (!dataStr) continue;

              try {
                const parsed = JSON.parse(dataStr);
                if (eventType === 'token' && parsed.text) {
                  accumulatedAnswer += parsed.text;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === teacherMsgId
                        ? { ...m, text: accumulatedAnswer, isStreaming: true }
                        : m
                    )
                  );
                } else if (eventType === 'citations') {
                  bookCits = parsed.book_citations || [];
                  webCits = parsed.web_citations || [];
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === teacherMsgId
                        ? { ...m, book_citations: bookCits, web_citations: webCits }
                        : m
                    )
                  );
                } else if (eventType === 'done') {
                  accumulatedAnswer = parsed.answer || accumulatedAnswer;
                  bookCits = parsed.book_citations || bookCits;
                  webCits = parsed.web_citations || webCits;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === teacherMsgId
                        ? {
                            ...m,
                            text: accumulatedAnswer,
                            isStreaming: false,
                            book_citations: bookCits,
                            web_citations: webCits,
                          }
                        : m
                    )
                  );
                }
              } catch {
                // Ignore parse errors on chunk boundaries
              }
            }
          }

          setMessages((prev) =>
            prev.map((m) =>
              m.id === teacherMsgId ? { ...m, isStreaming: false } : m
            )
          );
          succeeded = true;
          break;
        } catch {
          // Try next fallback
        }
      }

      if (!succeeded) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === teacherMsgId
              ? {
                  ...m,
                  text: 'Sorry, I encountered a connection issue fetching the grounded answer. Please try again or resume the lesson.',
                  isStreaming: false,
                }
              : m
          )
        );
      }

      setIsLoading(false);
    },
    [sessionId, activeChunkId, messages, apiBaseUrl]
  );

  // Trigger initial question if provided
  useEffect(() => {
    if (initialQuestion && initialQuestion.trim()) {
      askQuestion(initialQuestion);
    }
  }, [initialQuestion, askQuestion]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputVal.trim() && !isLoading) {
      askQuestion(inputVal.trim());
    }
  };

  // Play spoken answer via TTS engine
  const handlePlayAnswerAudio = async (msgId: string, answerText: string) => {
    if (audioLoadingId === msgId) return;
    setAudioLoadingId(msgId);

    try {
      const cleanText = answerText.replace(/\[c\d+\]/g, '').trim();
      const res = await fetch(`${apiBaseUrl}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText, move: 'explain', speed: 1.0 }),
      });

      if (!res.ok) throw new Error('TTS failed');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      if (audioRef.current) {
        audioRef.current.pause();
      }

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setAudioLoadingId(null);
      await audio.play();
    } catch {
      setAudioLoadingId(null);
    }
  };

  return (
    <div
      id="grounded-qa-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(16px)',
        color: '#f8fafc',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(15, 23, 42, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '15px' }}>🎓</span>
            <span style={{ fontWeight: 700, fontSize: '13px', color: '#f8fafc' }}>
              Dual-Grounded AI Teacher
            </span>
          </div>
          <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#94a3b8' }}>
            Answers cross-verified against textbook & Google Search
          </p>
        </div>

        {onResumeLesson && (
          <button
            id="btn-qa-resume-lesson"
            type="button"
            onClick={onResumeLesson}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(56, 189, 248, 0.2) 100%)',
              border: '1px solid rgba(52, 211, 153, 0.4)',
              color: '#34d399',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>▶</span> Resume Lesson
          </button>
        )}
      </div>

      {/* Messages Feed */}
      <div
        id="qa-messages-feed"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {messages.map((m) => {
          const isTeacher = m.role === 'teacher';
          return (
            <div
              key={m.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isTeacher ? 'flex-start' : 'flex-end',
                maxWidth: '92%',
                alignSelf: isTeacher ? 'flex-start' : 'flex-end',
              }}
            >
              {/* Message Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '4px',
                  fontSize: '11px',
                  color: isTeacher ? '#38bdf8' : '#a5b4fc',
                }}
              >
                <span>{isTeacher ? '🎓 AI Teacher' : '🧑‍🎓 You'}</span>
                <span style={{ color: '#64748b' }}>• {m.timestamp}</span>
              </div>

              {/* Message Bubble */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: isTeacher ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
                  background: isTeacher
                    ? 'rgba(30, 41, 59, 0.75)'
                    : 'linear-gradient(135deg, rgba(99, 102, 241, 0.3) 0%, rgba(56, 189, 248, 0.2) 100%)',
                  border: isTeacher
                    ? '1px solid rgba(255, 255, 255, 0.08)'
                    : '1px solid rgba(99, 102, 241, 0.4)',
                  fontSize: '12.5px',
                  lineHeight: '1.55',
                  color: '#f1f5f9',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {m.text || (m.isStreaming ? 'Thinking and gathering dual citations...' : '')}
                {m.isStreaming && <span className="stream-cursor" style={{ marginLeft: '4px' }}>▌</span>}
              </div>

              {/* Citations Section */}
              {isTeacher && ((m.book_citations && m.book_citations.length > 0) || (m.web_citations && m.web_citations.length > 0)) && (
                <div
                  style={{
                    marginTop: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    width: '100%',
                  }}
                >
                  {/* Book Citations (Amber) */}
                  {m.book_citations && m.book_citations.length > 0 && (
                    <div>
                      <div
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: '#fbbf24',
                          marginBottom: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span>📖</span> Textbook Evidence (Click to inspect PDF):
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {m.book_citations.map((bc, bIdx) => (
                          <button
                            key={bIdx}
                            id={`cite-book-${bc.chunk_id}`}
                            type="button"
                            onClick={() => onSelectCitation(bc.chunk_id, bc.page_no)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              background: 'rgba(245, 158, 11, 0.15)',
                              border: '1px solid rgba(245, 158, 11, 0.5)',
                              color: '#fef08a',
                              fontSize: '11px',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              textAlign: 'left',
                            }}
                          >
                            <span style={{ fontWeight: 700, color: '#fbbf24' }}>{bc.alias}</span>
                            <span>Page {bc.page_no}</span>
                            <span style={{ fontSize: '9px', opacity: 0.8 }}>🔍 View</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Web Citations (Blue) */}
                  {m.web_citations && m.web_citations.length > 0 && (
                    <div>
                      <div
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: '#38bdf8',
                          marginBottom: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span>🌐</span> Real-World Industry Grounding:
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {m.web_citations.map((wc, wIdx) => (
                          <a
                            key={wIdx}
                            href={wc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              padding: '6px 10px',
                              borderRadius: '6px',
                              background: 'rgba(56, 189, 248, 0.1)',
                              border: '1px solid rgba(56, 189, 248, 0.3)',
                              color: '#bae6fd',
                              fontSize: '11px',
                              textDecoration: 'none',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '2px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontWeight: 600, color: '#38bdf8' }}>{wc.title}</span>
                              <span style={{ fontSize: '10px', opacity: 0.7 }}>↗</span>
                            </div>
                            <span style={{ fontSize: '10px', color: '#94a3b8' }}>{wc.snippet}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Actions below teacher answer */}
              {isTeacher && m.text && !m.isStreaming && (
                <div style={{ marginTop: '6px', display: 'flex', gap: '8px' }}>
                  <button
                    id={`btn-listen-${m.id}`}
                    type="button"
                    onClick={() => handlePlayAnswerAudio(m.id, m.text)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      fontSize: '10.5px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 4px',
                    }}
                  >
                    <span>{audioLoadingId === m.id ? '🔊 Playing...' : '🔈 Read aloud'}</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <form
        onSubmit={handleSubmit}
        style={{
          padding: '12px 16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(15, 23, 42, 0.95)',
          display: 'flex',
          gap: '8px',
        }}
      >
        <input
          id="input-qa-chat-text"
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="Ask a question about the textbook or industry..."
          disabled={isLoading || !sessionId}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: '6px',
            background: 'rgba(30, 41, 59, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            color: '#f8fafc',
            fontSize: '12px',
            outline: 'none',
          }}
        />
        <button
          id="btn-qa-chat-send"
          type="submit"
          disabled={isLoading || !inputVal.trim() || !sessionId}
          style={{
            padding: '8px 14px',
            borderRadius: '6px',
            background: inputVal.trim()
              ? 'linear-gradient(135deg, rgba(14, 165, 233, 0.9) 0%, rgba(99, 102, 241, 0.9) 100%)'
              : 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            color: '#ffffff',
            fontSize: '11.5px',
            fontWeight: 600,
            cursor: inputVal.trim() && !isLoading ? 'pointer' : 'not-allowed',
          }}
        >
          {isLoading ? '...' : 'Ask 💬'}
        </button>
      </form>
    </div>
  );
};
