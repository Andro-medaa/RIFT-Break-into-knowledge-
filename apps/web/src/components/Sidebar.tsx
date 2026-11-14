/**
 * PDF History Sidebar – Deep Teal & Jet Black Glass Theme.
 *
 * Preserves exact layout proportions and functionality:
 * • Full-height glass panel (33% of viewport width).
 * • "History" header with collapsible toggle.
 * • Document grid with previews, titles, and delete actions.
 * • True jet black backdrop with deep teal borders and luminous cyan highlights.
 */

"use client";

import { memo, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Trash2, ChevronDown, Sparkles } from "lucide-react";
import { useRift } from "@/lib/store";
import { deleteDocument } from "@/lib/api";
import type { PdfThread } from "@/lib/types";
import SpiralGalaxiesBackground from "./SpiralGalaxiesBackground";

/* ─── helpers ─────────────────────────────────────────────────────────────── */

function formatSize(bytes: number): string {
  if (!bytes) return "";
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${"BKMG"[i]}B`;
}

function shortName(filename: string, max = 15): string {
  const name = filename.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim();
  return name.length <= max ? name : name.slice(0, max - 1) + "…";
}

/* ─── PdfCard ──────────────────────────────────────────────────────────────── */

const PdfCard = memo(function PdfCard({
  thread,
  isActive,
  onSelect,
  onDelete,
}: {
  thread: PdfThread;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="sidebar-item"
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={thread.filename}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: "12px 8px 10px 8px",
        borderRadius: "18px",
        cursor: "pointer",
        userSelect: "none",
        transition: "background-color 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease",
        background: isActive
          ? "rgba(13, 148, 136, 0.22)"
          : hovered
          ? "rgba(0, 245, 212, 0.06)"
          : "transparent",
        border: isActive
          ? "1.5px solid rgba(0, 245, 212, 0.65)"
          : hovered
          ? "1.5px solid rgba(0, 245, 212, 0.22)"
          : "1.5px solid transparent",
        boxShadow: isActive ? "0 0 20px rgba(0, 245, 212, 0.25)" : "none",
      }}
    >
      {/* ── Thumbnail ─────────────────────────────────────────────── */}
      <div
        style={{
          position: "relative",
          width: "96px",
          height: "128px",
          borderRadius: "10px",
          background: "#ffffff",
          boxShadow: "0 4px 14px rgba(0,0,0,0.55)",
          overflow: "hidden",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          padding: "10px 9px",
          gap: "5px",
          border: "1px solid rgba(255,255,255,0.85)",
          transition: "transform 0.16s ease",
          transform: hovered ? "scale(1.04)" : "scale(1)",
          willChange: "transform",
        }}
      >
        {/* Mini "PDF" badge row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
          <span
            style={{
              fontSize: "7px",
              fontWeight: 800,
              color: "#0d9488",
              background: "rgba(13, 148, 136, 0.14)",
              borderRadius: "3px",
              padding: "1.5px 4px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            PDF
          </span>
          <FileText size={11} color="#0d9488" />
        </div>

        {/* Title-line placeholder */}
        {[80, 55].map((w, i) => (
          <div
            key={i}
            style={{
              height: "6px",
              width: `${w}%`,
              borderRadius: "3px",
              background: `rgba(15,23,42,${i === 0 ? 0.25 : 0.14})`,
            }}
          />
        ))}

        {/* Body-line placeholders */}
        <div style={{ marginTop: "4px", display: "flex", flexDirection: "column", gap: "4px" }}>
          {[100, 92, 83, 100, 76, 90, 68].map((w, i) => (
            <div
              key={i}
              style={{
                height: "4px",
                width: `${w}%`,
                borderRadius: "2px",
                background: "rgba(15,23,42,0.10)",
              }}
            />
          ))}
        </div>

        {/* Second paragraph block */}
        <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
          {[100, 85, 70].map((w, i) => (
            <div
              key={i}
              style={{
                height: "4px",
                width: `${w}%`,
                borderRadius: "2px",
                background: "rgba(15,23,42,0.07)",
              }}
            />
          ))}
        </div>
      </div>

      {/* ── Title ─────────────────────────────────────────────────── */}
      <p
        style={{
          marginTop: "9px",
          fontSize: "13.5px",
          fontWeight: 600,
          color: isActive ? "#5eead4" : "#e2e8f0",
          lineHeight: 1.25,
          maxWidth: "104px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {shortName(thread.filename)}
      </p>

      {/* ── Size ──────────────────────────────────────────────────── */}
      {thread.file_size > 0 && (
        <p
          style={{
            marginTop: "2px",
            fontSize: "11px",
            color: "#94a3b8",
            fontWeight: 500,
          }}
        >
          {formatSize(thread.file_size)}
        </p>
      )}

      {/* ── Delete button (hover only) ─────────────────────────── */}
      {hovered && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete"
          aria-label="Delete document"
          style={{
            position: "absolute",
            top: "6px",
            right: "6px",
            width: "24px",
            height: "24px",
            borderRadius: "50%",
            background: "rgba(15, 23, 42, 0.9)",
            border: "1px solid rgba(244, 63, 94, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            zIndex: 5,
            transition: "background-color 0.15s ease",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#e11d48")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "rgba(15, 23, 42, 0.9)")}
        >
          <Trash2 size={13} color="#fda4af" />
        </button>
      )}
    </div>
  );
});

/* ─── Sidebar ──────────────────────────────────────────────────────────────── */

export default function Sidebar({ isMobile = false }: { isMobile?: boolean } = {}) {
  const router = useRouter();
  const { threads, activeThreadId, setActiveThread, removeThread } = useRift();
  const [expanded, setExpanded] = useState(true);

  const handleSelect = useCallback(
    (id: string) => {
      setActiveThread(id);
      router.push(`/chat/${id}`);
    },
    [setActiveThread, router]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteDocument(id);
      } catch {
        /* ignore */
      }
      if (typeof window !== "undefined") {
        try {
          localStorage.removeItem(`rift_chat_thread_${id}`);
        } catch {}
      }
      removeThread(id);
    },
    [removeThread]
  );

  return (
    <motion.aside
      className="glass-panel"
      initial={{ opacity: 0, x: -32, scale: 0.985 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{
        duration: 0.65,
        ease: [0.16, 1, 0.3, 1],
      }}
      style={{
        width: isMobile ? "100%" : "33%",
        minWidth: isMobile ? "0px" : "270px",
        maxWidth: isMobile ? "none" : "420px",
        height: "100%",
        borderRadius: isMobile ? "18px" : "26px",
        background: "rgba(3, 8, 12, 0.92)",
        backdropFilter: "none",
        WebkitBackdropFilter: "none",
        border: "1px solid rgba(0, 245, 212, 0.14)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        flexShrink: 0,
        position: "relative",
        boxShadow: "0 16px 50px rgba(0, 0, 0, 0.75)",
        contain: "layout paint",
      }}
    >
      {/* Interactive Spiral Galaxies on the visible Home sidebar layer */}
      <SpiralGalaxiesBackground />

      {/* Top deep teal shimmer highlight line */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: "12%",
          right: "12%",
          height: "1.5px",
          background:
            "linear-gradient(90deg, transparent, rgba(0, 245, 212, 0.85), rgba(13, 148, 136, 0.6), transparent)",
          pointerEvents: "none",
          zIndex: 2,
        }}
      />
      {/* ════════════ HEADER ════════════ */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          padding: "26px 20px 18px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Sparkles size={18} color="#00f5d4" />
          <h2
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "var(--text-primary)",
              fontFamily: "var(--font-heading)",
              letterSpacing: "-0.02em",
              textAlign: "center",
              lineHeight: 1,
              userSelect: "none",
            }}
          >
            History
          </h2>
          {threads.length > 0 && (
            <span
              style={{
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                background: "rgba(0, 245, 212, 0.12)",
                color: "#5eead4",
                padding: "2px 8px",
                borderRadius: "var(--radius-full)",
                border: "1px solid rgba(0, 245, 212, 0.35)",
              }}
            >
              {threads.length}
            </span>
          )}
        </div>

        {/* Expand / collapse chevron */}
        <button
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Collapse history" : "Expand history"}
          aria-label={expanded ? "Collapse history" : "Expand history"}
          style={{
            position: "absolute",
            right: "16px",
            top: "50%",
            transform: "translateY(-50%)",
            width: "30px",
            height: "30px",
            borderRadius: "8px",
            background: "rgba(255, 255, 255, 0.06)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all 0.18s",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "rgba(255, 255, 255, 0.12)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "rgba(255, 255, 255, 0.06)")}
        >
          <ChevronDown
            size={16}
            color="#94a3b8"
            style={{
              transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
              transition: "transform 0.3s ease",
            }}
          />
        </button>
      </div>

      {/* ════════════ THREAD LIST — collapsible ════════════ */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="history-panel-content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "100%" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            style={{
              flex: "1 1 auto",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              position: "relative",
              zIndex: 1,
            }}
          >
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "16px 10px 20px 10px",
              }}
            >
              {threads.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "48px 16px",
                    textAlign: "center",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      width: "56px",
                      height: "56px",
                      borderRadius: "16px",
                      background: "rgba(0, 245, 212, 0.08)",
                      border: "1px solid rgba(0, 245, 212, 0.25)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 0 20px rgba(0, 245, 212, 0.12)",
                    }}
                  >
                    <FileText size={26} color="#00f5d4" />
                  </div>
                  <p
                    style={{
                      fontSize: "15px",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    No document history yet
                  </p>
                  <p
                    style={{
                      fontSize: "12.5px",
                      color: "var(--text-secondary)",
                      maxWidth: "180px",
                      lineHeight: 1.5,
                    }}
                  >
                    Upload a PDF to start an interactive lesson or conversation.
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "12px 8px",
                    justifyItems: "center",
                  }}
                >
                  {threads.map((thread) => (
                    <PdfCard
                      key={thread.id}
                      thread={thread}
                      isActive={activeThreadId === thread.id}
                      onSelect={() => handleSelect(thread.id)}
                      onDelete={() => handleDelete(thread.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}
