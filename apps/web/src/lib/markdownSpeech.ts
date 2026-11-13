/**
 * Voice-safe Markdown parser, speech sanitizer, and spoken-token aligner.
 *
 * Ensures rich Markdown RAG responses render cleanly on screen while speaking
 * natural, symbol-free prose in both ElevenLabs AI Voice and Browser SpeechSynthesis,
 * with accurate word-level karaoke alignment.
 */

export type MarkdownInlineNode =
  | { type: "text"; value: string }
  | { type: "strong"; children: MarkdownInlineNode[] }
  | { type: "em"; children: MarkdownInlineNode[] }
  | { type: "strike"; children: MarkdownInlineNode[] }
  | { type: "code"; value: string }
  | { type: "link"; label: string; href: string }
  | { type: "citation"; numbers: number[]; raw: string }
  | { type: "math"; value: string; display: boolean }
  | { type: "sub"; children: MarkdownInlineNode[] }
  | { type: "sup"; children: MarkdownInlineNode[] }
  | { type: "audio_cue"; cue: string };

export type MarkdownBlockNode =
  | { type: "heading"; level: 1 | 2 | 3 | 4; inlines: MarkdownInlineNode[] }
  | { type: "paragraph"; inlines: MarkdownInlineNode[] }
  | {
      type: "list";
      ordered: boolean;
      items: Array<{ marker: string; depth: number; inlines: MarkdownInlineNode[] }>;
    }
  | { type: "blockquote"; lines: MarkdownInlineNode[][] }
  | { type: "code"; language: string; code: string }
  | { type: "table"; headers: MarkdownInlineNode[][]; rows: MarkdownInlineNode[][][] }
  | { type: "hr" };

export function isSafeMarkdownHref(href: string): boolean {
  const trimmed = href.trim().toLowerCase();
  if (!trimmed) return false;
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return true;
  return (
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("mailto:")
  );
}

/**
 * Parse inline Markdown spans (bold, italic, inline code, links, strikethrough)
 * without breaking underscores inside identifiers like `snake_case_name`.
 */
