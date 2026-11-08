/**
 * React Context for managing RIFT application state.
 *
 * Provides:
 * - PDF thread history (sidebar)
 * - Active document selection
 * - Upload state
 */

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { PdfThread, Document } from "./types";
import { listDocuments } from "./api";

interface RiftState {
  /** All PDF conversation threads */
  threads: PdfThread[];
  /** Currently selected thread ID */
  activeThreadId: string | null;
  /** Whether a file upload is in progress */
  isUploading: boolean;
  /** Error message (if any) */
  error: string | null;

  /** Add a new thread after successful upload */
  addThread: (doc: Document) => void;
  /** Set the active thread */
  setActiveThread: (id: string | null) => void;
  /** Remove a thread */
  removeThread: (id: string) => void;
  /** Set uploading state */
  setUploading: (v: boolean) => void;
  /** Set error */
  setError: (msg: string | null) => void;
  /** Reload threads from API */
  refreshThreads: () => Promise<void>;
}

const RiftContext = createContext<RiftState | null>(null);

export function RiftProvider({ children }: { children: ReactNode }) {
  const [threads, setThreads] = useState<PdfThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshThreads = useCallback(async () => {
    try {
      const docs = await listDocuments();
      setThreads(
        docs.map((d) => ({
          id: d.id,
          filename: d.filename,
          file_url: d.file_url,
          file_size: d.file_size,
          created_at: d.created_at,
          thumbnail: null,
        }))
      );
    } catch {
      // Silently fail on initial load — API might not be running
    }
  }, []);

  // Load threads on mount
  useEffect(() => {
    refreshThreads();
  }, [refreshThreads]);

  const addThread = useCallback((doc: Document) => {
    setThreads((prev) => {
      // Prevent duplicates
      if (prev.some((t) => t.id === doc.id)) return prev;
      return [
        {
          id: doc.id,
          filename: doc.filename,
          file_url: doc.file_url,
          file_size: doc.file_size,
          created_at: doc.created_at,
          thumbnail: null,
        },
        ...prev,
      ];
    });
  }, []);

  const removeThread = useCallback((id: string) => {
    setThreads((prev) => prev.filter((t) => t.id !== id));
    setActiveThreadId((prev) => (prev === id ? null : prev));
  }, []);

  return (
    <RiftContext.Provider
      value={{
        threads,
        activeThreadId,
        isUploading,
        error,
        addThread,
        setActiveThread: setActiveThreadId,
        removeThread,
        setUploading: setIsUploading,
        setError,
        refreshThreads,
      }}
    >
      {children}
    </RiftContext.Provider>
  );
}

export function useRift(): RiftState {
  const ctx = useContext(RiftContext);
  if (!ctx) throw new Error("useRift must be used within <RiftProvider>");
  return ctx;
}
