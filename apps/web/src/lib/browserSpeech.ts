/**
 * Web Speech API (SpeechSynthesis) controller with synchronized word-level highlighting.
 *
 * Follows W3C / MDN SpeechSynthesisUtterance specification:
 * - Retains active utterance in an instance field to avoid Chromium V8 GC dropping events.
 * - Prefers local voices (localService === true) which emit native `boundary` word events.
 * - Filters `boundary` events by `event.name` (ignoring `"sentence"` boundaries) and handles
 *   missing/zero `event.charLength` via precomputed UTF-16 token offsets.
 * - Detaches event handlers before `speechSynthesis.cancel()` so prior `canceled` errors never
 *   clobber a newly started utterance.
 * - Automatically falls back to rate-calibrated word timing if a remote/cloud voice emits no
 *   native `boundary` event within 320ms of `onstart`.
 * - Splits long passages (> 240 chars) at sentence boundaries while keeping continuous word indices
 *   to avoid Chromium's ~15-second long-utterance cutoff.
 */

import { markdownToSpeechText } from "./markdownSpeech";

export interface SpeechWordToken {
  word: string;
  start: number;
  end: number;
}

interface SpeechChunk {
  text: string;
  wordStartIdx: number;
  tokens: SpeechWordToken[];
}

export interface BrowserSpeechCallbacks {
  onWordsReady?: (tokens: SpeechWordToken[]) => void;
  onWordChange?: (wordIndex: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
}

export interface BrowserSpeechOptions {
  text: string;
  lang?: string;
  rate?: number;
  preferredVoice?: SpeechSynthesisVoice | null;
  startWordIndex?: number;
  callbacks?: BrowserSpeechCallbacks;
}

const LANG_MAP: Record<string, string> = {
  en: "en-US",
  hi: "hi-IN",
  fr: "fr-FR",
  de: "de-DE",
  es: "es-ES",
  ja: "ja-JP",
};

export function resolveBcp47Lang(lang?: string): string {
  if (!lang) return "en-US";
  if (lang.includes("-")) return lang;
  return LANG_MAP[lang.toLowerCase()] || "en-US";
}

export function sanitizeSpeechText(raw: string): string {
  return markdownToSpeechText(raw);
}

/**
 * Tokenize text into non-whitespace word runs with exact UTF-16 [start, end) offsets
 * matching SpeechSynthesisEvent.charIndex.
 */
export function tokenizeSpeechWords(text: string): SpeechWordToken[] {
  const tokens: SpeechWordToken[] = [];
  const regex = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    tokens.push({
      word: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return tokens;
}

/**
 * Map a Web Speech API `boundary` event's `(charIndex, charLength)` to the corresponding token index.
 * Handles engines where `charLength` is 0 or undefined, or `charIndex` points just before a token.
 */
export function findWordIndexAtChar(
  tokens: SpeechWordToken[],
  charIndex: number,
  charLength?: number
): number {
  if (tokens.length === 0) return -1;
  const targetStart = Math.max(0, charIndex);
  const spanLen = charLength && charLength > 0 ? charLength : 0;

  let lo = 0;
  let hi = tokens.length - 1;
  let candidate = 0;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const tok = tokens[mid];
    if (tok.end <= targetStart) {
      candidate = Math.min(tokens.length - 1, mid + 1);
      lo = mid + 1;
    } else if (tok.start > targetStart + spanLen) {
      hi = mid - 1;
    } else {
      return mid;
    }
  }

  return candidate;
}

/**
 * Split long speech text into sentence-aligned chunks <= ~220 chars when > 240 chars so
 * Chromium remote/desktop voices never hit the ~15s silent cutoff, while keeping exact
 * word-index continuity across chunks.
 */
function buildSpeechChunks(
  tokens: SpeechWordToken[],
  startWordIndex: number
): SpeechChunk[] {
  const start = Math.max(0, Math.min(tokens.length, startWordIndex));
  if (start >= tokens.length) return [];

  const sliced = tokens.slice(start);
  const fullJoined = sliced.map((t) => t.word).join(" ");
  if (fullJoined.length <= 240) {
    return [
      {
        text: fullJoined,
        wordStartIdx: start,
        tokens: tokenizeSpeechWords(fullJoined),
      },
    ];
  }

  const chunks: SpeechChunk[] = [];
  let batchWords: string[] = [];
  let batchLen = 0;
  let batchStartWordIdx = start;

  const flushBatch = () => {
    if (batchWords.length === 0) return;
    const text = batchWords.join(" ");
    chunks.push({
      text,
      wordStartIdx: batchStartWordIdx,
      tokens: tokenizeSpeechWords(text),
    });
    batchStartWordIdx += batchWords.length;
    batchWords = [];
    batchLen = 0;
  };

  for (let i = 0; i < sliced.length; i++) {
    const w = sliced[i].word;
    const nextLen = batchLen === 0 ? w.length : batchLen + 1 + w.length;
    const endsSentence = /[.!?…;:\n]$/.test(w);

    if (batchWords.length > 0 && nextLen > 220) {
      flushBatch();
    }
    batchWords.push(w);
    batchLen = batchWords.length === 1 ? w.length : batchLen + 1 + w.length;

    if (endsSentence && batchLen >= 90) {
      flushBatch();
    }
  }
  flushBatch();
  return chunks;
}

/**
 * Prefer a local OS/SAPI/OneCore voice (`localService === true`) matching the target language
 * because native voices reliably emit SpeechSynthesisUtterance `boundary` events.
 */
export function selectBoundaryFriendlyVoice(
  langBcp47: string,
  preferredVoice?: SpeechSynthesisVoice | null
): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  if (preferredVoice && preferredVoice.localService !== false) {
    return preferredVoice;
  }

  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return preferredVoice ?? null;

  const targetLower = langBcp47.toLowerCase();
  const baseLang = targetLower.split("-")[0];

  return (
    voices.find((v) => v.localService && v.lang.toLowerCase() === targetLower) ||
    voices.find((v) => v.localService && v.lang.toLowerCase().startsWith(baseLang)) ||
    voices.find((v) => v.localService && v.default) ||
    preferredVoice ||
    voices.find((v) => v.lang.toLowerCase() === targetLower) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(baseLang)) ||
    null
  );
}

