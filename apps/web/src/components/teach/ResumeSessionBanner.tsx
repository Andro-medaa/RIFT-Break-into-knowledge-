'use client';

import React, { useState, useEffect } from 'react';
import { getLatestSession, clearSavedSession, SavedSessionData } from '../../lib/storage/indexedDb';

interface ResumeSessionBannerProps {
  onResume: (session: SavedSessionData) => void;
}

export const ResumeSessionBanner: React.FC<ResumeSessionBannerProps> = ({ onResume }) => {
  const [savedSession, setSavedSession] = useState<SavedSessionData | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    getLatestSession().then((session) => {
      if (session && session.segments && session.segments.length > 0) {
        setSavedSession(session);
      }
    });
  }, []);

  if (!savedSession || dismissed) {
    return null;
  }

  const handleResume = () => {
    onResume(savedSession);
    setDismissed(true);
  };

  const handleDismiss = () => {
    clearSavedSession(savedSession.sessionId);
    setDismissed(true);
  };

  return (
    <div
      id="resume-session-banner"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        padding: '12px 20px',
        margin: '0 0 20px 0',
        borderRadius: '12px',
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)',
        border: '1px solid rgba(56, 189, 248, 0.4)',
        boxShadow: '0 8px 32px rgba(14, 165, 233, 0.15)',
        backdropFilter: 'blur(16px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '24px' }}>🔖</span>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: 600, color: '#f8fafc' }}>
              Resume previous session from where you left off?
            </h4>
            <span
              style={{
                fontSize: '10.5px',
                padding: '2px 6px',
                borderRadius: '4px',
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                color: '#38bdf8',
                fontWeight: 600,
              }}
            >
              Segment #{savedSession.segOrd + 1} • Sentence #{savedSession.sentIdx + 1}
            </span>
          </div>
          <p style={{ margin: '2px 0 0 0', fontSize: '11.5px', color: '#94a3b8' }}>
            Document: <strong>{savedSession.docTitle}</strong> ({savedSession.segments.length} segments planned)
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          id="btn-resume-lesson"
          type="button"
          onClick={handleResume}
          style={{
            background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.9) 0%, rgba(99, 102, 241, 0.9) 100%)',
            border: '1px solid rgba(56, 189, 248, 0.5)',
            color: '#ffffff',
            borderRadius: '6px',
            padding: '7px 14px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(14, 165, 233, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>🚀</span> Resume Lesson
        </button>

        <button
          id="btn-dismiss-resume"
          type="button"
          onClick={handleDismiss}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            color: '#94a3b8',
            borderRadius: '6px',
            padding: '7px 12px',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};
