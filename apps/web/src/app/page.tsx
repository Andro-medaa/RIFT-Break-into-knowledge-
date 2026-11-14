/**
 * RIFT Home Page
 *
 * Two-panel layout:
 * - Left: PDF History Sidebar (33%)
 * - Right: Main Content with branding & upload (67%)
 */

"use client";

import { Suspense, useState } from "react";
import Sidebar from "@/components/Sidebar";
import MainContent from "@/components/MainContent";
import { useIsMobile } from "@/lib/useIsMobile";
import { useRift } from "@/lib/store";
import { FileUp, History } from "lucide-react";

export default function HomePage() {
  const isMobile = useIsMobile(768);
  const { threads } = useRift();
  const [mobileTab, setMobileTab] = useState<"upload" | "history">("upload");

  if (isMobile) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          width: "100%",
          minHeight: 0,
          minWidth: 0,
          gap: "8px",
        }}
      >
        {/* Mobile Segmented Tab Switcher */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: "rgba(3, 9, 14, 0.90)",
            borderRadius: "12px",
            border: "1px solid rgba(0, 245, 212, 0.2)",
            padding: "3px",
            gap: "4px",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => setMobileTab("upload")}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              padding: "7px 12px",
              borderRadius: "9px",
              fontSize: "12.5px",
              fontWeight: 600,
              fontFamily: "var(--font-heading)",
              background:
                mobileTab === "upload"
                  ? "linear-gradient(135deg, rgba(0, 245, 212, 0.25), rgba(13, 148, 136, 0.35))"
                  : "transparent",
              border:
                mobileTab === "upload"
                  ? "1px solid rgba(0, 245, 212, 0.5)"
                  : "1px solid transparent",
              color: mobileTab === "upload" ? "#00f5d4" : "#94a3b8",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <FileUp size={14} />
            <span>Upload & Prompt</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileTab("history")}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              padding: "7px 12px",
              borderRadius: "9px",
              fontSize: "12.5px",
              fontWeight: 600,
              fontFamily: "var(--font-heading)",
              background:
                mobileTab === "history"
                  ? "linear-gradient(135deg, rgba(0, 245, 212, 0.25), rgba(13, 148, 136, 0.35))"
                  : "transparent",
              border:
                mobileTab === "history"
                  ? "1px solid rgba(0, 245, 212, 0.5)"
                  : "1px solid transparent",
              color: mobileTab === "history" ? "#00f5d4" : "#94a3b8",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <History size={14} />
            <span>History ({threads.length})</span>
          </button>
        </div>

        {/* Active Tab View */}
        <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
          {mobileTab === "upload" ? (
            <Suspense>
              <MainContent isMobile={true} />
            </Suspense>
          ) : (
            <Suspense>
              <Sidebar isMobile={true} />
            </Suspense>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <Suspense>
        <Sidebar />
      </Suspense>
      <Suspense>
        <MainContent />
      </Suspense>
    </>
  );
}
