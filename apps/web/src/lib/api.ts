/**
 * API client for the RIFT backend.
 */

import type { Document, UploadResponse, DeleteResponse } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** Default owner ID for development — will be replaced by real auth. */
const DEV_OWNER_ID = "rift_user_01";

function getHeaders(ownerId?: string): HeadersInit {
  return {
    "X-Owner-Id": ownerId || DEV_OWNER_ID,
  };
}

export interface Citation {
  id: string;
  label: string;
  page?: number;
  paragraphId?: string;
  bbox?: { x: number; y: number; w: number; h: number };
  chunkType?: string;
  imageUrl?: string;
  source?: "pdf" | "web";
  url?: string;
  snippet?: string;
}

export interface QueryResponse {
  answer: string;
  citations: Citation[];
}

export interface DocumentChunk {
  id: string;
  chunk_index: number;
  chunk_type: string;
  content: string;
  page_number: number;
  bbox: { x: number; y: number; w: number; h: number };
  section_path: string[];
  image_url?: string;
  table_markdown?: string;
}

/**
 * Upload a PDF file directly via multipart form data with optional user instruction.
 */
export async function uploadPdf(
  file: File,
  instruction?: string,
  ownerId?: string
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (instruction && instruction.trim()) {
    formData.append("instruction", instruction.trim());
  }

  const res = await fetch(`${API_BASE}/api/documents/upload`, {
    method: "POST",
    headers: getHeaders(ownerId),
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Upload failed (${res.status})`);
  }

  return res.json();
}

/**
 * Upload a PDF by providing a file address (local path or URL) with optional instruction.
 */
export async function uploadByAddress(
  fileAddress: string,
  instruction?: string,
  ownerId?: string
): Promise<UploadResponse> {
  const res = await fetch(`${API_BASE}/api/documents/upload-by-address`, {
    method: "POST",
    headers: {
      ...getHeaders(ownerId),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file_address: fileAddress,
      instruction: instruction?.trim() || undefined,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Upload failed (${res.status})`);
  }

  return res.json();
}

/**
 * Query a document using hybrid search and Gemini.
 */
export async function queryDocument(
  documentId: string,
  question: string,
  instruction?: string,
  ownerId?: string,
  paragraphs?: Array<{ id: string; text: string; bbox?: any; [key: string]: any }>,
  fileUrl?: string
): Promise<QueryResponse> {
  const res = await fetch(`${API_BASE}/api/documents/${documentId}/query`, {
    method: "POST",
    headers: {
      ...getHeaders(ownerId),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      question: question.trim(),
      instruction: instruction?.trim() || undefined,
      paragraphs: paragraphs && paragraphs.length > 0 ? paragraphs : undefined,
      file_url: fileUrl || undefined,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Query failed (${res.status})`);
  }

  return res.json();
}

/**
 * Transcribe an audio recording using Gemini Flash STT on the backend.
 */
export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append("file", audioBlob, "audio.webm");

  const res = await fetch(`${API_BASE}/api/stt/transcribe`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Transcription failed (${res.status})`);
  }

  const json = await res.json();
  return json?.data?.text || "";
}

/**
 * Fetch all extracted chunks and bounding boxes for a document.
 */
export async function getDocumentChunks(
  documentId: string,
  ownerId?: string
): Promise<DocumentChunk[]> {
  const res = await fetch(`${API_BASE}/api/documents/${documentId}/chunks`, {
    method: "GET",
    headers: getHeaders(ownerId),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to fetch chunks (${res.status})`);
  }

  return res.json();
}

/**
 * List all documents for the authenticated user.
 */
export async function listDocuments(
  ownerId?: string
): Promise<Document[]> {
  const res = await fetch(`${API_BASE}/api/documents`, {
    method: "GET",
    headers: getHeaders(ownerId),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to list documents (${res.status})`);
  }

  return res.json();
}

/**
 * Get a single document by ID.
 */
export async function getDocument(
  documentId: string,
  ownerId?: string
): Promise<Document> {
  const res = await fetch(`${API_BASE}/api/documents/${documentId}`, {
    method: "GET",
    headers: getHeaders(ownerId),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Document not found (${res.status})`);
  }

  return res.json();
}

/**
 * Delete a document by ID.
 */
export async function deleteDocument(
  documentId: string,
  ownerId?: string
): Promise<DeleteResponse> {
  const res = await fetch(`${API_BASE}/api/documents/${documentId}`, {
    method: "DELETE",
    headers: getHeaders(ownerId),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Delete failed (${res.status})`);
  }

  return res.json();
}

/* ── Script & ElevenLabs TTS APIs ────────────────────────────────────────── */

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface ElevenLabsTTSResponse {
  audio_base64: string;
  words: WordTimestamp[];
  cached: boolean;
}

export interface ScriptSegmentItem {
  id: string;
  chunk_id: string;
  segment_index: number;
  text: string;
  page_number: number;
  bbox?: { x: number; y: number; w: number; h: number };
}

export interface ScriptResponseData {
  document_id: string;
  segments: ScriptSegmentItem[];
}

export interface VoiceOption {
  voice_id: string;
  name: string;
  description: string;
  category: string;
}

/**
 * Generate spoken script segments linked to PDF chunks and bboxes.
 */
export async function generateScript(
  documentId: string,
  voiceStyle: string = "natural",
  language: string = "en",
  forceRegenerate: boolean = false,
  paragraphs?: Array<{ id: string; text: string; bbox?: any; [key: string]: any }>,
  ownerId?: string
): Promise<ScriptResponseData> {
  const res = await fetch(`${API_BASE}/api/documents/${documentId}/script`, {
    method: "POST",
    headers: {
      ...getHeaders(ownerId),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      voice_style: voiceStyle,
      language,
      force_regenerate: forceRegenerate,
      paragraphs: paragraphs && paragraphs.length > 0 ? paragraphs : undefined,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Script generation failed (${res.status})`);
  }

  return res.json();
}

/**
 * Synthesize speech via ElevenLabs with word-level timestamps and disk caching.
 */
export async function synthesizeElevenLabs(
  text: string,
  voiceId?: string,
  modelId?: string
): Promise<ElevenLabsTTSResponse> {
  const res = await fetch(`${API_BASE}/api/tts/eleven`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      voice_id: voiceId,
      model_id: modelId,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Speech synthesis failed (${res.status})`);
  }

  const json = await res.json();
  return json.data;
}

/**
 * List available ElevenLabs voices.
 */
export async function getElevenLabsVoices(): Promise<VoiceOption[]> {
  const res = await fetch(`${API_BASE}/api/tts/voices`, {
    method: "GET",
  });

  if (!res.ok) {
    return [
      { voice_id: "pNInz6obpgDQGcFmaJgB", name: "Adam", description: "Deep & Grounded", category: "premade" },
      { voice_id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", description: "Soft & Clear", category: "premade" },
      { voice_id: "ErXwobaYiN019PkySvjV", name: "Antoni", description: "Engaging", category: "premade" },
      { voice_id: "VR6AewLTigWG4xSOukaG", name: "Arnold", description: "Articulate", category: "premade" },
    ];
  }

  const json = await res.json();
  return json.data || [];
}
