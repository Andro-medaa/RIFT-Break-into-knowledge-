/**
 * Lesson and Teacher planning types for RIFT.
 * Aligns 1:1 with backend Pydantic schemas in app/schemas/lesson.py.
 */

export type MoveType = 'intro' | 'explain' | 'example' | 'analogy' | 'recap' | 'check';

export interface Sentence {
  text: string;
  duration_estimate_ms: number;
}

export interface LessonSegment {
  id: string;
  doc_id: string;
  ord: number;
  chunk_ids: string[];
  move: MoveType;
  script: string;
  sentences: Sentence[];
}

export interface ReadingSession {
  id: string;
  doc_id: string;
  seg_ord: number;
  sent_idx: number;
  created_at: string;
  updated_at: string;
}

export interface LessonPlanResponse {
  session_id: string;
  doc_id: string;
  segments: LessonSegment[];
}

export interface UpdateCursorPayload {
  seg_ord: number;
  sent_idx: number;
}