function estimateWordDurationMs(word: string, rate: number): number {
  const cleanLen = word.replace(/[^a-zA-Z0-9\u00C0-\u024F\u0900-\u097F\u3040-\u30FF]/g, "").length;
  let ms = 115 + cleanLen * 44;
  if (/[,;:]$/.test(word)) ms += 140;
  else if (/[.!?…]$/.test(word)) ms += 260;
  const clampedRate = Math.max(0.5, Math.min(2.5, rate || 1));
  return Math.max(110, Math.min(900, Math.round(ms / clampedRate)));
}

/**
 * Hard-cancels any active or queued speech in the browser's SpeechSynthesis engine.
 * Handles Chromium bug where cancel() is silently ignored if the engine is in a paused state.
 */
export function cancelAllBrowserSpeech(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    window.speechSynthesis.cancel();
  } catch {}
}

export class BrowserSpeechController {
  private sessionId = 0;
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private stepTimer: ReturnType<typeof setTimeout> | null = null;
  private paused = false;
  private resumeStepFn: (() => void) | null = null;
  private pendingFallbackFn: (() => void) | null = null;
  private activeOptions: BrowserSpeechOptions | null = null;
  private currentWordIdx = 0;
  private nativeBoundaryConfirmed = false;

  private clearTimers() {
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
    if (this.stepTimer) {
      clearTimeout(this.stepTimer);
      this.stepTimer = null;
    }
  }

  private detachActiveUtterance() {
    if (!this.activeUtterance) return;
    this.activeUtterance.onstart = null;
    this.activeUtterance.onboundary = null;
    this.activeUtterance.onend = null;
    this.activeUtterance.onerror = null;
    this.activeUtterance = null;
  }

  stop() {
    this.sessionId += 1;
    this.paused = false;
    this.resumeStepFn = null;
    this.pendingFallbackFn = null;
    this.activeOptions = null;
    this.currentWordIdx = 0;
    this.nativeBoundaryConfirmed = false;
    this.clearTimers();
    this.detachActiveUtterance();
    cancelAllBrowserSpeech();
  }

