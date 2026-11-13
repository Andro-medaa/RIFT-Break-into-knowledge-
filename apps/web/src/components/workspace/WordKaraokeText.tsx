/**
 * Shared word-by-word karaoke highlighter for both ElevenLabs timed playback
 * and Web Speech API (`SpeechSynthesisUtterance`) word-boundary/fallback playback.
 */
"use client";

import React, { useEffect, useMemo, useRef } from "react";
import type { WordTimestamp } from "@/lib/api";
import type { SpeechWordToken } from "@/lib/browserSpeech";
import {
  alignMarkdownTokensToSpeech,
  extractVisualProseWords,
  parseMarkdownBlocks,
} from "@/lib/markdownSpeech";
import { MarkdownMessage, type MarkdownCitationItem } from "./MarkdownMessage";

export interface WordKaraokeTextProps {
  text: string;
  /** Timed words from ElevenLabs alignment */
  wordsTimeline?: WordTimestamp[];
  currentTime?: number;
  /** Tokenized words + active word index from Browser Web Speech API */
  browserWords?: SpeechWordToken[];
  activeWordIndex?: number;
  isActive?: boolean;
  isPlaying?: boolean;
  fontSize?: string;
  lineHeight?: string;
  inactiveColor?: string;
  onSeekTime?: (sec: number) => void;
  onSeekWordIndex?: (wordIndex: number) => void;
  /** Optional scrollable container that auto-pages down when spoken words pass the visible bottom fold */
  autoPageContainerRef?: React.RefObject<HTMLElement | null>;
  /** Render Markdown formatting synchronized with spoken word highlights (used by RAG responses) */
  enableMarkdown?: boolean;
  /** Source metadata used to render clickable subscript [N] citations when enableMarkdown is true */
  citations?: MarkdownCitationItem[];
  onCitationClick?: (citation: MarkdownCitationItem) => void;
}

export interface AutoPageScrollParams {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  containerTop: number;
  wordTop: number;
  wordHeight: number;
  pendingTargetScrollTop: number | null;
  pendingUntilMs: number;
  nowMs: number;
  wasInView: boolean;
  isFirstWord?: boolean;
  bottomThresholdPx?: number;
  topPaddingPx?: number;
}

export interface AutoPageScrollResult {
  shouldScroll: boolean;
  targetScrollTop: number | null;
  inView: boolean;
}

/**
 * Decide whether the scrollable container should page down smoothly after dictation
 * advances beyond the bottom of the currently visible page content.
 */
export function computeNextPageScrollTop({
  scrollTop,
  clientHeight,
  scrollHeight,
  containerTop,
  wordTop,
  wordHeight,
  pendingTargetScrollTop,
  pendingUntilMs,
  nowMs,
  wasInView,
  isFirstWord = false,
  bottomThresholdPx = 14,
  topPaddingPx = 20,
}: AutoPageScrollParams): AutoPageScrollResult {
  if (clientHeight <= 0 || scrollHeight <= clientHeight) {
    return { shouldScroll: false, targetScrollTop: null, inView: true };
  }

  const isAnimatingToPending =
    pendingTargetScrollTop !== null &&
    nowMs < pendingUntilMs &&
    Math.abs(scrollTop - pendingTargetScrollTop) > 4;

  const effectiveScrollTop = isAnimatingToPending ? pendingTargetScrollTop! : scrollTop;
  const effectiveBottom = effectiveScrollTop + clientHeight;

  const wordContentTop = scrollTop + (wordTop - containerTop);
  const wordContentBottom = wordContentTop + wordHeight;

  // On the first word, only consider it out of bounds if strictly clipped past the viewport edge
  // so clicking Play on a visible message never shifts the scroll position.
  const triggerBottom = isFirstWord
    ? effectiveBottom
    : effectiveBottom - bottomThresholdPx;

  if (wordContentTop >= effectiveScrollTop && wordContentBottom <= triggerBottom) {
    return { shouldScroll: false, targetScrollTop: null, inView: true };
  }

  const isFirstWordPartiallyVisibleAtBottom =
    isFirstWord &&
    wordContentTop >= effectiveScrollTop &&
    wordContentTop < effectiveBottom;

  if (wordContentBottom > triggerBottom) {
    if (wasInView || isFirstWordPartiallyVisibleAtBottom) {
      const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
      const desired = Math.min(
        maxScrollTop,
        Math.max(0, Math.round(wordContentTop - topPaddingPx))
      );
      if (desired > scrollTop + 2) {
        return { shouldScroll: true, targetScrollTop: desired, inView: true };
      }
      return { shouldScroll: false, targetScrollTop: null, inView: true };
    }
  }

  return { shouldScroll: false, targetScrollTop: null, inView: false };
}

