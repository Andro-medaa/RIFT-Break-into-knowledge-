/**
 * Shared TypeScript types for the RIFT frontend.
 */

/** Document metadata returned from the API. */
export interface Document {
  id: string;
  owner_id: string;
  filename: string;
  file_url: string;
  storage_path: string;
  file_size: number;
  mime_type: string;
  created_at?: string | null;
  instruction?: string | null;
}

/** Upload response from the API. */
export interface UploadResponse extends Document {}

/** Delete response from the API. */
export interface DeleteResponse {
  success: boolean;
  message: string;
}

/** A PDF conversation thread in the sidebar. */
export interface PdfThread {
  id: string;
  filename: string;
  file_url: string;
  file_size: number;
  created_at?: string | null;
  /** Thumbnail data URL or placeholder */
  thumbnail?: string | null;
}

