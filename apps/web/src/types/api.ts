/**
 * Standard API Response envelope matching FastAPI backend ApiResponse[T]
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string | null;
  message?: string | null;
}

export interface PingData {
  status: string;
  service: string;
  timestamp: string;
}

export interface HealthData {
  status: string;
  service: string;
  version: string;
}

export interface DocumentMeta {
  id: string;
  title: string;
  page_count: number;
  chunks_count: number;
  status: string;
  created_at: string;
}

export interface DocumentChunk {
  id: string;
  doc_id: string;
  ord: number;
  page_no: number;
  rects: { x0: number; y0: number; x1: number; y1: number }[];
  kind: string;
  text: string;
  word_count: number;
}