/**
 * Resolve the actual scrollable container, preferring `preferred` when it overflows
 * vertically and falling back to the nearest overflowing scroll ancestor if needed.
 */
export function findScrollableContainer(preferred: HTMLElement | null): HTMLElement | null {
  if (!preferred) return null;
  if (preferred.scrollHeight > preferred.clientHeight + 2) {
    return preferred;
  }

  let curr: HTMLElement | null = preferred.parentElement;
  while (curr) {
    if (curr.scrollHeight > curr.clientHeight + 2) {
      const overflowY =
        typeof window !== "undefined" && typeof window.getComputedStyle === "function"
          ? window.getComputedStyle(curr).overflowY
          : curr.style?.overflowY;
      if (overflowY === "auto" || overflowY === "scroll") {
        return curr;
      }
    }
    curr = curr.parentElement;
  }

  return preferred;
}

/**
 * Smoothly advance a scrollable container to the next page of content when dictated words
 * pass below the currently visible viewport fold. Yields immediately without stopping
 * dictation if the user scrolls manually, and cleanly re-enables on Play/Resume or new response.
 */
export function useAutoPageScroll({
  wordRootRef,
  activeWordSelector = '[data-active-word="true"]',
  autoPageContainerRef,
  isActive,
  isPlaying,
  activeRenderIdx,
  resetKey,
}: {
  wordRootRef: React.RefObject<HTMLElement | null>;
  activeWordSelector?: string;
  autoPageContainerRef?: React.RefObject<HTMLElement | null>;
  isActive: boolean;
  isPlaying: boolean;
  activeRenderIdx: number;
  resetKey?: string | number;
}) {
  const wasInViewRef = useRef<boolean>(false);
  const userInterruptedRef = useRef<boolean>(false);
  const pendingScrollRef = useRef<{ targetTop: number; untilMs: number }>({
    targetTop: 0,
    untilMs: 0,
  });
  const programmaticScrollRef = useRef<{
    startTop: number;
    lastObservedTop: number;
    targetTop: number;
    untilMs: number;
  } | null>(null);
  const lastContainerScrollTopRef = useRef<number>(0);
  const allowUnattributedScrollAfterMsRef = useRef<number>(0);
  const prevSessionRef = useRef<{
    isActive: boolean;
    isPlaying: boolean;
    resetKey: string | number | undefined;
  }>({
    isActive: false,
    isPlaying: false,
    resetKey,
  });

  useEffect(() => {
    const prev = prevSessionRef.current;
    const becameActive = !prev.isActive && isActive;
    const resumedPlay = !prev.isPlaying && isPlaying;
    const sessionReset = prev.resetKey !== resetKey;
    prevSessionRef.current = { isActive, isPlaying, resetKey };

    if (!isActive) {
      wasInViewRef.current = false;
      userInterruptedRef.current = false;
      pendingScrollRef.current = { targetTop: 0, untilMs: 0 };
      programmaticScrollRef.current = null;
      return;
    }

    if (becameActive || resumedPlay || sessionReset) {
      // Re-enable auto-scroll on Play/Resume or response change without forcing an immediate jump.
      userInterruptedRef.current = false;
      wasInViewRef.current = false;
      pendingScrollRef.current = { targetTop: 0, untilMs: 0 };
      programmaticScrollRef.current = null;
      allowUnattributedScrollAfterMsRef.current =
        Date.now() + (becameActive || sessionReset ? 750 : 250);
    }

    const container = findScrollableContainer(autoPageContainerRef?.current ?? null);
    if (!container || typeof container.addEventListener !== "function") return;

    lastContainerScrollTopRef.current = container.scrollTop;
    let scrollbarPointerDown = false;

    const interruptFromUser = () => {
      userInterruptedRef.current = true;
      pendingScrollRef.current = { targetTop: 0, untilMs: 0 };
      programmaticScrollRef.current = null;
    };

    const onWheel = () => interruptFromUser();
    const onTouchMove = () => interruptFromUser();

    const onPointerDown = (e: Event) => {
      const pe = e as PointerEvent;
      if (typeof container.getBoundingClientRect !== "function") return;
      const rect = container.getBoundingClientRect();
      if (
        typeof pe.clientX === "number" &&
        pe.clientX >= rect.right - 20 &&
        pe.clientX <= rect.right
      ) {
        scrollbarPointerDown = true;
      }
    };

    const onPointerEnd = () => {
      scrollbarPointerDown = false;
    };

    const onKeyDown = (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.metaKey || ke.ctrlKey || ke.altKey) return;
      const key = ke.key;
      if (
        key !== "ArrowUp" &&
        key !== "ArrowDown" &&
        key !== "PageUp" &&
        key !== "PageDown" &&
        key !== "Home" &&
        key !== "End" &&
        key !== " "
      ) {
        return;
      }
      const target = ke.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable ||
        (key === " " && (tag === "BUTTON" || tag === "A"))
      ) {
        return;
      }
      if (
        typeof document !== "undefined" &&
        target &&
        target !== container &&
        target !== document.body &&
        target !== document.documentElement &&
        typeof container.contains === "function" &&
        !container.contains(target)
      ) {
        return;
      }
      interruptFromUser();
    };

    const onScroll = () => {
      const currTop = container.scrollTop;
      const nowMs = Date.now();

      if (scrollbarPointerDown) {
        interruptFromUser();
        lastContainerScrollTopRef.current = currTop;
        return;
      }

      const prog = programmaticScrollRef.current;
      if (prog && nowMs < prog.untilMs) {
        const movedOpposite = currTop < prog.lastObservedTop - 2;
        const overshotTarget = currTop > prog.targetTop + 4;
        const beforeStart = currTop < prog.startTop - 4;
        if (movedOpposite || overshotTarget || beforeStart) {
          interruptFromUser();
        } else {
          prog.lastObservedTop = currTop;
          if (Math.abs(currTop - prog.targetTop) <= 2) {
            prog.untilMs = Math.min(prog.untilMs, nowMs + 120);
          }
        }
        lastContainerScrollTopRef.current = currTop;
        return;
      }

      programmaticScrollRef.current = null;
      if (
        nowMs > allowUnattributedScrollAfterMsRef.current &&
        Math.abs(currTop - lastContainerScrollTopRef.current) > 2
      ) {
        interruptFromUser();
      }
      lastContainerScrollTopRef.current = currTop;
    };

    container.addEventListener("wheel", onWheel, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: true });
    container.addEventListener("pointerdown", onPointerDown, { passive: true });
    container.addEventListener("scroll", onScroll, { passive: true });
    const hasWindowListeners =
      typeof window !== "undefined" &&
      typeof window.addEventListener === "function" &&
      typeof window.removeEventListener === "function";
    if (hasWindowListeners) {
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("pointerup", onPointerEnd);
      window.addEventListener("pointercancel", onPointerEnd);
    }

    return () => {
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("scroll", onScroll);
      if (hasWindowListeners) {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("pointerup", onPointerEnd);
        window.removeEventListener("pointercancel", onPointerEnd);
      }
    };
  }, [isActive, isPlaying, autoPageContainerRef, resetKey]);

  useEffect(() => {
    if (!isActive || !isPlaying || userInterruptedRef.current) return;
    if (activeRenderIdx < 0) return;

    const runCheck = () => {
      if (userInterruptedRef.current) return;

      const container = findScrollableContainer(autoPageContainerRef?.current ?? null);
      const wordEl =
        wordRootRef.current?.querySelector<HTMLElement>(activeWordSelector) ?? null;
      if (!container || !wordEl) return;

      const containerRect = container.getBoundingClientRect();
      const wordRect = wordEl.getBoundingClientRect();
      const nowMs = Date.now();

      const result = computeNextPageScrollTop({
        scrollTop: container.scrollTop,
        clientHeight: container.clientHeight,
        scrollHeight: container.scrollHeight,
        containerTop: containerRect.top,
        wordTop: wordRect.top,
        wordHeight: wordRect.height,
        pendingTargetScrollTop:
          pendingScrollRef.current.untilMs > 0 ? pendingScrollRef.current.targetTop : null,
        pendingUntilMs: pendingScrollRef.current.untilMs,
        nowMs,
        wasInView: wasInViewRef.current,
        isFirstWord: activeRenderIdx === 0,
      });

      wasInViewRef.current = result.inView;

      if (result.shouldScroll && result.targetScrollTop !== null) {
        const startTop = container.scrollTop;
        pendingScrollRef.current = {
          targetTop: result.targetScrollTop,
          untilMs: nowMs + 700,
        };
        programmaticScrollRef.current = {
          startTop,
          lastObservedTop: startTop,
          targetTop: result.targetScrollTop,
          untilMs: nowMs + 750,
        };
        if (typeof container.scrollTo === "function") {
          container.scrollTo({ top: result.targetScrollTop, behavior: "smooth" });
        } else {
          container.scrollTop = result.targetScrollTop;
          lastContainerScrollTopRef.current = container.scrollTop;
        }
      }
    };

    if (
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function" &&
      typeof window.cancelAnimationFrame === "function"
    ) {
      const rafId = window.requestAnimationFrame(runCheck);
      return () => window.cancelAnimationFrame(rafId);
    }

    runCheck();
  }, [
    activeRenderIdx,
    isActive,
    isPlaying,
    autoPageContainerRef,
    wordRootRef,
    activeWordSelector,
    resetKey,
  ]);
}