export function parseInlineMarkdown(text: string): MarkdownInlineNode[] {
  const nodes: MarkdownInlineNode[] = [];
  let idx = 0;

  const pushText = (val: string) => {
    if (!val) return;
    const prev = nodes[nodes.length - 1];
    if (prev && prev.type === "text") {
      prev.value += val;
    } else {
      nodes.push({ type: "text", value: val });
    }
  };

  while (idx < text.length) {
    // Escaped punctuation (\* \_ \` \[ \])
    if (text[idx] === "\\" && idx + 1 < text.length && /[*_`[\]()~#>-]/.test(text[idx + 1])) {
      pushText(text[idx + 1]);
      idx += 2;
      continue;
    }

    // Display math: $$...$$
    if (text.startsWith("$$", idx)) {
      const end = text.indexOf("$$", idx + 2);
      if (end > idx + 2) {
        nodes.push({ type: "math", value: text.slice(idx + 2, end), display: true });
        idx = end + 2;
        continue;
      }
    }

    // Inline math: $...$ (not $$, not prices like $100)
    if (text[idx] === "$" && text[idx + 1] !== "$" && idx + 1 < text.length) {
      const end = text.indexOf("$", idx + 1);
      if (end > idx + 1) {
        const content = text.slice(idx + 1, end);
        // Skip if it looks like a price (starts with digit) or is empty
        if (content.trim() && !/^\d/.test(content.trim())) {
          nodes.push({ type: "math", value: content, display: false });
          idx = end + 1;
          continue;
        }
      }
    }

    // Audio cue tags: [laughs], [sighs], [excited], [whispers], [gasps], [pauses]
    if (text[idx] === "[") {
      const cueMatch = /^\[(laughs|sighs|excited|whispers|gasps|pauses)\]/i.exec(text.slice(idx));
      if (cueMatch) {
        nodes.push({ type: "audio_cue", cue: cueMatch[1].toLowerCase() });
        idx += cueMatch[0].length;
        continue;
      }
    }

    // HTML subscript: <sub>...</sub>
    if (text.startsWith("<sub>", idx)) {
      const end = text.indexOf("</sub>", idx + 5);
      if (end > idx + 5) {
        nodes.push({ type: "sub", children: parseInlineMarkdown(text.slice(idx + 5, end)) });
        idx = end + 6;
        continue;
      }
    }

    // HTML superscript: <sup>...</sup>
    if (text.startsWith("<sup>", idx)) {
      const end = text.indexOf("</sup>", idx + 5);
      if (end > idx + 5) {
        nodes.push({ type: "sup", children: parseInlineMarkdown(text.slice(idx + 5, end)) });
        idx = end + 6;
        continue;
      }
    }

    // Superscript: ^...^ (single caret pair)
    if (text[idx] === "^" && idx + 1 < text.length && text[idx + 1] !== " ") {
      const end = text.indexOf("^", idx + 1);
      if (end > idx + 1 && end - idx < 30) {
        nodes.push({ type: "sup", children: parseInlineMarkdown(text.slice(idx + 1, end)) });
        idx = end + 1;
        continue;
      }
    }

    // Inline code: `...`
    if (text[idx] === "`") {
      const end = text.indexOf("`", idx + 1);
      if (end > idx + 1) {
        nodes.push({ type: "code", value: text.slice(idx + 1, end) });
        idx = end + 1;
        continue;
      }
    }

    // Markdown image ![alt](url) -> keep clean alt text as plain prose
    if (text[idx] === "!" && text[idx + 1] === "[") {
      const closeBracket = text.indexOf("]", idx + 2);
      if (closeBracket !== -1 && text[closeBracket + 1] === "(") {
        const closeParen = text.indexOf(")", closeBracket + 2);
        if (closeParen !== -1) {
          const alt = text.slice(idx + 2, closeBracket).trim();
          if (alt) pushText(alt);
          idx = closeParen + 1;
          continue;
        }
      }
    }

    // Markdown link [label](url)
    if (text[idx] === "[") {
      const closeBracket = text.indexOf("]", idx + 1);
      if (closeBracket > idx + 1 && text[closeBracket + 1] === "(") {
        const closeParen = text.indexOf(")", closeBracket + 2);
        if (closeParen !== -1) {
          const label = text.slice(idx + 1, closeBracket);
          const href = text.slice(closeBracket + 2, closeParen).trim();
          nodes.push({ type: "link", label, href });
          idx = closeParen + 1;
          continue;
        }
      }

      // Numeric citation marker [1] or [1, 2] (outside links/code)
      const citMatch = /^\[\s*(\d+(?:\s*,\s*\d+)*)\s*\](?!\()/.exec(text.slice(idx));
      if (citMatch) {
        const numbers = citMatch[1]
          .split(",")
          .map((part) => parseInt(part.trim(), 10))
          .filter((n) => Number.isFinite(n) && n > 0);
        if (numbers.length > 0) {
          nodes.push({ type: "citation", numbers, raw: citMatch[0] });
          idx += citMatch[0].length;
          continue;
        }
      }
    }

    // Strong: **...** or __...__
    if (
      (text.startsWith("**", idx) || text.startsWith("__", idx)) &&
      idx + 2 < text.length &&
      text[idx + 2] !== " "
    ) {
      const delim = text.slice(idx, idx + 2);
      const end = text.indexOf(delim, idx + 2);
      if (end > idx + 2 && text[end - 1] !== " ") {
        nodes.push({
          type: "strong",
          children: parseInlineMarkdown(text.slice(idx + 2, end)),
        });
        idx = end + 2;
        continue;
      }
    }

    // Subscript: ~...~ (single tilde, not ~~ strikethrough)
    if (text[idx] === "~" && text[idx + 1] !== "~" && idx + 1 < text.length && text[idx + 1] !== " ") {
      const end = text.indexOf("~", idx + 1);
      if (end > idx + 1 && text[end + 1] !== "~" && end - idx < 30) {
        nodes.push({ type: "sub", children: parseInlineMarkdown(text.slice(idx + 1, end)) });
        idx = end + 1;
        continue;
      }
    }

    // Strikethrough: ~~...~~
    if (text.startsWith("~~", idx) && idx + 2 < text.length && text[idx + 2] !== " ") {
      const end = text.indexOf("~~", idx + 2);
      if (end > idx + 2) {
        nodes.push({
          type: "strike",
          children: parseInlineMarkdown(text.slice(idx + 2, end)),
        });
        idx = end + 2;
        continue;
      }
    }

    // Italic: *...* or boundary-safe _..._
    if (text[idx] === "*" && idx + 1 < text.length && text[idx + 1] !== " " && text[idx + 1] !== "*") {
      const end = text.indexOf("*", idx + 1);
      if (end > idx + 1 && text[end - 1] !== " ") {
        nodes.push({
          type: "em",
          children: parseInlineMarkdown(text.slice(idx + 1, end)),
        });
        idx = end + 1;
        continue;
      }
    }

    if (
      text[idx] === "_" &&
      idx + 1 < text.length &&
      text[idx + 1] !== " " &&
      text[idx + 1] !== "_" &&
      (idx === 0 || !/[a-zA-Z0-9]/.test(text[idx - 1]))
    ) {
      let searchFrom = idx + 1;
      let matchedEnd = -1;
      while (searchFrom < text.length) {
        const candidate = text.indexOf("_", searchFrom);
        if (candidate === -1) break;
        const after = text[candidate + 1];
        if (text[candidate - 1] !== " " && (!after || !/[a-zA-Z0-9]/.test(after))) {
          matchedEnd = candidate;
          break;
        }
        searchFrom = candidate + 1;
      }
      if (matchedEnd > idx + 1) {
        nodes.push({
          type: "em",
          children: parseInlineMarkdown(text.slice(idx + 1, matchedEnd)),
        });
        idx = matchedEnd + 1;
        continue;
      }
    }

    pushText(text[idx]);
    idx += 1;
  }

  return nodes;
}

function splitTableRowCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isTableSeparatorLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  const cells = splitTableRowCells(trimmed);
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell));
}

