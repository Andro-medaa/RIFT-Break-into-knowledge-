"use client";

import React, { useState } from "react";
import type { ApiResponse, DocumentMeta, DocumentChunk } from "@/types/api";

interface PdfIngestionBarProps {
  onIngestSuccess: (meta: DocumentMeta, chunks: DocumentChunk[]) => void;
}

export const PdfIngestionBar: React.FC<PdfIngestionBarProps> = ({ onIngestSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeMeta, setActiveMeta] = useState<DocumentMeta | null>(null);
  const [ingestLatency, setIngestLatency] = useState<number | null>(null);

  const fetchChunksForDoc = async (docId: string): Promise<DocumentChunk[]> => {
    let res: Response | null = null;
    try {
      res = await fetch(`http://localhost:8000/documents/${docId}/chunks`);
    } catch {
      res = await fetch(`http://127.0.0.1:8000/documents/${docId}/chunks`);
    }

    if (!res || !res.ok) {
      throw new Error(`Failed to fetch parsed chunks: ${res?.statusText}`);
    }

    const json = (await res.json()) as ApiResponse<DocumentChunk[]>;
    return json.data || [];
  };

  const handleIngestSample = async () => {
    setLoading(true);
    setError(null);
    const t0 = performance.now();

    try {
      let res: Response | null = null;
      try {
        res = await fetch("http://localhost:8000/documents/sample", { method: "POST" });
      } catch {
        res = await fetch("http://127.0.0.1:8000/documents/sample", { method: "POST" });
      }

      const t1 = performance.now();
      setIngestLatency(Math.round(t1 - t0));

      if (!res || !res.ok) {
        throw new Error(`Backend ingestion failed: ${res?.statusText}`);
      }

      const json = (await res.json()) as ApiResponse<DocumentMeta>;
      if (!json.data) throw new Error("No document metadata returned");

      setActiveMeta(json.data);
      const chunks = await fetchChunksForDoc(json.data.id);
      onIngestSuccess(json.data, chunks);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "PDF Ingestion failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    const t0 = performance.now();

    const formData = new FormData();
    formData.append("file", file);

    try {
      let res: Response | null = null;
      try {
        res = await fetch("http://localhost:8000/documents", {
          method: "POST",
          body: formData,
        });
      } catch {
        res = await fetch("http://127.0.0.1:8000/documents", {
          method: "POST",
          body: formData,
        });
      }

      const t1 = performance.now();
      setIngestLatency(Math.round(t1 - t0));

      if (!res || !res.ok) {
        const errorJson = (await res?.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(errorJson?.detail || `Upload failed: ${res?.statusText}`);
      }

      const json = (await res.json()) as ApiResponse<DocumentMeta>;
      if (!json.data) throw new Error("No document metadata returned");

      setActiveMeta(json.data);
      const chunks = await fetchChunksForDoc(json.data.id);
      onIngestSuccess(json.data, chunks);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="glass-panel"
      id="pdf-ingestion-card"
      style={{
        padding: "24px",
        marginBottom: "24px",
        border: "1px solid rgba(6, 182, 212, 0.3)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h3 style={{ fontSize: "1.2rem", marginBottom: "4px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>⚡</span> PyMuPDF Ingestion Engine (Step 3)
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
            Extracts normalized bounding coordinates <code>[x0, y0, x1, y1]</code>, detects headings, and produces pedagogical chunks.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <button
            id="ingest-sample-pdf-btn"
            className="btn-verify"
            onClick={handleIngestSample}
            disabled={loading}
            style={{
              padding: "10px 20px",
              fontSize: "0.9rem",
              background: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)",
            }}
          >
            {loading ? (
              <>
                <span className="btn-spinner" />
                Parsing with PyMuPDF...
              </>
            ) : (
              <>
                <span>📑</span>
                Ingest Sample Textbook PDF
              </>
            )}
          </button>

          <label
            htmlFor="pdf-file-upload-input"
            className="btn-tool"
            style={{
              cursor: "pointer",
              padding: "10px 18px",
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid var(--border-subtle)",
              fontWeight: 600,
            }}
          >
            📂 Upload Custom PDF
          </label>
          <input
            id="pdf-file-upload-input"
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
            style={{ display: "none" }}
            disabled={loading}
          />
        </div>
      </div>

      {/* Active Ingested Document Metadata Banner */}
      {activeMeta && (
        <div
          id="ingestion-success-banner"
          style={{
            marginTop: "16px",
            padding: "14px 18px",
            background: "rgba(6, 182, 212, 0.08)",
            border: "1px solid rgba(6, 182, 212, 0.35)",
            borderRadius: "var(--radius-sm)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
            animation: "fadeIn 0.3s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
            <span style={{ color: "#67e8f9", fontWeight: 700, fontSize: "0.95rem" }}>
              ✓ {activeMeta.title}
            </span>
            <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
              ID: {activeMeta.id.slice(0, 8)}...
            </span>
            <span style={{ fontSize: "0.82rem", color: "#a5b4fc", fontFamily: "var(--font-mono)" }}>
              Pages: {activeMeta.page_count}
            </span>
            <span style={{ fontSize: "0.82rem", color: "#34d399", fontFamily: "var(--font-mono)" }}>
              Chunks: {activeMeta.chunks_count}
            </span>
          </div>
          {ingestLatency !== null && (
            <div className="latency-tag" id="ingest-latency-tag">
              ⚡ {ingestLatency}ms PyMuPDF Parse Time
            </div>
          )}
        </div>
      )}

      {error && (
        <div
          id="ingestion-error-banner"
          style={{
            marginTop: "16px",
            padding: "12px 16px",
            background: "rgba(244, 63, 94, 0.12)",
            border: "1px solid rgba(244, 63, 94, 0.4)",
            borderRadius: "var(--radius-sm)",
            color: "#fb7185",
            fontSize: "0.88rem",
            fontFamily: "var(--font-mono)",
          }}
        >
          ✕ {error}
        </div>
      )}
    </div>
  );
};
