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
  number?: number;
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
  fileUrl?: string,
  signal?: AbortSignal,
  chatHistory?: Array<{ role: string; content: string }>
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
      chat_history: chatHistory && chatHistory.length > 0 ? chatHistory : undefined,
    }),
    signal,
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
  chapter_heading?: string | null;
  chunk_type?: string;
  image_url?: string;
}

export interface ScriptResponseData {
  document_id: string;
  segments: ScriptSegmentItem[];
  instruction?: string | null;
}

export interface VoiceOption {
  voice_id: string;
  name: string;
  description: string;
  category: string;
  preview_url?: string;
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
  ownerId?: string,
  instruction?: string,
  contentFilter?: string
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
      instruction: instruction !== undefined ? instruction.trim() : undefined,
      content_filter: contentFilter || undefined,
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
  if (json.data?.error) {
    throw new Error(json.data.error);
  }
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
      {
        voice_id: "hpp4J3VqNfWAUOO0d1Us",
        name: "Bella",
        description: "Female (Soft & Gentle)",
        category: "premade",
        preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/hpp4J3VqNfWAUOO0d1Us/dab0f5ba-3aa4-48a8-9fad-f138fea1126d.mp3",
      },
      {
        voice_id: "EXAVITQu4vr4xnSDxMaL",
        name: "Sarah",
        description: "Female (Soft & Expressive)",
        category: "premade",
        preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/EXAVITQu4vr4xnSDxMaL/01a3e33c-6e99-4ee7-8543-ff2216a32186.mp3",
      },
      {
        voice_id: "pFZP5JQG7iQjIQuC4Bku",
        name: "Lily",
        description: "Female (Velvety Actress, British)",
        category: "premade",
        preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/pFZP5JQG7iQjIQuC4Bku/89b68b35-b3dd-4348-a84a-a3c13a3c2b30.mp3",
      },
      {
        voice_id: "cgSgspJ2msm6clMCkdW9",
        name: "Jessica",
        description: "Female (Playful, Bright & Warm)",
        category: "premade",
        preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/cgSgspJ2msm6clMCkdW9/56a97bf8-b69b-448f-846c-c3a11683d45a.mp3",
      },
      {
        voice_id: "pNInz6obpgDQGcFmaJgB",
        name: "Adam",
        description: "Male (Deep & Grounded)",
        category: "premade",
        preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/pNInz6obpgDQGcFmaJgB/d6905d7a-dd26-4187-bfff-1bd3a5ea7cac.mp3",
      },
      {
        voice_id: "bIHbv24MWmeRgasZH58o",
        name: "Will",
        description: "Male (Relaxed Optimist)",
        category: "premade",
        preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/bIHbv24MWmeRgasZH58o/8caf8f3d-ad29-4980-af41-53f20c72d7a4.mp3",
      },
      {
        voice_id: "SOYHLrjzK2X1ezoPC6cr",
        name: "Harry",
        description: "Male (Fierce & Character)",
        category: "premade",
        preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/SOYHLrjzK2X1ezoPC6cr/86d178f6-f4b6-4e0e-85be-3de19f490794.mp3",
      },
      {
        voice_id: "cjVigY5qzO86Huf0OWal",
        name: "Eric",
        description: "Male (Smooth & Trustworthy)",
        category: "premade",
        preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/voices/cjVigY5qzO86Huf0OWal/d098fda0-6456-4030-b3d8-63aa048c9070.mp3",
      },
    ];
  }

  const json = await res.json();
  return json.data || [];
}

/* ── Conversation & Multi-Thread API ────────────────────────────────────────── */

export interface ConversationItem {
  id: string;
  document_id: string;
  owner_id: string;
  title: string;
  system_prompt?: string | null;
  summary?: string | null;
  created_at?: string;
  updated_at?: string;
  message_count: number;
}

export interface ChatMessageItem {
  id: string;
  conversation_id: string;
  document_id: string;
  owner_id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  sequence_number: number;
  created_at?: string;
  updated_at?: string;
}

export interface ConversationDetailResponse {
  conversation: ConversationItem;
  messages: ChatMessageItem[];
}