  pause() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    this.paused = true;
    this.clearTimers();
    if (!this.nativeBoundaryConfirmed && !this.resumeStepFn && this.pendingFallbackFn) {
      this.resumeStepFn = this.pendingFallbackFn;
    }
    try {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
      }
    } catch {}
  }

  resume() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    this.paused = false;
    const synth = window.speechSynthesis;
    try {
      if (synth.paused) {
        synth.resume();
      }
    } catch {}

    // Recover gracefully if browser speech engine silently dropped the paused utterance.
    if (!synth.speaking && !synth.paused && this.activeOptions) {
      const opts = this.activeOptions;
      const resumeIdx = this.currentWordIdx;
      this.speak({ ...opts, startWordIndex: resumeIdx });
      return;
    }

    if (this.resumeStepFn) {
      const fn = this.resumeStepFn;
      this.resumeStepFn = null;
      fn();
    }
  }

  speak(options: BrowserSpeechOptions) {
    const {
      text,
      lang,
      rate = 1.0,
      preferredVoice = null,
      startWordIndex = 0,
      callbacks,
    } = options;

    this.stop();

    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      callbacks?.onError?.();
      return;
    }

    this.activeOptions = options;
    this.currentWordIdx = Math.max(0, startWordIndex);

    const clean = sanitizeSpeechText(text);
    const allTokens = tokenizeSpeechWords(clean);
    if (allTokens.length === 0) {
      this.activeOptions = null;
      callbacks?.onWordsReady?.([]);
      callbacks?.onEnd?.();
      return;
    }

    callbacks?.onWordsReady?.(allTokens);

    const bcpLang = resolveBcp47Lang(lang);
    const voice = selectBoundaryFriendlyVoice(bcpLang, preferredVoice);
    const chunks = buildSpeechChunks(allTokens, startWordIndex);
    if (chunks.length === 0) {
      this.activeOptions = null;
      callbacks?.onEnd?.();
      return;
    }

    const currentSession = this.sessionId;
    let startedNotified = false;
    this.nativeBoundaryConfirmed = false;

    const speakChunk = (chunkIdx: number) => {
      if (currentSession !== this.sessionId) return;
      const chunk = chunks[chunkIdx];
      if (!chunk) {
        this.clearTimers();
        this.detachActiveUtterance();
        this.activeOptions = null;
        this.pendingFallbackFn = null;
        this.resumeStepFn = null;
        callbacks?.onWordChange?.(-1);
        callbacks?.onEnd?.();
        return;
      }

      this.clearTimers();
      this.resumeStepFn = null;
      this.pendingFallbackFn = null;

      const utterance = new SpeechSynthesisUtterance(chunk.text);
      utterance.lang = bcpLang;
      utterance.rate = rate;
      if (voice) {
        utterance.voice = voice;
      }
      // Retain strong reference on controller so Chromium V8 does not GC mid-speech
      this.activeUtterance = utterance;

      let localFallbackIdx = 0;

      const scheduleFallbackAdvance = () => {
        if (currentSession !== this.sessionId || this.nativeBoundaryConfirmed) return;
        if (this.paused) {
          this.resumeStepFn = scheduleFallbackAdvance;
          return;
        }
        const tok = chunk.tokens[localFallbackIdx];
        if (!tok) return;

        const wordIdx = chunk.wordStartIdx + localFallbackIdx;
        this.currentWordIdx = wordIdx;
        callbacks?.onWordChange?.(wordIdx);
        const waitMs = estimateWordDurationMs(tok.word, rate);
        localFallbackIdx += 1;

        if (localFallbackIdx < chunk.tokens.length) {
          this.pendingFallbackFn = scheduleFallbackAdvance;
          this.stepTimer = setTimeout(scheduleFallbackAdvance, waitMs);
        } else {
          this.pendingFallbackFn = null;
        }
      };

      utterance.onstart = () => {
        if (currentSession !== this.sessionId) return;
        if (!startedNotified) {
          startedNotified = true;
          callbacks?.onStart?.();
        }
        this.currentWordIdx = chunk.wordStartIdx;
        callbacks?.onWordChange?.(chunk.wordStartIdx);
        localFallbackIdx = 1;

        if (!this.nativeBoundaryConfirmed) {
          this.pendingFallbackFn = scheduleFallbackAdvance;
          const isRemoteVoice = voice !== null && voice.localService === false;
          if (isRemoteVoice) {
            const firstDur = estimateWordDurationMs(chunk.tokens[0]?.word || "", rate);
            this.stepTimer = setTimeout(scheduleFallbackAdvance, firstDur);
          } else {
            this.graceTimer = setTimeout(() => {
              if (currentSession === this.sessionId && !this.nativeBoundaryConfirmed) {
                scheduleFallbackAdvance();
              }
            }, 320);
          }
        }
      };

      utterance.onboundary = (event: SpeechSynthesisEvent) => {
        if (currentSession !== this.sessionId) return;
        // Official W3C spec: boundary event.name is "word" or "sentence" (some engines emit "").
        if (event.name && event.name !== "word") return;

        if (!this.nativeBoundaryConfirmed) {
          this.nativeBoundaryConfirmed = true;
          this.clearTimers();
          this.resumeStepFn = null;
          this.pendingFallbackFn = null;
        }

        const localWordIdx = findWordIndexAtChar(
          chunk.tokens,
          event.charIndex,
          event.charLength
        );
        if (localWordIdx >= 0) {
          const wordIdx = chunk.wordStartIdx + localWordIdx;
          this.currentWordIdx = wordIdx;
          callbacks?.onWordChange?.(wordIdx);
        }
      };

      utterance.onend = () => {
        if (currentSession !== this.sessionId) return;
        this.clearTimers();
        this.resumeStepFn = null;
        this.pendingFallbackFn = null;
        if (chunkIdx + 1 < chunks.length) {
          speakChunk(chunkIdx + 1);
        } else {
          this.activeUtterance = null;
          this.activeOptions = null;
          callbacks?.onWordChange?.(-1);
          callbacks?.onEnd?.();
        }
      };

      utterance.onerror = () => {
        if (currentSession !== this.sessionId) return;
        this.clearTimers();
        this.resumeStepFn = null;
        this.pendingFallbackFn = null;
        this.activeUtterance = null;
        this.activeOptions = null;
        callbacks?.onWordChange?.(-1);
        callbacks?.onError?.();
      };

      window.speechSynthesis.speak(utterance);
    };

    speakChunk(0);
  }
}

