/**
 * ChatPageContent – Loads document and renders the 3-panel RIFT Workspace.
 *
 * Layout:
 * - Top slim glass header bar: Back to Home + document title + status pill
 * - Center: Full-height WorkspaceLayout (62% PDF Viewer on left, 38% Transcript + RAG on right)
 * - Zero window scroll: entire page is locked to viewport height with individual internal scrolling.
 */
"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { getDocument } from "@/lib/api";
import { useRift } from "@/lib/store";
import type { Document } from "@/lib/types";
import { useIsMobile } from "@/lib/useIsMobile";
import dynamic from "next/dynamic";
import { CyberMascotLoader } from "@/components/common/CyberMascotLoader";

/* Load WorkspaceLayout as a client-only component (react-pdf uses browser APIs) */
const WorkspaceLayout = dynamic(
  () => import("@/components/workspace/WorkspaceLayout"),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          flex: 1,
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <CyberMascotLoader
          size="lg"
          mode="parsing"
          title="Loading 3-Section Workspace…"
          subtitle="Initializing neural PDF canvas, teleprompter, and knowledge engine"
        />
      </div>
    ),
  }
);

export default function ChatPageContent({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  const { docId } = use(params);
  const router = useRouter();
  const { setActiveThread } = useRift();
  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useIsMobile(768);

  useEffect(() => {
    setActiveThread(docId);
    let cancelled = false;

    async function load() {
      try {
        const data = await getDocument(docId);
        if (!cancelled) setDoc(data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load document");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [docId, setActiveThread]);

  if (loading) {
    return (
      <div
        style={{
          flex: 1,
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <CyberMascotLoader
          size="lg"
          mode="parsing"
          title="Opening Document Workspace…"
          subtitle="Decrypting document tensors and preparing cybernetic HUD"
        />
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div
        style={{
          flex: 1,
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: "16px",
          background: "rgba(3, 8, 12, 0.90)",
          borderRadius: "20px",
          border: "1px solid rgba(244, 63, 94, 0.3)",
          color: "var(--text-secondary)",
          textAlign: "center",
          padding: "40px",
        }}
      >
        <span style={{ fontSize: "36px" }}>⚠️</span>
        <p style={{ color: "#fb7185", fontWeight: 500 }}>{error ?? "Document not found"}</p>
        <button
          onClick={() => router.push("/")}
          className="btn-tool"
          style={{
            padding: "10px 24px",
            background: "rgba(0, 245, 212, 0.15)",
            borderColor: "rgba(0, 245, 212, 0.35)",
            color: "#5eead4",
          }}
        >
          ← Return to Home
        </button>
      </div>
    );
  }

  const docTitle = doc.filename.replace(/_/g, " ").replace(/\.pdf$/i, "");

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.99 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        height: "100%",
        width: "100%",
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      {/* ── Slim glass top bar: back button + document name + status pill ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: isMobile ? "4px 10px" : "8px 14px",
          borderRadius: "14px",
          background: "rgba(3, 8, 12, 0.90)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(0, 245, 212, 0.14)",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.65)",
          flexShrink: 0,
          height: isMobile ? "38px" : "46px",
          position: "relative",
          zIndex: 1000,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? "6px" : "10px", minWidth: 0 }}>
          <button
            onClick={() => {
              setActiveThread(null);
              router.push("/");
            }}
            className="btn-tool"
            style={{
              padding: isMobile ? "4px 8px" : "5px 10px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              gap: "5px",
              fontSize: "12px",
            }}
            title="Return to Home"
          >
            <ArrowLeft size={14} />
            {!isMobile && <span>Home</span>}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
            <BookOpen size={isMobile ? 13 : 15} color="#00f5d4" style={{ flexShrink: 0 }} />
            <span
              style={{
                fontSize: isMobile ? "12px" : "13.5px",
                fontWeight: 600,
                color: "var(--text-primary)",
                fontFamily: "var(--font-heading)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {docTitle}
            </span>
          </div>
        </div>

        {/* Portal target for Roadmap indicator rendered from WorkspaceLayout */}
        <div id="rift-topbar-right" style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0, position: "relative" }} />
      </div>

      {/* ── 3-Panel Workspace: fills remaining height, zero page scroll ── */}
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
        <WorkspaceLayout
          pdfUrl={doc.file_url}
          documentId={doc.id}
          initialInstruction={doc.instruction}
        />
      </div>
    </motion.div>
  );
}
