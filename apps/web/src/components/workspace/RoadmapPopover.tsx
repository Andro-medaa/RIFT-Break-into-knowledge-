"use client";

import { useMemo, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Compass,
  Check,
  ChevronRight,
  BookOpen,
  Sparkles,
  Layers,
  FileText,
} from "lucide-react";
import { useWorkspace } from "@/lib/workspace";

export interface RoadmapChapter {
  id: string;
  index: number;
  title: string;
  page: number;
  firstParagraphId?: string;
  chunkId?: string;
  segmentCount: number;
  status: "covered" | "current" | "upcoming";
  previewText?: string;
}

export default function RoadmapPopover() {
  const {
    paragraphs,
    scriptSegments,
    activeParagraphId,
    currentPage,
    navigateToParagraph,
    setCurrentPage,
  } = useWorkspace();

  const [isOpen, setIsOpen] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear hover timer
  const clearTimer = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

  // Hover handlers with 180ms grace delay to avoid jitter
  const handleMouseEnter = useCallback(() => {
    clearTimer();
    setIsOpen(true);
  }, [clearTimer]);

  const handleMouseLeave = useCallback(() => {
    clearTimer();
    hoverTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 180);
  }, [clearTimer]);

  const handleToggleClick = useCallback(() => {
    clearTimer();
    setIsOpen((prev) => !prev);
  }, [clearTimer]);

  /* ── Intelligent Chapter & Progress Extraction ─────────────────────────── */
  const { chapters, coveragePct, coveredCount, currentChapterTitle } = useMemo(() => {
    const rawChapters: {
      id: string;
      title: string;
      page: number;
      firstParagraphId?: string;
      chunkId?: string;
      segmentCount: number;
      previewText?: string;
      segmentIndices: number[];
    }[] = [];

    // Approach A: Derive from AI Script Segments (highest quality headings)
    if (scriptSegments && scriptSegments.length > 0) {
      let currentGroup: typeof rawChapters[0] | null = null;
      let chapterIdx = 1;

      scriptSegments.forEach((seg, idx) => {
        const explicitHeading = seg.chapter_heading?.trim();
        const needsNewGroup =
          !currentGroup ||
          (explicitHeading &&
            explicitHeading.toLowerCase() !== currentGroup.title.toLowerCase());

        if (needsNewGroup) {
          if (currentGroup) {
            rawChapters.push(currentGroup);
          }
          const titleToUse =
            explicitHeading ||
            (chapterIdx === 1 ? "1. Introduction & Overview" : `Chapter ${chapterIdx}`);

          currentGroup = {
            id: `ch-script-${chapterIdx}`,
            title: titleToUse,
            page: seg.page_number || 1,
            firstParagraphId: seg.chunk_id || seg.id,
            chunkId: seg.chunk_id,
            segmentCount: 1,
            previewText: seg.text,
            segmentIndices: [idx],
          };
          chapterIdx++;
        } else if (currentGroup) {
          currentGroup.segmentCount += 1;
          currentGroup.segmentIndices.push(idx);
        }
      });

      if (currentGroup) {
        rawChapters.push(currentGroup);
      }
    }

    // Approach B: Fallback from extracted paragraphs / document chunks
    if (rawChapters.length === 0 && paragraphs && paragraphs.length > 0) {
      let currentGroup: typeof rawChapters[0] | null = null;
      let chIdx = 1;

      paragraphs.forEach((p, idx) => {
        const text = p.text.trim();
        const page = p.bbox?.page ?? 1;

        // Detect heading: Chapter ..., Section ..., numbered prefixes, or short capitalized lines
        const isExplicitHeading =
          /^(chapter|section|part|unit|module)\s+[0-9ivxlcdm]+/i.test(text) ||
          /^[0-9]{1,2}\.\s+[A-Z]/.test(text) ||
          (text.length < 65 &&
            !text.endsWith(".") &&
            (text === text.toUpperCase() || /^[A-Z]/.test(text)) &&
            idx % 5 === 0);

        const pageChange = currentGroup && currentGroup.page !== page && text.length < 80;

        if (!currentGroup || isExplicitHeading || pageChange) {
          if (currentGroup) {
            rawChapters.push(currentGroup);
          }
          const cleanTitle =
            text.length < 70
              ? text.replace(/^[#*\s]+/, "").trim()
              : `Section ${chIdx}: Page ${page}`;

          currentGroup = {
            id: `ch-para-${chIdx}`,
            title: cleanTitle,
            page,
            firstParagraphId: p.id,
            chunkId: p.id,
            segmentCount: 1,
            previewText: text,
            segmentIndices: [idx],
          };
          chIdx++;
        } else if (currentGroup) {
          currentGroup.segmentCount += 1;
          currentGroup.segmentIndices.push(idx);
        }
      });

      if (currentGroup) {
        rawChapters.push(currentGroup);
      }
    }

    // Fallback C: If only 1 or 0 chapters found, split by pages
    if (rawChapters.length <= 1 && paragraphs.length > 0) {
      rawChapters.length = 0;
      const pageMap = new Map<number, typeof paragraphs>();
      paragraphs.forEach((p) => {
        const pg = p.bbox?.page ?? 1;
        if (!pageMap.has(pg)) pageMap.set(pg, []);
        pageMap.get(pg)!.push(p);
      });

      Array.from(pageMap.entries()).forEach(([pg, pList], i) => {
        const first = pList[0];
        const preview = first.text.length < 60 ? first.text : first.text.slice(0, 55) + "…";
        rawChapters.push({
          id: `ch-page-${pg}`,
          title: `Page ${pg}: ${preview}`,
          page: pg,
          firstParagraphId: first.id,
          chunkId: first.id,
          segmentCount: pList.length,
          previewText: first.text,
          segmentIndices: [i],
        });
      });
    }

    // Determine Status (covered | current | upcoming) for each chapter
    let currentActiveIdx = -1;
    if (activeParagraphId) {
      if (scriptSegments && scriptSegments.length > 0) {
        currentActiveIdx = scriptSegments.findIndex(
          (s) => s.chunk_id === activeParagraphId || s.id === activeParagraphId
        );
      }
      if (currentActiveIdx === -1 && paragraphs.length > 0) {
        currentActiveIdx = paragraphs.findIndex((p) => p.id === activeParagraphId);
      }
    }

    let activeChapterTitle: string | null = null;
    let covered = 0;

    const enrichedChapters: RoadmapChapter[] = rawChapters.map((ch, idx) => {
      let status: "covered" | "current" | "upcoming" = "upcoming";

      if (currentActiveIdx >= 0) {
        const minIdx = Math.min(...ch.segmentIndices);
        const maxIdx = Math.max(...ch.segmentIndices);

        if (currentActiveIdx > maxIdx) {
          status = "covered";
          covered++;
        } else if (currentActiveIdx >= minIdx && currentActiveIdx <= maxIdx) {
          status = "current";
          activeChapterTitle = ch.title;
        } else {
          status = "upcoming";
        }
      } else {
        // Fallback by page number if no active paragraph is selected yet
        if (ch.page < currentPage) {
          status = "covered";
          covered++;
        } else if (ch.page === currentPage && !activeChapterTitle) {
          status = "current";
          activeChapterTitle = ch.title;
        } else {
          status = "upcoming";
        }
      }

      return {
        id: ch.id,
        index: idx + 1,
        title: ch.title,
        page: ch.page,
        firstParagraphId: ch.firstParagraphId,
        chunkId: ch.chunkId,
        segmentCount: ch.segmentCount,
        status,
        previewText: ch.previewText,
      };
    });

    const total = enrichedChapters.length;
    const hasCurrent = enrichedChapters.some((c) => c.status === "current");
    const pct = total > 0 ? Math.min(100, Math.round(((covered + (hasCurrent ? 0.5 : 0)) / total) * 100)) : 0;

    return {
      chapters: enrichedChapters,
      coveragePct: pct,
      coveredCount: covered,
      currentChapterTitle: activeChapterTitle || enrichedChapters[0]?.title || "Overview",
    };
  }, [scriptSegments, paragraphs, activeParagraphId, currentPage]);

  /* ── Jump directly to a selected chapter ───────────────────────────────── */
  const handleJumpToChapter = useCallback(
    (ch: RoadmapChapter) => {
      if (ch.firstParagraphId) {
        navigateToParagraph(ch.firstParagraphId);
      } else if (ch.page) {
        setCurrentPage(ch.page);
      }
    },
    [navigateToParagraph, setCurrentPage]
  );

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* ── ROADMAP Trigger Pill ── */}
      <button
        onClick={handleToggleClick}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "7px",
          padding: "4px 10px",
          borderRadius: "8px",
          cursor: "pointer",
          border: isOpen
            ? "1px solid rgba(0, 245, 212, 0.65)"
            : "1px solid rgba(0, 245, 212, 0.25)",
          background: isOpen
            ? "linear-gradient(135deg, rgba(0, 245, 212, 0.18), rgba(13, 148, 136, 0.28))"
            : "rgba(3, 12, 18, 0.75)",
          boxShadow: isOpen
            ? "0 0 16px rgba(0, 245, 212, 0.35), 0 2px 10px rgba(0, 0, 0, 0.5)"
            : "0 2px 8px rgba(0, 0, 0, 0.4)",
          transition: "all 0.2s ease",
        }}
        title="View document roadmap & covered chapters (Hover or click to open)"
      >
        <Compass
          size={13}
          style={{
            color: "#00f5d4",
            transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
            transition: "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />

        <span
          style={{
            fontSize: "10px",
            fontWeight: 700,
            fontFamily: "var(--font-mono)",
            color: "#67e8f9",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          ROADMAP
        </span>

        {/* Mini progress track */}
        <div
          style={{
            width: "60px",
            height: "4px",
            borderRadius: "2px",
            background: "rgba(255, 255, 255, 0.1)",
            overflow: "hidden",
            margin: "0 2px",
          }}
        >
          <div
            style={{
              width: `${coveragePct}%`,
              height: "100%",
              background: "linear-gradient(90deg, #00f5d4, #10b981)",
              borderRadius: "2px",
              boxShadow: "0 0 6px rgba(0, 245, 212, 0.6)",
              transition: "width 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          />
        </div>

        <span
          style={{
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
            color: "#10b981",
          }}
        >
          {coveragePct}%
        </span>
      </button>

      {/* ── Chapters Flyout Box in Style ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{
              position: "absolute",
              top: "calc(100% + 9px)",
              right: 0,
              width: "360px",
              maxHeight: "460px",
              background: "rgba(2, 8, 14, 0.97)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              borderRadius: "14px",
              border: "1px solid rgba(0, 245, 212, 0.35)",
              boxShadow:
                "0 20px 60px rgba(0, 0, 0, 0.95), 0 0 25px rgba(0, 245, 212, 0.18)",
              zIndex: 9999,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Popover Header */}
            <div
              style={{
                padding: "12px 14px 10px 14px",
                borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                background: "rgba(0, 245, 212, 0.04)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Sparkles size={13} color="#00f5d4" />
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      fontFamily: "var(--font-mono)",
                      color: "#f0fdfa",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    Document Roadmap
                  </span>
                </div>

                <span
                  style={{
                    fontSize: "10px",
                    fontFamily: "var(--font-mono)",
                    color: "#5eead4",
                    background: "rgba(0, 245, 212, 0.12)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    border: "1px solid rgba(0, 245, 212, 0.25)",
                  }}
                >
                  {coveredCount} of {chapters.length} covered
                </span>
              </div>

              {/* Progress bar with glow */}
              <div
                style={{
                  width: "100%",
                  height: "5px",
                  borderRadius: "3px",
                  background: "rgba(255, 255, 255, 0.08)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${coveragePct}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, #00f5d4 0%, #10b981 100%)",
                    borderRadius: "3px",
                    boxShadow: "0 0 10px rgba(0, 245, 212, 0.7)",
                    transition: "width 0.35s ease",
                  }}
                />
              </div>

              {/* Current Active Chapter Banner */}
              {currentChapterTitle && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    marginTop: "8px",
                    fontSize: "10px",
                    color: "#94a3b8",
                  }}
                >
                  <span style={{ color: "#00f5d4", fontWeight: 600 }}>Active:</span>
                  <span
                    style={{
                      color: "#f0fdfa",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: "270px",
                    }}
                  >
                    {currentChapterTitle}
                  </span>
                </div>
              )}
            </div>

            {/* Chapters List */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "8px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                maxHeight: "310px",
              }}
            >
              {chapters.length === 0 ? (
                <div
                  style={{
                    padding: "24px",
                    textAlign: "center",
                    color: "#64748b",
                    fontSize: "11px",
                  }}
                >
                  Extracting sections and roadmap…
                </div>
              ) : (
                chapters.map((ch) => {
                  const isCovered = ch.status === "covered";
                  const isCurrent = ch.status === "current";

                  return (
                    <div
                      key={ch.id}
                      onClick={() => handleJumpToChapter(ch)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "7px 9px",
                        borderRadius: "8px",
                        cursor: "pointer",
                        background: isCurrent
                          ? "linear-gradient(135deg, rgba(0, 245, 212, 0.16), rgba(13, 148, 136, 0.14))"
                          : isCovered
                          ? "rgba(16, 185, 129, 0.05)"
                          : "rgba(255, 255, 255, 0.02)",
                        border: isCurrent
                          ? "1px solid rgba(0, 245, 212, 0.55)"
                          : isCovered
                          ? "1px solid rgba(16, 185, 129, 0.25)"
                          : "1px solid rgba(255, 255, 255, 0.05)",
                        boxShadow: isCurrent
                          ? "0 0 14px rgba(0, 245, 212, 0.2)"
                          : "none",
                        transition: "all 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        if (!isCurrent) {
                          e.currentTarget.style.background = "rgba(0, 245, 212, 0.09)";
                          e.currentTarget.style.borderColor = "rgba(0, 245, 212, 0.4)";
                          e.currentTarget.style.transform = "translateX(3px)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isCurrent) {
                          e.currentTarget.style.background = isCovered
                            ? "rgba(16, 185, 129, 0.05)"
                            : "rgba(255, 255, 255, 0.02)";
                          e.currentTarget.style.borderColor = isCovered
                            ? "1px solid rgba(16, 185, 129, 0.25)"
                            : "rgba(255, 255, 255, 0.05)";
                          e.currentTarget.style.transform = "none";
                        }
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          overflow: "hidden",
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        {/* Status Icon */}
                        {isCovered ? (
                          <div
                            style={{
                              width: "16px",
                              height: "16px",
                              borderRadius: "50%",
                              background: "rgba(16, 185, 129, 0.2)",
                              border: "1px solid #10b981",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                            title="Covered"
                          >
                            <Check size={9} color="#10b981" />
                          </div>
                        ) : isCurrent ? (
                          <div
                            style={{
                              width: "16px",
                              height: "16px",
                              borderRadius: "50%",
                              background: "rgba(0, 245, 212, 0.25)",
                              border: "1.5px solid #00f5d4",
                              boxShadow: "0 0 10px rgba(0, 245, 212, 0.8)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                            title="Currently reading"
                          >
                            <div
                              style={{
                                width: "6px",
                                height: "6px",
                                borderRadius: "50%",
                                background: "#00f5d4",
                              }}
                            />
                          </div>
                        ) : (
                          <div
                            style={{
                              width: "16px",
                              height: "16px",
                              borderRadius: "50%",
                              border: "1px solid rgba(100, 116, 139, 0.4)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                            title="Upcoming"
                          >
                            <span style={{ fontSize: "8px", color: "#64748b" }}>
                              {ch.index}
                            </span>
                          </div>
                        )}

                        {/* Title and Page number */}
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            overflow: "hidden",
                            minWidth: 0,
                          }}
                        >
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: isCurrent ? 700 : isCovered ? 600 : 500,
                              color: isCurrent
                                ? "#00f5d4"
                                : isCovered
                                ? "#e2e8f0"
                                : "#94a3b8",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={ch.title}
                          >
                            {ch.title}
                          </span>

                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              marginTop: "1px",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "9px",
                                fontFamily: "var(--font-mono)",
                                color: isCurrent ? "#5eead4" : "#64748b",
                              }}
                            >
                              Page {ch.page}
                            </span>
                            <span style={{ fontSize: "8px", color: "#475569" }}>•</span>
                            <span
                              style={{
                                fontSize: "9px",
                                fontFamily: "var(--font-mono)",
                                color: "#64748b",
                              }}
                            >
                              {ch.segmentCount} {ch.segmentCount === 1 ? "unit" : "units"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right jump arrow */}
                      <ChevronRight
                        size={12}
                        style={{
                          color: isCurrent ? "#00f5d4" : "#64748b",
                          flexShrink: 0,
                          marginLeft: "6px",
                          opacity: 0.8,
                        }}
                      />
                    </div>
                  );
                })
              )}
            </div>

            {/* Popover Footer */}
            <div
              style={{
                padding: "8px 12px",
                borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                background: "rgba(0, 0, 0, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "9px",
                fontFamily: "var(--font-mono)",
                color: "#64748b",
              }}
            >
              <span>Click section to jump</span>
              <span style={{ color: "#00f5d4" }}>Hover off to close</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