function stripCitationMarkers(text: string): string {
  return text
    .replace(/\s*\[\s*\d+(?:\s*,\s*\d+)*\s*\](?!\()/g, (full, offset: number, src: string) => {
      const beforeChar = offset > 0 ? src[offset - 1] : "";
      const afterChar = src[offset + full.length] || "";
      if (beforeChar && !/\s/.test(beforeChar) && afterChar && /[a-zA-Z0-9]/.test(afterChar)) {
        return " ";
      }
      if (/^\s/.test(full) && afterChar && !/[\s.,!?;:)\]]/.test(afterChar)) {
        return " ";
      }
      return "";
    })
    .replace(/§[^\n]+/g, "");
}

function inlinesToPlainText(inlines: MarkdownInlineNode[]): string {
  let out = "";
  for (let i = 0; i < inlines.length; i++) {
    const node = inlines[i];
    if (node.type === "citation") {
      // Ignored during speech/dictation; avoid gluing adjacent words if brackets touched both sides
      const lastChar = out[out.length - 1] || "";
      const nextNode = inlines[i + 1];
      const nextText =
        nextNode?.type === "text" || nextNode?.type === "code"
          ? nextNode.value
          : nextNode?.type === "link"
          ? nextNode.label
          : "";
      const firstNext = nextText[0] || "";
      if (lastChar && /[a-zA-Z0-9%]/.test(lastChar) && firstNext && /[a-zA-Z0-9]/.test(firstNext)) {
        out += " ";
      }
      continue;
    }
    if (node.type === "text" || node.type === "code") {
      out += node.value;
    } else if (node.type === "link") {
      out += node.label;
    } else if (node.type === "math") {
      out += mathExprToSpeech(node.value);
    } else if (node.type === "audio_cue") {
      // Skip audio cues in plain text extraction for speech
      continue;
    } else if (node.type === "sub" || node.type === "sup") {
      out += inlinesToPlainText(node.children);
    } else {
      out += inlinesToPlainText(node.children);
    }
  }
  return out;
}

function ensureSentencePause(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (/[.!?…:;]$/.test(trimmed)) return trimmed;
  return `${trimmed}.`;
}

function shortenBareUrls(text: string): string {
  return text.replace(/https?:\/\/[^\s)]+/g, (url) => {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, "");
    } catch {
      return "link";
    }
  });
}

/**
 * Parse Markdown text into a structured list of block nodes.
 */
