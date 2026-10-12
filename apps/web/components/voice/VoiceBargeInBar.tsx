'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ClientBargeInController } from '../../lib/speech/speechRecognition';

interface VoiceBargeInBarProps {
  onBargeIn: () => void;
  onQuestionSubmit: (question: string) => void;
  onResumeLesson?: () => void;
  disabled?: boolean;
}

export const VoiceBargeInBar: React.FC<VoiceBargeInBarProps> = ({
  onBargeIn,
  onQuestionSubmit,
  onResumeLesson,
  disabled = false,
}) => {
  const [isListening, setIsListening] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>('');
  const [textInput, setTextInput] = useState<string>('');
  const [recentQuestions, setRecentQuestions] = useState<Array<{ id: string; text: string; time: string }>>([]);

  const controllerRef = useRef<ClientBargeInController | null>(null);

  // Initialize Speech Controller with sub-50ms client-side mute callback
  useEffect(() => {
    const controller = new ClientBargeInController({
      onSpeechStart: () => {
        setIsListening(true);
        onBargeIn(); // Instantly silence Web Audio node client-side
      },
      onTranscript: (spokenText) => {
        setTranscript(spokenText);
        setTextInput(spokenText);
      },
      onError: (err) => {
        console.warn('Speech recognition error:', err);
      },
      onMisfire: () => {
        // Ambient noise or false start -> resume
        setIsListening(false);
        setTranscript('');
        if (onResumeLesson) onResumeLesson();
      },
      onEnd: () => {
        setIsListening(false);
      },
    });

    controllerRef.current = controller;

    return () => {
      controller.stopListening();
    };
  }, [onBargeIn, onResumeLesson]);

  // Spacebar push-to-talk listener (only when not typing in text input)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        if (!isListening) {
          onBargeIn();
          setIsListening(true);
          controllerRef.current?.startListening();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        if (isListening) {
          controllerRef.current?.stopListening();
          setIsListening(false);
          if (transcript.trim()) {
            submitQuestion(transcript.trim());
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isListening, transcript, onBargeIn]);

  const toggleMic = useCallback(() => {
    if (isListening) {
      controllerRef.current?.stopListening();
      setIsListening(false);
      if (transcript.trim()) {
        submitQuestion(transcript.trim());
      }
    } else {
      onBargeIn(); // Instant client-side silence
      setIsListening(true);
      setTranscript('');
      controllerRef.current?.startListening();
    }
  }, [isListening, transcript, onBargeIn]);

  const submitQuestion = (q: string) => {
    const clean = q.trim();
    if (!clean) return;

    const newQ = {
      id: Math.random().toString(36).substring(7),
      text: clean,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setRecentQuestions((prev) => [newQ, ...prev.slice(0, 4)]);
    setTranscript('');
    setTextInput('');
    setIsListening(false);
    controllerRef.current?.stopListening();

    onQuestionSubmit(clean);
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (textInput.trim()) {
      onBargeIn(); // Mute audio on submit
      submitQuestion(textInput.trim());
    }
  };

  return (
    <div
      id="voice-barge-in-bar"
      style={{
        padding: '16px',
        margin: '16px 0',
        borderRadius: '12px',
        background: isListening
          ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(244, 63, 94, 0.15) 100%)'
          : 'rgba(15, 23, 42, 0.8)',
        border: isListening ? '1px solid rgba(245, 158, 11, 0.6)' : '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: isListening ? '0 0 24px rgba(245, 158, 11, 0.25)' : 'none',
        backdropFilter: 'blur(16px)',
        transition: 'all 0.25s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        {/* Left: Interactive Microphone & Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            id="btn-voice-mic"
            type="button"
            onClick={toggleMic}
            disabled={disabled}
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              border: isListening ? '2px solid #fbbf24' : '1px solid rgba(56, 189, 248, 0.4)',
              background: isListening
                ? 'radial-gradient(circle, #f59e0b 0%, #dc2626 100%)'
                : 'linear-gradient(135deg, rgba(14, 165, 233, 0.8) 0%, rgba(99, 102, 241, 0.8) 100%)',
              color: '#ffffff',
              fontSize: '20px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: isListening ? '0 0 20px rgba(245, 158, 11, 0.6)' : '0 4px 14px rgba(14, 165, 233, 0.3)',
              transform: isListening ? 'scale(1.08)' : 'scale(1)',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {isListening ? '🛑' : '🎙️'}
          </button>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                id="voice-status-badge"
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: isListening ? 'rgba(245, 158, 11, 0.2)' : 'rgba(56, 189, 248, 0.15)',
                  border: isListening ? '1px solid #fbbf24' : '1px solid rgba(56, 189, 248, 0.4)',
                  color: isListening ? '#fbbf24' : '#38bdf8',
                }}
              >
                {isListening ? '🎙️ LISTENING (<50ms BARGE-IN)' : 'PUSH-TO-TALK READY'}
              </span>
              <span style={{ fontSize: '11px', color: '#64748b' }}>Hold [Space] to interrupt</span>
            </div>

            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
              {isListening
                ? (transcript ? `"${transcript}"` : 'Listening for your question... Speak clearly.')
                : 'Interrupt anytime while the teacher is speaking. Narration instantly mutes without lag.'}
            </p>
          </div>
        </div>

        {/* Right: Text Input Fallback */}
        <form onSubmit={handleTextSubmit} style={{ display: 'flex', gap: '8px', flex: 1, maxWidth: '420px' }}>
          <input
            id="input-question-text"
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Type a question or query for the teacher..."
            disabled={disabled}
            style={{
              flex: 1,
              padding: '9px 14px',
              borderRadius: '8px',
              background: 'rgba(30, 41, 59, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#f8fafc',
              fontSize: '12.5px',
              outline: 'none',
            }}
          />
          <button
            id="btn-send-question"
            type="submit"
            disabled={disabled || !textInput.trim()}
            style={{
              padding: '9px 16px',
              borderRadius: '8px',
              background: textInput.trim()
                ? 'linear-gradient(135deg, rgba(14, 165, 233, 0.9) 0%, rgba(99, 102, 241, 0.9) 100%)'
                : 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: textInput.trim() ? 'pointer' : 'not-allowed',
              whiteSpace: 'nowrap',
            }}
          >
            Ask 💬
          </button>
        </form>
      </div>

      {/* Recent Asked Questions Feed */}
      {recentQuestions.length > 0 && (
        <div style={{ marginTop: '14px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '10px' }}>
          <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '6px' }}>Student Questions:</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {recentQuestions.map((q) => (
              <div
                key={q.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: 'rgba(30, 41, 59, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  fontSize: '12px',
                  color: '#e2e8f0',
                }}
              >
                <span>❓ &ldquo;{q.text}&rdquo;</span>
                <span style={{ fontSize: '10px', color: '#64748b' }}>{q.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