export async function listConversations(
  documentId: string,
  ownerId?: string
): Promise<ConversationItem[]> {
  const res = await fetch(`${API_BASE}/api/documents/${documentId}/conversations`, {
    method: "GET",
    headers: getHeaders(ownerId),
  });
  if (!res.ok) return [];
  return res.json();
}

export async function createConversation(
  documentId: string,
  title?: string,
  systemPrompt?: string,
  ownerId?: string
): Promise<ConversationItem> {
  const res = await fetch(`${API_BASE}/api/documents/${documentId}/conversations`, {
    method: "POST",
    headers: {
      ...getHeaders(ownerId),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: title || "New Discussion",
      system_prompt: systemPrompt || undefined,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to create conversation");
  }
  return res.json();
}

export async function getConversation(
  conversationId: string,
  ownerId?: string
): Promise<ConversationDetailResponse | null> {
  const res = await fetch(`${API_BASE}/api/conversations/${conversationId}`, {
    method: "GET",
    headers: getHeaders(ownerId),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function updateConversation(
  conversationId: string,
  data: { title?: string; system_prompt?: string },
  ownerId?: string
): Promise<ConversationItem> {
  const res = await fetch(`${API_BASE}/api/conversations/${conversationId}`, {
    method: "PATCH",
    headers: {
      ...getHeaders(ownerId),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to update conversation");
  }
  return res.json();
}

export async function deleteConversation(
  conversationId: string,
  ownerId?: string
): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/conversations/${conversationId}`, {
    method: "DELETE",
    headers: getHeaders(ownerId),
  });
  return res.ok;
}

export async function queryConversation(
  conversationId: string,
  question: string,
  paragraphs?: Array<{ id: string; text: string; bbox?: any }>,
  fileUrl?: string,
  signal?: AbortSignal,
  ownerId?: string,
  instruction?: string
): Promise<{ user_message: ChatMessageItem; assistant_message: ChatMessageItem }> {
  const res = await fetch(`${API_BASE}/api/conversations/${conversationId}/query`, {
    method: "POST",
    headers: {
      ...getHeaders(ownerId),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      question,
      instruction: instruction?.trim() || undefined,
      paragraphs: paragraphs && paragraphs.length > 0 ? paragraphs : undefined,
      file_url: fileUrl || undefined,
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Query failed (${res.status})`);
  }
  return res.json();
}

export async function editConversationMessage(
  conversationId: string,
  messageId: string,
  newContent: string,
  paragraphs?: Array<{ id: string; text: string; bbox?: any }>,
  fileUrl?: string,
  ownerId?: string,
  instruction?: string
): Promise<{ user_message: ChatMessageItem; assistant_message: ChatMessageItem }> {
  const res = await fetch(`${API_BASE}/api/conversations/${conversationId}/messages/${messageId}`, {
    method: "PUT",
    headers: {
      ...getHeaders(ownerId),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      new_content: newContent,
      instruction: instruction?.trim() || undefined,
      paragraphs: paragraphs && paragraphs.length > 0 ? paragraphs : undefined,
      file_url: fileUrl || undefined,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Edit failed (${res.status})`);
  }
  return res.json();
}

export async function retryConversationMessage(
  conversationId: string,
  messageId: string,
  paragraphs?: Array<{ id: string; text: string; bbox?: any }>,
  fileUrl?: string,
  ownerId?: string,
  instruction?: string
): Promise<ChatMessageItem> {
  const res = await fetch(`${API_BASE}/api/conversations/${conversationId}/messages/${messageId}/retry`, {
    method: "POST",
    headers: {
      ...getHeaders(ownerId),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      instruction: instruction?.trim() || undefined,
      paragraphs: paragraphs && paragraphs.length > 0 ? paragraphs : undefined,
      file_url: fileUrl || undefined,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Retry failed (${res.status})`);
  }
  return res.json();
}

export async function deleteConversationMessage(
  conversationId: string,
  messageId: string,
  ownerId?: string
): Promise<{ ok: boolean; status: number; deletedCount?: number }> {
  const res = await fetch(`${API_BASE}/api/conversations/${conversationId}/messages/${messageId}`, {
    method: "DELETE",
    headers: getHeaders(ownerId),
  });
  if (!res.ok) {
    return { ok: false, status: res.status };
  }
  const data = await res.json().catch(() => ({}));
  return { ok: true, status: res.status, deletedCount: data.deleted_count };
}