export function parseMarkdownBlocks(raw: string): MarkdownBlockNode[] {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlockNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Fenced code block ```...```
    const fenceMatch = /^```([a-zA-Z0-9_+-]*)\s*$/.exec(trimmed);
    if (fenceMatch) {
      const language = fenceMatch[1] || "";
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length && lines[i].trim().startsWith("```")) {
        i += 1;
      }
      blocks.push({ type: "code", language, code: codeLines.join("\n") });
      continue;
    }

    // Horizontal rule
    if (/^(?:---+|===+|\*\*\*+|___+)\s*$/.test(trimmed)) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }

    // Heading (#..####)
    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length as 1 | 2 | 3 | 4,
        inlines: parseInlineMarkdown(headingMatch[2].trim()),
      });
      i += 1;
      continue;
    }

    // Markdown pipe table (header row + separator row + 0+ body rows)
    if (trimmed.includes("|") && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1])) {
      const headerCells = splitTableRowCells(trimmed).map((cell) => parseInlineMarkdown(cell));
      i += 2;
      const rows: MarkdownInlineNode[][][] = [];
      while (i < lines.length) {
        const rowLine = lines[i].trim();
        if (!rowLine || !rowLine.includes("|")) break;
        rows.push(splitTableRowCells(rowLine).map((cell) => parseInlineMarkdown(cell)));
        i += 1;
      }
      blocks.push({ type: "table", headers: headerCells, rows });
      continue;
    }

    // Blockquote
    if (trimmed.startsWith(">")) {
      const quoteLines: MarkdownInlineNode[][] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        const cleaned = lines[i].trim().replace(/^>\s?/, "");
        if (cleaned) {
          quoteLines.push(parseInlineMarkdown(cleaned));
        }
        i += 1;
      }
      if (quoteLines.length > 0) {
        blocks.push({ type: "blockquote", lines: quoteLines });
      }
      continue;
    }

    // Unordered / Ordered List
    const unorderedMatch = /^(\s*)([-*+])\s+(.+)$/.exec(line);
    const orderedMatch = /^(\s*)(\d+[.)])\s+(.+)$/.exec(line);
    if (unorderedMatch || orderedMatch) {
      const ordered = Boolean(orderedMatch);
      const items: Array<{ marker: string; depth: number; inlines: MarkdownInlineNode[] }> = [];
      while (i < lines.length) {
        const currLine = lines[i];
        const mUnordered = /^(\s*)([-*+])\s+(.+)$/.exec(currLine);
        const mOrdered = /^(\s*)(\d+[.)])\s+(.+)$/.exec(currLine);
        const m = ordered ? mOrdered : mUnordered;
        if (!m) break;
        const indentSpaces = m[1].replace(/\t/g, "  ").length;
        items.push({
          marker: m[2],
          depth: Math.min(2, Math.floor(indentSpaces / 2)),
          inlines: parseInlineMarkdown(m[3].trim()),
        });
        i += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    // Paragraph (coalesce contiguous plain text lines until blank line or structural marker)
    const paraLines: string[] = [];
    while (i < lines.length) {
      const curr = lines[i];
      const currTrim = curr.trim();
      if (
        !currTrim ||
        currTrim.startsWith("```") ||
        /^(#{1,4})\s+/.test(currTrim) ||
        /^(?:---+|===+|\*\*\*+|___+)\s*$/.test(currTrim) ||
        currTrim.startsWith(">") ||
        /^(\s*)([-*+])\s+/.test(curr) ||
        /^(\s*)(\d+[.)])\s+/.test(curr) ||
        (currTrim.includes("|") && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1]))
      ) {
        break;
      }
      paraLines.push(currTrim);
      i += 1;
    }
    if (paraLines.length > 0) {
      blocks.push({
        type: "paragraph",
        inlines: parseInlineMarkdown(paraLines.join(" ")),
      });
    }
  }

  return blocks;
}

/**
 * Convert Markdown into fluent, symbol-free spoken prose suitable for both
 * ElevenLabs AI Voice and Browser SpeechSynthesis, with natural pauses.
 */
