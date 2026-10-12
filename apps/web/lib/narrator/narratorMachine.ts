import { LessonSegment } from '../../types/lesson';
import { saveSessionCursor, SavedSessionData } from '../storage/indexedDb';

export type NarratorState =
  | 'idle'
  | 'planning'
  | 'narrating'
  | 'paused'
  | 'listening'
  | 'answering'
  | 'resuming'
  | 'finished';

export interface NarratorContext {
  docId: string | null;
  docTitle: string;
  sessionId: string | null;
  segOrd: number;
  sentIdx: number;
  segments: LessonSegment[];
  speed: number;
}

export type NarratorEvent =
  | { type: 'START_PLANNING' }
  | { type: 'PLAN_READY'; segments: LessonSegment[]; sessionId: string }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'ADVANCE_SENTENCE'; segOrd: number; sentIdx: number }
  | { type: 'RESTORE_CURSOR'; segOrd: number; sentIdx: number }
  | { type: 'USER_SPEECH_START' }
  | { type: 'QUESTION_READY'; question: string }
  | { type: 'ANSWER_DONE' }
  | { type: 'BRIDGE_DONE' }
  | { type: 'SPEECH_MISFIRE' }
  | { type: 'LESSON_END' };

export class NarratorStateMachine {
  private currentState: NarratorState = 'idle';
  private context: NarratorContext;
  private listeners: Set<(state: NarratorState, ctx: NarratorContext) => void> = new Set();

  constructor(initialContext?: Partial<NarratorContext>) {
    this.context = {
      docId: null,
      docTitle: 'Document',
      sessionId: null,
      segOrd: 0,
      sentIdx: 0,
      segments: [],
      speed: 1.0,
      ...initialContext,
    };
  }

  public getState(): NarratorState {
    return this.currentState;
  }

  public getContext(): NarratorContext {
    return { ...this.context };
  }

  public subscribe(listener: (state: NarratorState, ctx: NarratorContext) => void): () => void {
    this.listeners.add(listener);
    listener(this.currentState, this.context);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.currentState, { ...this.context });
    }
  }

  public send(event: NarratorEvent): void {
    const prev = this.currentState;

    switch (this.currentState) {
      case 'idle':
        if (event.type === 'START_PLANNING') {
          this.currentState = 'planning';
        } else if (event.type === 'PLAN_READY') {
          this.context.segments = event.segments;
          this.context.sessionId = event.sessionId;
          this.currentState = 'paused';
        } else if (event.type === 'RESTORE_CURSOR') {
          this.context.segOrd = event.segOrd;
          this.context.sentIdx = event.sentIdx;
        }
        break;

      case 'planning':
        if (event.type === 'PLAN_READY') {
          this.context.segments = event.segments;
          this.context.sessionId = event.sessionId;
          this.currentState = 'narrating';
        }
        break;

      case 'narrating':
        if (event.type === 'PAUSE') {
          this.currentState = 'paused';
        } else if (event.type === 'ADVANCE_SENTENCE') {
          this.context.segOrd = event.segOrd;
          this.context.sentIdx = event.sentIdx;
          this.persistCursor();
        } else if (event.type === 'USER_SPEECH_START') {
          this.currentState = 'listening';
        } else if (event.type === 'LESSON_END') {
          this.currentState = 'finished';
        }
        break;

      case 'paused':
        if (event.type === 'PLAY') {
          this.currentState = 'narrating';
        } else if (event.type === 'ADVANCE_SENTENCE') {
          this.context.segOrd = event.segOrd;
          this.context.sentIdx = event.sentIdx;
          this.persistCursor();
        } else if (event.type === 'RESTORE_CURSOR') {
          this.context.segOrd = event.segOrd;
          this.context.sentIdx = event.sentIdx;
        }
        break;

      case 'listening':
        if (event.type === 'SPEECH_MISFIRE') {
          this.currentState = 'narrating';
        } else if (event.type === 'QUESTION_READY') {
          this.currentState = 'answering';
        }
        break;

      case 'answering':
        if (event.type === 'ANSWER_DONE') {
          this.currentState = 'resuming';
        } else if (event.type === 'USER_SPEECH_START') {
          // Interrupt answer with follow-up question
          this.currentState = 'listening';
        }
        break;

      case 'resuming':
        if (event.type === 'BRIDGE_DONE') {
          this.currentState = 'narrating';
        }
        break;

      case 'finished':
        if (event.type === 'RESTORE_CURSOR') {
          this.context.segOrd = event.segOrd;
          this.context.sentIdx = event.sentIdx;
          this.currentState = 'paused';
        }
        break;
    }

    if (prev !== this.currentState || event.type === 'ADVANCE_SENTENCE' || event.type === 'RESTORE_CURSOR') {
      this.notify();
    }
  }

  private persistCursor(): void {
    if (this.context.sessionId && this.context.docId) {
      const data: SavedSessionData = {
        sessionId: this.context.sessionId,
        docId: this.context.docId,
        docTitle: this.context.docTitle,
        segOrd: this.context.segOrd,
        sentIdx: this.context.sentIdx,
        segments: this.context.segments,
        updatedAt: Date.now(),
      };
      saveSessionCursor(data);
    }
  }
}