interface RenderableWord {
  key: string;
  word: string;
  isCurrent: boolean;
  isPast: boolean;
  title?: string;
  onClick?: () => void;
}

export function WordKaraokeText({
  text,
  wordsTimeline,
  currentTime = 0,
  browserWords,
  activeWordIndex = -1,
  isActive = true,
  isPlaying = true,
  fontSize = "13.5px",
  lineHeight = "1.75",
  inactiveColor = "rgba(203, 213, 225, 0.6)",
  onSeekTime,
  onSeekWordIndex,
  autoPageContainerRef,
  enableMarkdown = false,
  citations,
  onCitationClick,
}: WordKaraokeTextProps) {
  const wordRootRef = useRef<HTMLDivElement | null>(null);

  const visualWords = useMemo(
    () => (enableMarkdown ? extractVisualProseWords(parseMarkdownBlocks(text)) : []),
    [enableMarkdown, text]
  );

  let renderWords: RenderableWord[] | null = null;

  if (isActive && wordsTimeline && wordsTimeline.length > 0) {
    renderWords = wordsTimeline.map((item, idx) => {
      const isCurrent = isPlaying && currentTime >= item.start && currentTime <= item.end + 0.05;
      return {
        key: `${item.word}-${idx}`,
        word: item.word,
        isCurrent,
        isPast: currentTime > item.end,
        title: onSeekTime ? `At ${item.start.toFixed(2)}s - click to play` : undefined,
        onClick: onSeekTime ? () => onSeekTime(item.start) : undefined,
      };
    });
  } else if (isActive && browserWords && browserWords.length > 0) {
    renderWords = browserWords.map((tok, idx) => {
      const isCurrent = activeWordIndex >= 0 && idx === activeWordIndex;
      return {
        key: `${tok.word}-${tok.start}-${idx}`,
        word: tok.word,
        isCurrent,
        isPast: activeWordIndex >= 0 && idx < activeWordIndex,
        title: onSeekWordIndex ? "Click to read from this word" : undefined,
        onClick: onSeekWordIndex ? () => onSeekWordIndex(idx) : undefined,
      };
    });
  }

  const activeRenderIdx = renderWords ? renderWords.findIndex((w) => w.isCurrent) : -1;

  useAutoPageScroll({
    wordRootRef,
    autoPageContainerRef,
    isActive,
    isPlaying,
    activeRenderIdx,
    resetKey: text,
  });

  if (renderWords) {
    if (enableMarkdown && visualWords.length > 0) {
      const speechStrings = renderWords.map((w) => w.word);
      const visualToSpeechIdx = alignMarkdownTokensToSpeech(visualWords, speechStrings);
      const firstUnspoken = renderWords.findIndex((w) => !w.isPast);
      const pastBeforeSpeechIndex =
        firstUnspoken === -1 ? renderWords.length : firstUnspoken;
      const speechTitles = renderWords.map((w) => w.title || "");

      return (
        <MarkdownMessage
          rootRef={wordRootRef}
          text={text}
          fontSize={fontSize}
          lineHeight={lineHeight}
          textColor="#f0fdfa"
          citations={citations}
          onCitationClick={onCitationClick}
          wordSync={{
            visualToSpeechIdx,
            activeSpeechIndex: activeRenderIdx,
            pastBeforeSpeechIndex,
            futureColor: "rgba(148, 163, 184, 0.68)",
            speechTitles,
            onSeekSpeechIndex: (speechIdx) => renderWords?.[speechIdx]?.onClick?.(),
          }}
        />
      );
    }

    return (
      <div ref={wordRootRef} style={{ lineHeight, fontSize }}>
        {renderWords.map((item) => (
          <span
            key={item.key}
            data-active-word={item.isCurrent ? "true" : undefined}
            onClick={
              item.onClick
                ? (e) => {
                    e.stopPropagation();
                    item.onClick?.();
                  }
                : undefined
            }
            style={{
              display: "inline-block",
              padding: "1px 3px",
              margin: "0 1px",
              borderRadius: "4px",
              cursor: item.onClick ? "pointer" : "default",
              transition:
                "background-color 0.08s ease, color 0.08s ease, border-color 0.08s ease, transform 0.08s ease",
              backgroundColor: item.isCurrent ? "rgba(0, 245, 212, 0.22)" : "transparent",
              color: item.isCurrent
                ? "#00f5d4"
                : item.isPast
                ? "#f0fdfa"
                : "rgba(148, 163, 184, 0.68)",
              fontWeight: item.isCurrent ? 600 : 400,
              textShadow: item.isCurrent ? "0 0 12px rgba(0, 245, 212, 0.9)" : "none",
              transform: item.isCurrent ? "scale(1.04)" : "scale(1)",
              border: item.isCurrent
                ? "1px solid rgba(0, 245, 212, 0.5)"
                : "1px solid transparent",
            }}
            title={item.title}
          >
            {item.word}{" "}
          </span>
        ))}
      </div>
    );
  }

  if (enableMarkdown) {
    return (
      <MarkdownMessage
        rootRef={wordRootRef}
        text={text}
        fontSize={fontSize}
        lineHeight={lineHeight}
        textColor={isActive ? "#f1f5f9" : inactiveColor}
        citations={citations}
        onCitationClick={onCitationClick}
      />
    );
  }

  return (
    <div style={{ lineHeight, fontSize, color: isActive ? "#f1f5f9" : inactiveColor }}>
      {text}
    </div>
  );
}