export function markdownToSpeechText(raw: string): string {
  const preCleaned = stripCitationMarkers(raw || "");
  if (!preCleaned.trim()) return "";

  const blocks = parseMarkdownBlocks(preCleaned);
  const parts: string[] = [];

  for (const block of blocks) {
    if (block.type === "hr") continue;

    if (block.type === "code") {
      parts.push("See the code snippet on screen.");
      continue;
    }

    if (block.type === "heading") {
      const spoken = shortenBareUrls(inlinesToPlainText(block.inlines));
      const clean = ensureSentencePause(spoken);
      if (clean) parts.push(clean);
      continue;
    }

    if (block.type === "paragraph") {
      const spoken = shortenBareUrls(inlinesToPlainText(block.inlines)).trim();
      if (spoken) parts.push(spoken);
      continue;
    }

    if (block.type === "blockquote") {
      const text = block.lines
        .map((line) => shortenBareUrls(inlinesToPlainText(line)))
        .join(" ")
        .trim();
      const clean = ensureSentencePause(text);
      if (clean) parts.push(clean);
      continue;
    }

    if (block.type === "list") {
      for (const item of block.items) {
        const text = shortenBareUrls(inlinesToPlainText(item.inlines)).trim();
        if (!text) continue;
        const prefix = block.ordered ? `${item.marker} ` : "";
        parts.push(ensureSentencePause(`${prefix}${text}`));
      }
      continue;
    }

    if (block.type === "table") {
      const headers = block.headers
        .map((h) => shortenBareUrls(inlinesToPlainText(h)).trim())
        .filter(Boolean);
      if (headers.length > 0) {
        parts.push(ensureSentencePause(headers.join(", ")));
      }
      for (const row of block.rows) {
        const vals = row
          .map((cell) => shortenBareUrls(inlinesToPlainText(cell)).trim())
          .filter(Boolean);
        if (vals.length > 0) {
          parts.push(ensureSentencePause(vals.join(", ")));
        }
      }
    }
  }

  return parts
    .join(" ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeWordForSync(word: string): string {
  return word
    .toLowerCase()
    .replace(/^[^a-z0-9\u00c0-\u024f\u0900-\u097f]+|[^a-z0-9\u00c0-\u024f\u0900-\u097f]+$/gi, "");
}

export interface TextRunPiece {
  text: string;
  isWord: boolean;
}

/**
 * Split a string preserving whitespace pieces interleaved with non-whitespace word runs.
 */
export function splitTextWithWhitespace(text: string): TextRunPiece[] {
  const pieces: TextRunPiece[] = [];
  const regex = /(\s+|\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const chunk = match[0];
    pieces.push({
      text: chunk,
      isWord: !/^\s+$/.test(chunk),
    });
  }
  return pieces;
}

function collectWordsFromLeafText(text: string, out: string[]): void {
  const pieces = splitTextWithWhitespace(text);
  for (const p of pieces) {
    if (p.isWord) out.push(p.text);
  }
}

function collectWordsFromInlines(inlines: MarkdownInlineNode[], out: string[]): void {
  for (const node of inlines) {
    if (node.type === "citation" || node.type === "audio_cue") {
      continue;
    }
    if (node.type === "text" || node.type === "code") {
      collectWordsFromLeafText(node.value, out);
    } else if (node.type === "link") {
      collectWordsFromLeafText(node.label, out);
    } else if (node.type === "math") {
      // Treat the rendered math as a single visual token
      collectWordsFromLeafText(node.value, out);
    } else if (node.type === "sub" || node.type === "sup") {
      collectWordsFromInlines(node.children, out);
    } else {
      collectWordsFromInlines(node.children, out);
    }
  }
}

/**
 * Extract the ordered list of displayable prose word tokens from Markdown blocks
 * corresponding to rendered headings, paragraphs, list items, blockquotes, and table cells.
 */
export function extractVisualProseWords(blocks: MarkdownBlockNode[]): string[] {
  const out: string[] = [];
  for (const block of blocks) {
    if (block.type === "heading" || block.type === "paragraph") {
      collectWordsFromInlines(block.inlines, out);
    } else if (block.type === "blockquote") {
      for (const line of block.lines) {
        collectWordsFromInlines(line, out);
      }
    } else if (block.type === "list") {
      for (const item of block.items) {
        collectWordsFromInlines(item.inlines, out);
      }
    } else if (block.type === "table") {
      for (const h of block.headers) {
        collectWordsFromInlines(h, out);
      }
      for (const row of block.rows) {
        for (const cell of row) {
          collectWordsFromInlines(cell, out);
        }
      }
    }
  }
  return out;
}

/**
 * Align visual Markdown prose tokens [0..M-1] to speech engine tokens [0..K-1].
 * Handles added heading periods, ordered-list prefixes, URL shortening, and
 * skipped code blocks / table separators via bounded lookahead and 2-word anchor resync.
 */
export function alignMarkdownTokensToSpeech(
  visualTokens: string[],
  speechTokens: string[]
): number[] {
  const mapping = new Array<number>(visualTokens.length).fill(-1);
  if (visualTokens.length === 0 || speechTokens.length === 0) {
    return mapping;
  }

  const normSpeech = speechTokens.map(normalizeWordForSync);
  let s = 0;

  for (let v = 0; v < visualTokens.length && s < speechTokens.length; v++) {
    const nv = normalizeWordForSync(visualTokens[v]);

    // Standalone punctuation does not consume a speech token when the next word aligns.
    if (!nv) {
      const nextNorm = v + 1 < visualTokens.length ? normalizeWordForSync(visualTokens[v + 1]) : "";
      if (nextNorm && normSpeech[s] === nextNorm) {
        mapping[v] = s;
        continue;
      }
      mapping[v] = s;
      continue;
    }

    // 1. Direct or small-window lookahead match (handles inserted list numbers / code notices / pauses)
    let matchedIdx = -1;
    const maxLook = Math.min(speechTokens.length - 1, s + 8);
    for (let k = s; k <= maxLook; k++) {
      if (normSpeech[k] === nv) {
        matchedIdx = k;
        break;
      }
    }

    if (matchedIdx !== -1) {
      mapping[v] = matchedIdx;
      s = matchedIdx + 1;
      continue;
    }

    // 2. Prefix/sub-token match (e.g. hyphenated compound vs ElevenLabs token split, or shortened URL)
    const ns = normSpeech[s];
    if (ns && (nv.startsWith(ns) || ns.startsWith(nv)) && Math.min(nv.length, ns.length) >= 2) {
      mapping[v] = s;
      s += 1;
      continue;
    }

    // 3. Two-word anchor resync up to 20 tokens ahead (recovers after tables/code blocks)
    if (v + 1 < visualTokens.length) {
      const nvNext = normalizeWordForSync(visualTokens[v + 1]);
      if (nvNext) {
        const resyncLimit = Math.min(speechTokens.length - 2, s + 20);
        for (let k = s + 1; k <= resyncLimit; k++) {
          if (normSpeech[k] === nv && normSpeech[k + 1] === nvNext) {
            matchedIdx = k;
            break;
          }
        }
        if (matchedIdx !== -1) {
          mapping[v] = matchedIdx;
          s = matchedIdx + 1;
          continue;
        }
      }
    }

    // 4. Fallback: advance 1:1 only if current speech word doesn't clearly match the NEXT visual word
    const nextNv = v + 1 < visualTokens.length ? normalizeWordForSync(visualTokens[v + 1]) : "";
    if (nextNv && normSpeech[s] === nextNv) {
      mapping[v] = s;
    } else {
      mapping[v] = s;
      s += 1;
    }
  }

  return mapping;
}


/* ── Math-to-Speech Conversion ──────────────────────────────────────────────── */

/**
 * Convert a LaTeX math expression into natural spoken English for TTS engines.
 */
function mathExprToSpeech(expr: string): string {
  let s = expr.trim();
  // Fractions
  s = s.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "$1 over $2");
  // Square root
  s = s.replace(/\\sqrt\{([^}]+)\}/g, "square root of $1");
  // Powers
  s = s.replace(/\^2(?!\w)/g, " squared");
  s = s.replace(/\^3(?!\w)/g, " cubed");
  s = s.replace(/\^\{([^}]+)\}/g, " to the power of $1");
  s = s.replace(/\^(\w)/g, " to the power of $1");
  // Subscripts (chemical formulas like H_2O)
  s = s.replace(/_\{([^}]+)\}/g, " $1");
  s = s.replace(/_(\w)/g, " $1");
  // Greek letters
  s = s.replace(/\\alpha/g, "alpha").replace(/\\beta/g, "beta").replace(/\\gamma/g, "gamma");
  s = s.replace(/\\delta/g, "delta").replace(/\\theta/g, "theta").replace(/\\pi/g, "pi");
  s = s.replace(/\\sigma/g, "sigma").replace(/\\mu/g, "mu").replace(/\\lambda/g, "lambda");
  s = s.replace(/\\epsilon/g, "epsilon").replace(/\\omega/g, "omega").replace(/\\phi/g, "phi");
  s = s.replace(/\\rho/g, "rho").replace(/\\tau/g, "tau").replace(/\\psi/g, "psi");
  // Operators
  s = s.replace(/\\pm/g, "plus or minus").replace(/\\mp/g, "minus or plus");
  s = s.replace(/\\approx/g, "approximately equals");
  s = s.replace(/\\neq/g, "is not equal to");
  s = s.replace(/\\le(?:q)?/g, "is less than or equal to");
  s = s.replace(/\\ge(?:q)?/g, "is greater than or equal to");
  s = s.replace(/\\times/g, "times").replace(/\\cdot/g, "dot").replace(/\\div/g, "divided by");
  s = s.replace(/\\sum/g, "sum of").replace(/\\prod/g, "product of");
  s = s.replace(/\\int/g, "integral of").replace(/\\oint/g, "contour integral of");
  s = s.replace(/\\infty/g, "infinity").replace(/\\partial/g, "partial");
  s = s.replace(/\\nabla/g, "nabla").replace(/\\forall/g, "for all").replace(/\\exists/g, "there exists");
  s = s.replace(/\\in/g, "in").replace(/\\notin/g, "not in");
  s = s.replace(/\\subset/g, "is a subset of").replace(/\\cup/g, "union").replace(/\\cap/g, "intersection");
  s = s.replace(/\\rightarrow/g, "implies").replace(/\\leftarrow/g, "is implied by");
  s = s.replace(/\\Rightarrow/g, "therefore").replace(/\\iff/g, "if and only if");
  // Equals, comparisons
  s = s.replace(/=/g, " equals ").replace(/</g, " less than ").replace(/>/g, " greater than ");
  // Clean remaining command names: \text{...}, \mathrm{...}, etc.
  s = s.replace(/\\(?:text|mathrm|mathbf|textbf|operatorname|mathit)\{([^}]+)\}/g, "$2");
  // Strip remaining backslashes and braces
  s = s.replace(/[\\{}]/g, "");
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Convert LaTeX math notation to spoken English AND strip audio cue tags.
 * Used before sending text to Browser Speech API (which should never hear raw LaTeX or [emotion] tags).
 * For ElevenLabs: use convertMathToSpokenTextKeepCues instead (keeps [laughs] etc. for native synthesis).
 */
export function convertMathToSpokenText(text: string): string {
  let spoken = text;
  // Strip audio cue tags completely for browser speech
  spoken = spoken.replace(/\[(laughs|sighs|excited|whispers|gasps|pauses)\]/gi, "");
  // Display math blocks $$...$$
  spoken = spoken.replace(/\$\$([\s\S]*?)\$\$/g, (_, expr) => mathExprToSpeech(expr));
  // Inline math $...$
  spoken = spoken.replace(/\$(.*?)\$/g, (_, expr) => mathExprToSpeech(expr));
  return spoken.replace(/\s{2,}/g, " ").trim();
}

/**
 * Convert LaTeX math notation to spoken English but KEEP audio cue tags.
 * Used for ElevenLabs AI Voice which natively synthesizes [laughs], [sighs], etc.
 */
export function convertMathToSpokenTextKeepCues(text: string): string {
  let spoken = text;
  // Display math blocks $$...$$
  spoken = spoken.replace(/\$\$([\s\S]*?)\$\$/g, (_, expr) => mathExprToSpeech(expr));
  // Inline math $...$
  spoken = spoken.replace(/\$(.*?)\$/g, (_, expr) => mathExprToSpeech(expr));
  return spoken.replace(/\s{2,}/g, " ").trim();
}
