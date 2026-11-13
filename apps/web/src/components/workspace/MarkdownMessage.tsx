"use client";

import React, { useMemo } from "react";
import katex from "katex";
import {
  isSafeMarkdownHref,
  parseMarkdownBlocks,
  splitTextWithWhitespace,
  type MarkdownBlockNode,
  type MarkdownInlineNode,
} from "@/lib/markdownSpeech";

export interface MarkdownWordSyncConfig {
  /** Maps each visual prose word index [0..M-1] -> speech token index [0..K-1], or -1 */
  visualToSpeechIdx: number[];
  /** Currently active speech word index while playing (-1 when idle/paused-none) */
  activeSpeechIndex: number;
  /** Threshold below which words count as already spoken (past) */
  pastBeforeSpeechIndex: number;
  /** Color for yet-to-be-spoken words during active dictation */
  futureColor?: string;
  /** Optional per-speech-token tooltip titles */
  speechTitles?: string[];
  /** Optional click handler to seek playback to a spoken word index */
  onSeekSpeechIndex?: (speechIdx: number) => void;
  /** When defined (Listening Mode progressive reveal), hide prose words beyond this speech index */
  revealMaxSpeechIndex?: number;
}

export interface MarkdownCitationItem {
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

export interface MarkdownMessageProps {
  text: string;
  fontSize?: string;
  lineHeight?: string;
  textColor?: string;
  rootRef?: React.RefObject<HTMLDivElement | null>;
  wordSync?: MarkdownWordSyncConfig;
  citations?: MarkdownCitationItem[];
  onCitationClick?: (citation: MarkdownCitationItem) => void;
}

interface IndexedPiece {
  text: string;
  visualWordIndex: number | null;
}

type IndexedInline =
  | { type: "text"; pieces: IndexedPiece[] }
  | { type: "strong"; children: IndexedInline[] }
  | { type: "em"; children: IndexedInline[] }
  | { type: "strike"; children: IndexedInline[] }
  | { type: "code"; pieces: IndexedPiece[] }
  | { type: "link"; pieces: IndexedPiece[]; href: string }
  | { type: "citation"; numbers: number[]; raw: string; revealAfterWordIdx: number }
  | { type: "math"; value: string; display: boolean; revealAfterWordIdx: number }
  | { type: "sub"; children: IndexedInline[] }
  | { type: "sup"; children: IndexedInline[] }
  | { type: "audio_cue"; cue: string; revealAfterWordIdx: number };

type IndexedBlock =
  | { type: "heading"; level: 1 | 2 | 3 | 4; inlines: IndexedInline[]; minWordIdx: number }
  | { type: "paragraph"; inlines: IndexedInline[]; minWordIdx: number }
  | {
      type: "list";
      ordered: boolean;
      items: Array<{
        marker: string;
        depth: number;
        inlines: IndexedInline[];
        minWordIdx: number;
      }>;
      minWordIdx: number;
    }
  | {
      type: "blockquote";
      lines: Array<{ inlines: IndexedInline[]; minWordIdx: number }>;
      minWordIdx: number;
    }
  | { type: "code"; language: string; code: string; minWordIdx: number }
  | {
      type: "table";
      headers: IndexedInline[][];
      rows: IndexedInline[][][];
      minWordIdx: number;
    }
  | { type: "hr"; minWordIdx: number };

function indexTextPieces(
  rawText: string,
  counter: { next: number }
): { pieces: IndexedPiece[]; firstIdx: number } {
  let firstIdx = Number.MAX_SAFE_INTEGER;
  const pieces = splitTextWithWhitespace(rawText).map((p) => {
    if (!p.isWord) {
      return { text: p.text, visualWordIndex: null };
    }
    const assigned = counter.next++;
    if (firstIdx === Number.MAX_SAFE_INTEGER) firstIdx = assigned;
    return { text: p.text, visualWordIndex: assigned };
  });
  return { pieces, firstIdx };
}

function indexInlines(
  inlines: MarkdownInlineNode[],
  counter: { next: number }
): { nodes: IndexedInline[]; minWordIdx: number } {
  let minWordIdx = Number.MAX_SAFE_INTEGER;
  const nodes: IndexedInline[] = inlines.map((node) => {
    if (node.type === "text") {
      const { pieces, firstIdx } = indexTextPieces(node.value, counter);
      minWordIdx = Math.min(minWordIdx, firstIdx);
      return { type: "text", pieces };
    }
    if (node.type === "code") {
      const { pieces, firstIdx } = indexTextPieces(node.value, counter);
      minWordIdx = Math.min(minWordIdx, firstIdx);
      return { type: "code", pieces };
    }
    if (node.type === "link") {
      const { pieces, firstIdx } = indexTextPieces(node.label, counter);
      minWordIdx = Math.min(minWordIdx, firstIdx);
      return { type: "link", pieces, href: node.href };
    }
    if (node.type === "citation") {
      const revealAfterWordIdx = counter.next > 0 ? counter.next - 1 : -1;
      return {
        type: "citation",
        numbers: node.numbers,
        raw: node.raw,
        revealAfterWordIdx,
      };
    }
    if (node.type === "math") {
      const revealAfterWordIdx = counter.next > 0 ? counter.next - 1 : -1;
      // Count math as a single visual word for sync
      counter.next++;
      minWordIdx = Math.min(minWordIdx, counter.next - 1);
      return { type: "math", value: node.value, display: node.display, revealAfterWordIdx };
    }
    if (node.type === "audio_cue") {
      const revealAfterWordIdx = counter.next > 0 ? counter.next - 1 : -1;
      return { type: "audio_cue", cue: node.cue, revealAfterWordIdx };
    }
    if (node.type === "sub") {
      const nested = indexInlines(node.children, counter);
      minWordIdx = Math.min(minWordIdx, nested.minWordIdx);
      return { type: "sub", children: nested.nodes };
    }
    if (node.type === "sup") {
      const nested = indexInlines(node.children, counter);
      minWordIdx = Math.min(minWordIdx, nested.minWordIdx);
      return { type: "sup", children: nested.nodes };
    }
    const nested = indexInlines(node.children, counter);
    minWordIdx = Math.min(minWordIdx, nested.minWordIdx);
    return { type: node.type, children: nested.nodes };
  });
  return { nodes, minWordIdx };
}

function indexBlocks(blocks: MarkdownBlockNode[]): IndexedBlock[] {
  const counter = { next: 0 };
  return blocks.map((block): IndexedBlock => {
    if (block.type === "heading") {
      const { nodes, minWordIdx } = indexInlines(block.inlines, counter);
      return { type: "heading", level: block.level, inlines: nodes, minWordIdx };
    }
    if (block.type === "paragraph") {
      const { nodes, minWordIdx } = indexInlines(block.inlines, counter);
      return { type: "paragraph", inlines: nodes, minWordIdx };
    }
    if (block.type === "blockquote") {
      let minWordIdx = Number.MAX_SAFE_INTEGER;
      const lines = block.lines.map((line) => {
        const res = indexInlines(line, counter);
        minWordIdx = Math.min(minWordIdx, res.minWordIdx);
        return { inlines: res.nodes, minWordIdx: res.minWordIdx };
      });
      return { type: "blockquote", lines, minWordIdx };
    }
    if (block.type === "list") {
      let minWordIdx = Number.MAX_SAFE_INTEGER;
      const items = block.items.map((item) => {
        const res = indexInlines(item.inlines, counter);
        minWordIdx = Math.min(minWordIdx, res.minWordIdx);
        return {
          marker: item.marker,
          depth: item.depth,
          inlines: res.nodes,
          minWordIdx: res.minWordIdx,
        };
      });
      return { type: "list", ordered: block.ordered, items, minWordIdx };
    }
    if (block.type === "table") {
      let minWordIdx = Number.MAX_SAFE_INTEGER;
      const headers = block.headers.map((cell) => {
        const res = indexInlines(cell, counter);
        minWordIdx = Math.min(minWordIdx, res.minWordIdx);
        return res.nodes;
      });
      const rows = block.rows.map((row) =>
        row.map((cell) => {
          const res = indexInlines(cell, counter);
          minWordIdx = Math.min(minWordIdx, res.minWordIdx);
          return res.nodes;
        })
      );
      return { type: "table", headers, rows, minWordIdx };
    }
    const anchor = counter.next > 0 ? counter.next - 1 : 0;
    if (block.type === "code") {
      return { type: "code", language: block.language, code: block.code, minWordIdx: anchor };
    }
    return { type: "hr", minWordIdx: anchor };
  });
}

function isBlockVisibleInProgressive(
  minWordIdx: number,
  wordSync?: MarkdownWordSyncConfig
): boolean {
  if (
    !wordSync ||
    wordSync.revealMaxSpeechIndex === undefined ||
    minWordIdx === Number.MAX_SAFE_INTEGER
  ) {
    return true;
  }
  const speechIdx = wordSync.visualToSpeechIdx[minWordIdx];
  if (speechIdx === undefined || speechIdx < 0) {
    return minWordIdx <= wordSync.revealMaxSpeechIndex;
  }
  return speechIdx <= wordSync.revealMaxSpeechIndex;
}

function renderPieces(
  pieces: IndexedPiece[],
  keyPrefix: string,
  baseTextColor: string,
  wordSync?: MarkdownWordSyncConfig
): React.ReactNode {
  if (!wordSync) {
    return pieces.map((p) => p.text).join("");
  }

  const futureColor = wordSync.futureColor ?? "rgba(148, 163, 184, 0.72)";

  return pieces.map((p, idx) => {
    if (p.visualWordIndex === null) {
      if (wordSync.revealMaxSpeechIndex !== undefined) {
        const nextWord = pieces.slice(idx + 1).find((x) => x.visualWordIndex !== null);
        if (nextWord && nextWord.visualWordIndex !== null) {
          const nextSpeech = wordSync.visualToSpeechIdx[nextWord.visualWordIndex];
          if (
            nextSpeech !== undefined &&
            nextSpeech >= 0 &&
            nextSpeech > wordSync.revealMaxSpeechIndex
          ) {
            return null;
          }
        }
      }
      return <React.Fragment key={`${keyPrefix}-ws-${idx}`}>{p.text}</React.Fragment>;
    }

    const speechIdx = wordSync.visualToSpeechIdx[p.visualWordIndex] ?? -1;
    if (
      wordSync.revealMaxSpeechIndex !== undefined &&
      speechIdx > wordSync.revealMaxSpeechIndex
    ) {
      return null;
    }

    const isCurrent = speechIdx >= 0 && speechIdx === wordSync.activeSpeechIndex;
    const isPast = speechIdx >= 0 && speechIdx < wordSync.pastBeforeSpeechIndex;
    const canSeek = Boolean(wordSync.onSeekSpeechIndex && speechIdx >= 0);
    const title =
      speechIdx >= 0 && wordSync.speechTitles ? wordSync.speechTitles[speechIdx] : undefined;

    return (
      <span
        key={`${keyPrefix}-w-${p.visualWordIndex}`}
        data-active-word={isCurrent ? "true" : undefined}
        onClick={
          canSeek
            ? (e) => {
                e.stopPropagation();
                wordSync.onSeekSpeechIndex?.(speechIdx);
              }
            : undefined
        }
        title={title}
        style={{
          display: "inline-block",
          padding: "0 2px",
          borderRadius: "4px",
          cursor: canSeek ? "pointer" : "inherit",
          transition:
            "background-color 0.08s ease, color 0.08s ease, border-color 0.08s ease",
          backgroundColor: isCurrent ? "rgba(0, 245, 212, 0.22)" : "transparent",
          color: isCurrent ? "#00f5d4" : isPast ? baseTextColor : futureColor,
          textShadow: isCurrent ? "0 0 12px rgba(0, 245, 212, 0.9)" : "none",
          outline: isCurrent ? "1px solid rgba(0, 245, 212, 0.45)" : "none",
        }}
      >
        {p.text}
      </span>
    );
  });
}

interface CitationRenderContext {
  citations?: MarkdownCitationItem[];
  onCitationClick?: (citation: MarkdownCitationItem) => void;
}

function findMatchingCitation(
  citations: MarkdownCitationItem[] | undefined,
  num: number
): MarkdownCitationItem | undefined {
  if (!citations || citations.length === 0) return undefined;
  return citations.find((c, idx) => (c.number ?? idx + 1) === num) ?? citations[num - 1];
}

function renderIndexedInlines(
  inlines: IndexedInline[],
  keyPrefix: string,
  baseTextColor: string,
  wordSync?: MarkdownWordSyncConfig,
  citationCtx?: CitationRenderContext
): React.ReactNode {
  return inlines.map((node, i) => {
    const key = `${keyPrefix}-in-${i}`;
    if (node.type === "text") {
      return (
        <React.Fragment key={key}>
          {renderPieces(node.pieces, key, baseTextColor, wordSync)}
        </React.Fragment>
      );
    }
    if (node.type === "strong") {
      return (
        <strong key={key} style={{ fontWeight: 650, color: "#ffffff" }}>
          {renderIndexedInlines(node.children, key, "#ffffff", wordSync, citationCtx)}
        </strong>
      );
    }
    if (node.type === "em") {
      return (
        <em key={key} style={{ fontStyle: "italic", color: "#cbd5e1" }}>
          {renderIndexedInlines(node.children, key, "#cbd5e1", wordSync, citationCtx)}
        </em>
      );
    }
    if (node.type === "strike") {
      return (
        <del key={key} style={{ opacity: 0.72 }}>
          {renderIndexedInlines(node.children, key, baseTextColor, wordSync, citationCtx)}
        </del>
      );
    }
    if (node.type === "code") {
      return (
        <code
          key={key}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.9em",
            padding: "1px 5px",
            borderRadius: "4px",
            background: "rgba(0, 245, 212, 0.1)",
            border: "1px solid rgba(0, 245, 212, 0.22)",
            color: "#5eead4",
          }}
        >
          {renderPieces(node.pieces, key, "#5eead4", wordSync)}
        </code>
      );
    }
    if (node.type === "link") {
      if (isSafeMarkdownHref(node.href)) {
        return (
          <a
            key={key}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              color: "#00f5d4",
              textDecoration: "underline",
              textUnderlineOffset: "2px",
            }}
          >
            {renderPieces(node.pieces, key, "#00f5d4", wordSync)}
          </a>
        );
      }
      return (
        <span key={key}>{renderPieces(node.pieces, key, baseTextColor, wordSync)}</span>
      );
    }
    if (node.type === "citation") {
      if (wordSync?.revealMaxSpeechIndex !== undefined && node.revealAfterWordIdx >= 0) {
        const anchorSpeech = wordSync.visualToSpeechIdx[node.revealAfterWordIdx];
        if (
          anchorSpeech !== undefined &&
          anchorSpeech >= 0 &&
          anchorSpeech > wordSync.revealMaxSpeechIndex
        ) {
          return null;
        }
      }
      return (
        <React.Fragment key={key}>
          {node.numbers.map((num, nIdx) => {
            const matched = findMatchingCitation(citationCtx?.citations, num);
            const isWeb = Boolean(matched?.url || matched?.source === "web");
            const canClick = Boolean(matched && citationCtx?.onCitationClick);
            const tooltip = matched
              ? matched.url
                ? `[${num}] Web source: ${matched.label}${matched.snippet ? ` — ${matched.snippet}` : ""}`
                : `[${num}] PDF Page ${matched.page ?? 1}: ${matched.label}${matched.snippet ? ` — ${matched.snippet}` : ""}`
              : `[${num}]`;
            return (
              <sub
                key={`${key}-n-${nIdx}`}
                data-citation-subscript="true"
                style={{
                  fontSize: "0.74em",
                  lineHeight: 0,
                  verticalAlign: "sub",
                  marginLeft: "2px",
                  marginRight: "1px",
                }}
              >
                {canClick && matched ? (
                  <button
                    type="button"
                    data-citation-number={num}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      citationCtx?.onCitationClick?.(matched);
                    }}
                    title={tooltip}
                    aria-label={`Citation ${num}: ${matched.label}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "0 4px",
                      borderRadius: "4px",
                      border: isWeb
                        ? "1px solid rgba(45, 212, 191, 0.5)"
                        : "1px solid rgba(0, 245, 212, 0.45)",
                      background: isWeb
                        ? "rgba(13, 148, 136, 0.22)"
                        : "rgba(0, 245, 212, 0.14)",
                      color: isWeb ? "#5eead4" : "#00f5d4",
                      fontFamily: "var(--font-mono)",
                      fontSize: "inherit",
                      fontWeight: 650,
                      lineHeight: "1.35",
                      cursor: "pointer",
                      verticalAlign: "baseline",
                    }}
                  >
                    [{num}]
                  </button>
                ) : (
                  <span
                    title={tooltip}
                    style={{
                      display: "inline-block",
                      padding: "0 3px",
                      borderRadius: "4px",
                      color: matched ? (isWeb ? "#5eead4" : "#00f5d4") : "#94a3b8",
                      fontFamily: "var(--font-mono)",
                      fontSize: "inherit",
                      fontWeight: 600,
                      lineHeight: "1.35",
                    }}
                  >
                    [{num}]
                  </span>
                )}
              </sub>
            );
          })}
        </React.Fragment>
      );
    }
    if (node.type === "math") {
      try {
        const html = katex.renderToString(node.value, {
          displayMode: node.display,
          throwOnError: false,
          output: "html",
        });
        return (
          <span
            key={key}
            style={node.display ? { display: "block", textAlign: "center", margin: "8px 0" } : { display: "inline" }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      } catch {
        return <code key={key} style={{ color: "#94a3b8" }}>{node.value}</code>;
      }
    }
    if (node.type === "sub") {
      return (
        <sub key={key} style={{ fontSize: "0.78em", verticalAlign: "sub", fontFamily: "var(--font-mono)" }}>
          {renderIndexedInlines(node.children, key, baseTextColor, wordSync, citationCtx)}
        </sub>
      );
    }
    if (node.type === "sup") {
      return (
        <sup key={key} style={{ fontSize: "0.78em", verticalAlign: "super", fontFamily: "var(--font-mono)" }}>
          {renderIndexedInlines(node.children, key, baseTextColor, wordSync, citationCtx)}
        </sup>
      );
    }
    if (node.type === "audio_cue") {
      return (
        <span
          key={key}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "3px",
            fontSize: "9px",
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
            color: "#5eead4",
            background: "rgba(0, 245, 212, 0.12)",
            border: "1px solid rgba(0, 245, 212, 0.35)",
            borderRadius: "10px",
            padding: "1px 6px",
            margin: "0 2px",
            verticalAlign: "middle",
          }}
        >
          🎭 {node.cue}
        </span>
      );
    }
    return null;
  });
}

export function MarkdownMessage({
  text,
  fontSize = "13px",
  lineHeight = "1.6",
  textColor = "#f0fdfa",
  rootRef,
  wordSync,
  citations,
  onCitationClick,
}: MarkdownMessageProps) {
  const indexedBlocks = useMemo(() => indexBlocks(parseMarkdownBlocks(text)), [text]);
  const citationCtx: CitationRenderContext = { citations, onCitationClick };

  return (
    <div
      ref={rootRef}
      style={{
        fontSize,
        lineHeight,
        color: textColor,
        display: "flex",
        flexDirection: "column",
        gap: "7px",
        wordBreak: "break-word",
      }}
    >
      {indexedBlocks.map((block, bIdx) => {
        if (!isBlockVisibleInProgressive(block.minWordIdx, wordSync)) {
          return null;
        }

        if (block.type === "hr") {
          return (
            <hr
              key={`b-${bIdx}`}
              style={{
                border: "none",
                borderTop: "1px solid rgba(0, 245, 212, 0.18)",
                margin: "3px 0",
              }}
            />
          );
        }

        if (block.type === "heading") {
          const sizes: Record<number, string> = {
            1: "14.5px",
            2: "13.5px",
            3: "13px",
            4: "12.5px",
          };
          return (
            <div
              key={`b-${bIdx}`}
              role="heading"
              aria-level={block.level}
              style={{
                fontSize: sizes[block.level] || "13px",
                fontWeight: 700,
                color: "#5eead4",
                letterSpacing: "0.01em",
                marginTop: bIdx > 0 ? "3px" : 0,
              }}
            >
              {renderIndexedInlines(block.inlines, `h-${bIdx}`, "#5eead4", wordSync, citationCtx)}
            </div>
          );
        }

        if (block.type === "paragraph") {
          return (
            <p key={`b-${bIdx}`} style={{ margin: 0 }}>
              {renderIndexedInlines(block.inlines, `p-${bIdx}`, textColor, wordSync, citationCtx)}
            </p>
          );
        }

        if (block.type === "blockquote") {
          return (
            <blockquote
              key={`b-${bIdx}`}
              style={{
                margin: "2px 0",
                padding: "4px 10px",
                borderLeft: "2px solid rgba(0, 245, 212, 0.55)",
                background: "rgba(0, 245, 212, 0.05)",
                borderRadius: "0 6px 6px 0",
                color: "#cbd5e1",
                display: "flex",
                flexDirection: "column",
                gap: "3px",
              }}
            >
              {block.lines.map((line, lIdx) =>
                isBlockVisibleInProgressive(line.minWordIdx, wordSync) ? (
                  <div key={`bq-${bIdx}-${lIdx}`}>
                    {renderIndexedInlines(
                      line.inlines,
                      `bq-${bIdx}-${lIdx}`,
                      "#cbd5e1",
                      wordSync,
                      citationCtx
                    )}
                  </div>
                ) : null
              )}
            </blockquote>
          );
        }

        if (block.type === "list") {
          return (
            <div
              key={`b-${bIdx}`}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                margin: "1px 0",
              }}
            >
              {block.items.map((item, iIdx) => {
                if (!isBlockVisibleInProgressive(item.minWordIdx, wordSync)) {
                  return null;
                }
                return (
                  <div
                    key={`li-${bIdx}-${iIdx}`}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "7px",
                      paddingLeft: `${item.depth * 14}px`,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        color: "#00f5d4",
                        fontWeight: 600,
                        fontFamily: block.ordered ? "var(--font-mono)" : "inherit",
                        fontSize: block.ordered ? "11.5px" : "13px",
                        flexShrink: 0,
                        lineHeight,
                        userSelect: "none",
                      }}
                    >
                      {block.ordered ? item.marker : "•"}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {renderIndexedInlines(
                        item.inlines,
                        `li-${bIdx}-${iIdx}`,
                        textColor,
                        wordSync,
                        citationCtx
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        }

        if (block.type === "code") {
          return (
            <pre
              key={`b-${bIdx}`}
              style={{
                margin: "2px 0",
                padding: "8px 10px",
                borderRadius: "7px",
                background: "rgba(2, 6, 12, 0.85)",
                border: "1px solid rgba(0, 245, 212, 0.22)",
                overflowX: "auto",
                fontSize: "11.5px",
                lineHeight: "1.45",
                fontFamily: "var(--font-mono)",
                color: "#a7f3d0",
              }}
            >
              <code>{block.code}</code>
            </pre>
          );
        }

        if (block.type === "table") {
          return (
            <div
              key={`b-${bIdx}`}
              style={{
                overflowX: "auto",
                borderRadius: "7px",
                border: "1px solid rgba(0, 245, 212, 0.22)",
                background: "rgba(2, 6, 12, 0.55)",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "11.5px",
                  lineHeight: "1.45",
                }}
              >
                <thead>
                  <tr style={{ background: "rgba(0, 245, 212, 0.09)" }}>
                    {block.headers.map((hCell, hIdx) => (
                      <th
                        key={`th-${bIdx}-${hIdx}`}
                        style={{
                          textAlign: "left",
                          padding: "5px 8px",
                          color: "#5eead4",
                          fontWeight: 650,
                          borderBottom: "1px solid rgba(0, 245, 212, 0.22)",
                        }}
                      >
                        {renderIndexedInlines(
                          hCell,
                          `th-${bIdx}-${hIdx}`,
                          "#5eead4",
                          wordSync,
                          citationCtx
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rIdx) => (
                    <tr
                      key={`tr-${bIdx}-${rIdx}`}
                      style={{
                        borderTop:
                          rIdx > 0 ? "1px solid rgba(255, 255, 255, 0.06)" : "none",
                      }}
                    >
                      {row.map((cell, cIdx) => (
                        <td
                          key={`td-${bIdx}-${rIdx}-${cIdx}`}
                          style={{
                            padding: "5px 8px",
                            color: textColor,
                            verticalAlign: "top",
                          }}
                        >
                          {renderIndexedInlines(
                            cell,
                            `td-${bIdx}-${rIdx}-${cIdx}`,
                            textColor,
                            wordSync,
                            citationCtx
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

