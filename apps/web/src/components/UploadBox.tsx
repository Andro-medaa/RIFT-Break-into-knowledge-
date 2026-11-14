/**
 * UploadBox – The main instruction + PDF upload interaction area.
 *
 * TWO-STAGE FLOW:
 *   Stage 1 (idle / selected): User picks a file → preview chip appears with
 *     Remove & Replace actions. Upload does NOT start yet.
 *   Stage 2 (send):  User clicks the Send (↑) button → upload starts →
 *     on success navigate to /chat/[docId].
 *
 * Deep Teal & Dark Jet Black Glass Theme:
 * ┌─────────────────────────────────────────────────────┬──────┐
 * │  "Write all Instructions"  (top-left, 20px light)   │      │
 * │  ── selected-file chip when a PDF is chosen ──      │  →   │
 * │  ⊕  Upload the pdf/pdfs   (bottom-left)             │      │
 * └─────────────────────────────────────────────────────┴──────┘
 */

"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, FileUp, Loader2, X, RefreshCw, Send, FileText, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { uploadPdf } from "@/lib/api";
import { useRift } from "@/lib/store";
import { CyberMascotLoader } from "@/components/common/CyberMascotLoader";

/* ─── helpers ───────────────────────────────────────────────────────────────── */

function fmtSize(bytes: number): string {
  if (!bytes) return "";
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${"BKMG"[i]}B`;
}

/* ─── Component ─────────────────────────────────────────────────────────────── */

export default function UploadBox({ isMobile = false }: { isMobile?: boolean } = {}) {
  const router = useRouter();
  const { addThread, setUploading, isUploading, setError } = useRift();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [instruction, setInstruction] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [isBoxHovered, setIsBoxHovered] = useState(false);

  /** Selected but NOT yet uploaded. null = no file chosen. */
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  /** Uploading progress message */
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  /* ── Stage 1: validate & stage the file (no upload yet) ── */
  const stageFile = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        setError("Only PDF files are accepted.");
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        setError("File size exceeds 50 MB limit.");
        return;
      }
      setError(null);
      setSelectedFile(file);
    },
    [setError]
  );

  /* ── Stage 2: upload and navigate ── */
  const handleSend = useCallback(async () => {
    if (!selectedFile) return;
    setError(null);
    setUploading(true);
    setUploadProgress(`Uploading "${selectedFile.name}"…`);
    try {
      const doc = await uploadPdf(selectedFile, instruction);
      addThread(doc);
      setUploadProgress(null);
      setUploading(false);
      router.push(`/chat/${doc.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setUploadProgress(null);
      setUploading(false);
    }
  }, [selectedFile, instruction, addThread, setUploading, setError, router]);

  /* ── Drag & Drop ── */
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const pdf = Array.from(e.dataTransfer.files).find((f) =>
        f.name.toLowerCase().endsWith(".pdf")
      );
      if (pdf) stageFile(pdf);
      else setError("Please drop a PDF file.");
    },
    [stageFile, setError]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  /* ── File picker handlers ── */
  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) stageFile(file);
      e.target.value = "";
    },
    [stageFile]
  );

  const onReplaceChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) stageFile(file);
      e.target.value = "";
    },
    [stageFile]
  );

  const hasFile = !!selectedFile;
  const isBusy = isUploading;
  const canSend = hasFile && !isBusy;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "stretch",
        gap: "0",
        width: isMobile ? "100%" : "74%",
        maxWidth: "760px",
        minWidth: isMobile ? "0px" : "340px",
        borderRadius: "26px",
        border: isDragOver
          ? "1.5px solid #00f5d4"
          : isBoxHovered
          ? "1.5px solid rgba(0, 245, 212, 0.65)"
          : hasFile
          ? "1.5px solid rgba(0, 245, 212, 0.45)"
          : "1.5px solid rgba(13, 148, 136, 0.38)",
        background: isDragOver
          ? "rgba(0, 245, 212, 0.14)"
          : isBoxHovered
          ? "rgba(4, 12, 18, 0.96)"
          : "rgba(2, 7, 10, 0.93)",
        boxShadow: isDragOver
          ? "0 0 32px rgba(0, 245, 212, 0.45)"
          : isBoxHovered
          ? "0 18px 45px rgba(0, 0, 0, 0.85), 0 0 28px rgba(0, 245, 212, 0.22)"
          : "0 12px 35px rgba(0, 0, 0, 0.75)",
        transition: "border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={() => setIsBoxHovered(true)}
      onMouseLeave={() => setIsBoxHovered(false)}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      {/* ── LEFT column ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: isMobile ? "14px 10px 12px 14px" : "20px 0px 18px 28px",
          gap: "14px",
          minWidth: 0,
        }}
      >
        {/* Instruction text (supports multi-line coverage, tone, style, sequence rules) */}
        <textarea
          ref={textareaRef}
          rows={1}
          value={instruction}
          onChange={(e) => {
            setInstruction(e.target.value);
            const el = textareaRef.current;
            if (el) {
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 136)}px`;
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && canSend) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Write all instructions — coverage, tone, style, sequence… (optional)"
          disabled={isBusy}
          style={{
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: isMobile ? "16px" : "19px",
            lineHeight: "1.35",
            color: "#f0fdfa",
            fontFamily: "inherit",
            fontWeight: 400,
            letterSpacing: "0.01em",
            width: "100%",
            minHeight: "28px",
            maxHeight: "136px",
            resize: "none",
            overflowY: "auto",
            opacity: isBusy ? 0.5 : 1,
          }}
          className="placeholder-[#64748b]"
        />

        {/* ── Selected-file chip (animated in/out) ── */}
        <AnimatePresence>
          {hasFile && !uploadProgress && (
            <motion.div
              key="file-chip"
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.97 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "rgba(13, 148, 136, 0.16)",
                border: "1px solid rgba(0, 245, 212, 0.45)",
                borderRadius: "12px",
                padding: "7px 10px",
                maxWidth: "100%",
                overflow: "hidden",
              }}
            >
              {/* File icon */}
              <FileText size={15} color="#00f5d4" style={{ flexShrink: 0 }} />

              {/* Filename + size */}
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#5eead4",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={selectedFile!.name}
              >
                {selectedFile!.name}
              </span>
              <span
                style={{
                  fontSize: "11px",
                  color: "#64748b",
                  flexShrink: 0,
                }}
              >
                {fmtSize(selectedFile!.size)}
              </span>

              {/* Replace button */}
              <button
                type="button"
                title="Replace file"
                onClick={() => replaceInputRef.current?.click()}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "22px",
                  height: "22px",
                  borderRadius: "6px",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  cursor: "pointer",
                  flexShrink: 0,
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "rgba(0, 245, 212, 0.2)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    "rgba(0, 245, 212, 0.5)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "rgba(255,255,255,0.05)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    "rgba(255,255,255,0.1)";
                }}
              >
                <RefreshCw size={12} color="#94a3b8" />
              </button>

              {/* Remove / clear button */}
              <button
                type="button"
                title="Remove file"
                onClick={() => setSelectedFile(null)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "22px",
                  height: "22px",
                  borderRadius: "6px",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  cursor: "pointer",
                  flexShrink: 0,
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "rgba(244, 63, 94, 0.18)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    "rgba(244, 63, 94, 0.45)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "rgba(255,255,255,0.05)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    "rgba(255,255,255,0.1)";
                }}
              >
                <X size={12} color="#94a3b8" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Upload progress inline message */}
        <AnimatePresence>
          {uploadProgress && (
            <motion.div
              key="progress"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "13px",
                color: "#00f5d4",
                fontWeight: 500,
              }}
            >
              <Sparkles size={14} className="animate-pulse" color="#00f5d4" />
              {uploadProgress}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Upload trigger button — shown when NO file is staged */}
        <AnimatePresence>
          {!hasFile && (
            <motion.button
              key="upload-btn"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isBusy}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                background: "none",
                border: "none",
                cursor: isBusy ? "not-allowed" : "pointer",
                padding: 0,
                opacity: isBusy ? 0.6 : 1,
                textAlign: "left",
              }}
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  border: "1.5px solid #00f5d4",
                  flexShrink: 0,
                  color: "#00f5d4",
                  background: "rgba(0, 245, 212, 0.12)",
                  boxShadow: "0 0 12px rgba(0, 245, 212, 0.25)",
                  transition: "all 0.2s ease",
                }}
              >
                <Plus size={17} color="#00f5d4" strokeWidth={2.2} />
              </span>
              <span
                style={{
                  fontSize: "14.5px",
                  fontWeight: 600,
                  color: "#5eead4",
                  letterSpacing: "0.01em",
                  fontFamily: "inherit",
                }}
              >
                Upload the pdf/pdfs
              </span>
            </motion.button>
          )}
        </AnimatePresence>

        {/* "Pick a different PDF" link — shown when a file IS staged */}
        <AnimatePresence>
          {hasFile && !uploadProgress && (
            <motion.button
              key="pick-btn"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                textAlign: "left",
              }}
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  border: "1.5px solid rgba(0, 245, 212, 0.5)",
                  flexShrink: 0,
                  background: "rgba(0, 245, 212, 0.1)",
                }}
              >
                <Plus size={15} color="#00f5d4" strokeWidth={2} />
              </span>
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "#5eead4",
                  fontFamily: "inherit",
                }}
              >
                Pick a different PDF
              </span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* ── RIGHT column: animated Send / Mic / Spinner ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: isMobile ? "12px 14px 12px 8px" : "16px 20px 16px 12px",
        }}
      >
        <AnimatePresence mode="wait">
          {isBusy ? (
            /* Uploading mascot companion */
            <motion.div
              key="loading-btn"
              initial={{ opacity: 0, scale: 0.75 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.75 }}
              style={{
                width: "66px",
                height: "66px",
                borderRadius: "50%",
                background:
                  "radial-gradient(circle at 35% 35%, #042f2e, #021a1a)",
                border: "1.5px solid rgba(0, 245, 212, 0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow: "0 0 20px rgba(0, 245, 212, 0.2)",
                overflow: "hidden",
              }}
            >
              <CyberMascotLoader size="avatar" />
            </motion.div>
          ) : canSend ? (
            /* Send button — luminous deep teal/cyan glowing ↑ arrow */
            <motion.button
              key="send-btn"
              type="button"
              onClick={handleSend}
              title="Send & open RIFT viewer"
              aria-label="Send PDF"
              initial={{ opacity: 0, scale: 0.75 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.75 }}
              whileHover={{
                scale: 1.1,
                boxShadow:
                  "0 0 38px rgba(0, 245, 212, 0.85), 0 0 14px rgba(13, 148, 136, 0.6)",
              }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: "spring", stiffness: 350, damping: 22 }}
              style={{
                width: "66px",
                height: "66px",
                borderRadius: "50%",
                background:
                  "radial-gradient(circle at 35% 35%, #00f5d4, #0d9488)",
                border: "1.5px solid rgba(0, 245, 212, 0.85)",
                boxShadow:
                  "0 0 26px rgba(0, 245, 212, 0.65), 0 0 10px rgba(13, 148, 136, 0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <Send size={24} color="#020406" strokeWidth={2.4} />
            </motion.button>
          ) : (
            /* Idle mic / upload shortcut button */
            <motion.button
              key="mic-btn"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Upload PDF"
              aria-label="Upload PDF"
              initial={{ opacity: 0, scale: 0.75 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.75 }}
              whileHover={{
                scale: 1.06,
                boxShadow: "0 0 24px rgba(0, 245, 212, 0.4)",
                borderColor: "rgba(0, 245, 212, 0.75)",
              }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 350, damping: 22 }}
              style={{
                width: "66px",
                height: "66px",
                borderRadius: "50%",
                background:
                  "radial-gradient(circle at 35% 35%, #042f2e, #021a1a)",
                border: "1.5px solid rgba(0, 245, 212, 0.5)",
                boxShadow: "0 0 18px rgba(0, 245, 212, 0.22)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#00f5d4"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={onInputChange}
        style={{ display: "none" }}
        aria-label="Upload PDF file"
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={onReplaceChange}
        style={{ display: "none" }}
        aria-label="Replace PDF file"
      />

      {/* Drag-and-drop overlay */}
      {isDragOver && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "26px",
            background: "rgba(2, 7, 10, 0.94)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            zIndex: 10,
            gap: "12px",
            color: "#00f5d4",
            fontSize: "17px",
            fontWeight: 600,
          }}
        >
          <FileUp size={28} className="animate-bounce" color="#00f5d4" />
          Drop your PDF here
        </div>
      )}
    </div>
  );
}
