# RIFT — Master Plan

> **PDF Dictator**: A smart AI teacher that skims, explains, highlights, answers questions with dual-source grounding (book + web), and resumes seamlessly from where it left off.

---

## 🎯 Decisions Locked (from our interview)

| Decision | Choice |
|---|---|
| Platform | Web app (browser) |
| LLM | Gemini API (2.5 Flash for planning, 2.5 Pro for grounded Q&A) |
| TTS | **Chatterbox (Resemble AI)** — open-source (MIT), expressive emotional control (`exaggeration` dial, `[laugh]`, `[sigh]`), local/self-hosted. *Fallback: Kokoro-82M (Apache 2.0) → Browser `speechSynthesis`* |
| PDF Processing | `pdf.js` / `react-pdf` (rendering) + PyMuPDF (server parsing) + Gemini (multimodal understanding) |
| Teaching Mode | Hybrid: pre-process lesson plan in windows + real-time pivot on interruption |
| User Input | Voice + text (both supported simultaneously) |
| Internet Search | Gemini with native `google_search` grounding |
| Frontend | Next.js 14+ (App Router), TypeScript |
| Backend | FastAPI (Python 3.12) |
| UI Theme | Dark glassmorphism + accent gradients |
| Layout | Three-panel: PDF left (with highlights/minimap), lesson center, chat right |
| Styling | Vanilla CSS + CSS Variables (no Tailwind, per design system preferences) |
| Storage (Proto) | IndexedDB (via `idb`) + localStorage |
| Storage (Prod) | PostgreSQL + pgvector (Supabase) + Redis (Upstash) |
| Auth | None (prototype) → Google/GitHub OAuth (production) |
| Language | English only (prototype) → multi-language (production) |
| Deployment | Vercel (frontend) + Railway / Render (backend + TTS worker) |
| Timeline | 2-3 weeks prototype |

---

## 📋 Animations Prioritized

- [x] **Real-time text highlighting with glow/pulse** on active paragraph
- [x] **Waveform visualizer** reactive to TTS audio playback
- [x] **Floating lesson map** with current position indicator
- [x] **Smooth scroll-to and zoom** on active PDF section
- [x] **Mini-map with covered regions** dynamically illuminated
- [x] **Streaming/typing animation** for AI chat and bridge responses
- [x] **Confetti celebration** on chapter/milestone completion
- [x] **Animated progress bar** reflecting lesson completion

---

# 🧪 PROTOTYPE STACK

> Goal: Working demo in 2-3 weeks. Prove the core teacher experience.

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend** | Next.js 14+ (App Router), TypeScript | SSR, fast client hydration, clean routing |
| **Styling** | Vanilla CSS + CSS Variables | Dark glassmorphism, precise control, zero Tailwind bloat |
| **PDF Rendering** | `react-pdf` (pdf.js wrapper) | Renders canvas pages with normalized highlight overlay |
| **PDF Parsing** | PyMuPDF (`fitz` in FastAPI) | Fast extraction of text blocks, coordinates, and bounding boxes |
| **PDF Understanding** | Gemini 2.5 Flash | Multimodal understanding: chunks, layout detection, visual analysis |
| **Animation** | Framer Motion (`motion/react`) + CSS | Declarative highlight transitions, glow pulses, waveform bar heights |
| **State Machine** | XState v5 | Strict narrator lifecycle: `idle → planning → narrating ⇄ listening/answering → resuming` |
| **UI State** | Zustand | Global lightweight reactive store (active chunk, cursor, audio status) |
| **TTS Engine** | **Chatterbox-Nano (110M)** (MIT) | Expressive voice with emotion dial (`exaggeration`), inline tags (`[laugh]`), CPU-runnable, 100% free |
| **TTS Fallback** | Kokoro-82M / Browser `speechSynthesis` | Lightweight CPU backup if Chatterbox worker is warming up |
| **STT** | Web Speech API (browser built-in) | Free, zero setup for prototype voice input |
| **VAD** | `@ricky0123/vad-web` | Client-side Silero ONNX: sub-300ms speech start/stop detection, barge-in |
| **LLM (Planning)** | Gemini 2.5 Flash | Fast structured JSON output for lesson segments and scripts |
| **LLM (Q&A)** | Gemini 2.5 Pro + `google_search` | High-reasoning answer synthesis with integrated web grounding |
| **Backend** | FastAPI (Python 3.12) | Async, native PyTorch/audio support, SSE/WebSocket streaming |
| **Storage** | IndexedDB (via `idb`) + localStorage | Zero-config persistence: saves PDF blob, chunks, sessions, and cursor |
| **Hosting** | `localhost` / Vercel + Railway | Local first, instant deployment when validated |

### Prototype Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                          BROWSER (Next.js)                             │
│  ┌───────────────┐   ┌──────────────────┐   ┌───────────────────────┐  │
│  │   PDF Panel   │   │   Lesson Panel   │   │      Chat Panel       │  │
│  │   (pdf.js)    │   │  (highlight glow,│   │   (Q&A, citations,    │  │
│  │  + overlay    │   │   lesson map,    │   │    sources, voice)    │  │
│  │  + minimap    │   │   waveform)      │   │                       │  │
│  └───────────────┘   └──────────────────┘   └───────────────────────┘  │
│                                                                        │
│  ┌─── XState Narrator ──────────────────────────────────────────────┐  │
│  │ idle → planning → narrating ⇄ listening/answering → resuming     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌─── VAD (Client) ──┐  ┌── Web Speech API ──┐  ┌── Web Audio API ──┐  │
│  │ Barge-in detector │  │ Speech-to-Text     │  │ Playback + Waveform│  │
│  └───────────────────┘  └────────────────────┘  └───────────────────┘  │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ HTTP / SSE / Streaming Audio
┌────────────────────────────────────▼───────────────────────────────────┐
│                           FastAPI Backend                              │
│  ┌────────────────┐   ┌─────────────────────┐   ┌───────────────────┐  │
│  │   PDF Parser   │   │     Gemini Core     │   │  Chatterbox TTS   │  │
│  │   (PyMuPDF)    │   │ - Lesson Planner    │   │  - Nano (110M)    │  │
│  │ → chunks+rects │   │ - Q&A with Search   │   │  - Emotion dial   │  │
│  │                │   │ - Grounded citings  │   │  - Kokoro fallback│  │
│  └────────────────┘   └─────────────────────┘   └───────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

# 🚀 PRODUCTION STACK

> Goal: Scalable, multi-tenant, ultra-low latency, hardened reliability.

| Layer | Technology | Change from Prototype |
|---|---|---|
| **Frontend** | Next.js 14+, TypeScript, Vanilla CSS | Same |
| **PDF Rendering** | `react-pdf` + virtualized page windowing | Handles 500+ page documents without DOM bloat |
| **Animation** | Framer Motion + GSAP | Complex timeline-based sequences and spotlight sweeps |
| **State** | XState v5 + Zustand | Same |
| **Backend** | FastAPI split into 3 micro-services | API Gateway + Realtime Service (WebSocket) + Ingestion Worker |
| **Database** | PostgreSQL + pgvector (Supabase) | Replaces IndexedDB for multi-user sync and RAG |
| **Cache & Queue**| Redis (Upstash) + Arq | Task queue for async PDF processing, session cache, rate-limits |
| **Auth** | Supabase Auth (Google + GitHub OAuth) | User management, document ownership, session history |
| **TTS Engine** | **Chatterbox-Turbo (350M, GPU)** | Sub-200ms first-chunk audio with full emotional modulation |
| **TTS Fallback** | Kokoro (CPU) + Audio Caching (R2/S3) | Zero TTS generation cost on repeat sentence plays |
| **STT** | Deepgram Nova-2 streaming | Replaces Web Speech API for high accuracy and noise rejection |
| **LLM** | Gemini 2.5 Flash + Pro | Prompt caching enabled, streaming SSE, usage quota checks |
| **Search** | Gemini Search grounding | Verified domains, snippet extraction, rate-limiting |
| **Vector Search**| pgvector (Hybrid BM25 + Embeddings) | Document-wide semantic retrieval for complex student queries |
| **Embeddings** | Gemini `text-embedding-004` (768-dim) | Pre-computed during ingestion |
| **Storage** | Cloudflare R2 / S3 | Raw PDFs, cached TTS audio segments, page thumbnails |
| **Observability**| Sentry, PostHog, Langfuse | Error tracking, UX analytics, LLM token/latency traces |
| **Billing** | Stripe (Metered) | Subscription tiers + usage limits (audio minutes, search calls)|

### Production Architecture

```
┌─────────────────────────────────────────────┐
│              Vercel (Frontend)              │
│           Next.js + Static Assets           │
└──────────────────┬──────────────────────────┘
                   │
         ┌─────────┴──────────┐
         │                    │
┌────────▼────────┐  ┌───────▼──────────┐
│   API Service   │  │ Realtime Service │
│   (FastAPI)     │  │ (WebSocket/SSE)  │
│   - Auth / RLS  │  │ - Narration sync │
│   - Uploads     │  │ - Barge-in loop  │
│   - Document DB │  │ - Live Q&A       │
│   - Billing     │  │ - Audio streaming│
└───────┬─────────┘  └───────┬──────────┘
        │                    │
   ┌────┴────────────────────┴────┐
   │         Shared Layer         │
   │  ┌────────┐  ┌─────────────┐ │
   │  │Postgres│  │    Redis    │ │
   │  │+pgvec  │  │  (Upstash)  │ │
   │  └────────┘  └─────────────┘ │
   │  ┌────────────────────────┐  │
   │  │ Cloudflare R2 (Audio)  │  │
   │  └────────────────────────┘  │
   └──────────────┬───────────────┘
                  │
   ┌──────────────▼───────────────┐
   │     Ingestion Worker(s)      │
   │  - PyMuPDF chunking + rects  │
   │  - Gemini outline generation │
   │  - Embeddings generation     │
   │  - Chatterbox pre-render     │
   └──────────────────────────────┘
```

---

# 🔄 Comparison with Existing Plans

## vs [Plan-1.md](file:///c:/Users/sahoo/Desktop/RIFT/Plan-1.md) (Production Architecture)

| Aspect | Plan-1 | Our Plan | Verdict |
|---|---|---|---|
| **Services split** | 4 services (web, API, realtime, workers) | 3 services (API, realtime, workers) — frontend on Vercel | Plan-1 is highly granular; 3 services is simpler for initial deployment. |
| **Ingestion** | S3 presigned upload → queue (Temporal/Celery) | Same concept, Arq + Redis (simpler, Python-native) | **Aligned.** |
| **TTS** | ElevenLabs (expensive paid cloud API) | **Chatterbox (open-source, self-hosted, expressive emotions)** | **Our plan wins dramatically on cost & flexibility.** No vendor lock-in or recurring per-token TTS fees. |
| **LLM** | Claude Sonnet/Haiku | Gemini 2.5 Flash/Pro | **Our plan has lower complexity.** Gemini includes native Google Search grounding in one call. |
| **Cost control** | Audio caching per segment, prompt caching | Same approach + open-source TTS | **Aligned.** |
| **Security** | Sandboxed PDF parsing, prompt injection defense, RLS | Same | **Adopt Plan-1's security patterns.** |
| **Data model** | Comprehensive (users, docs, chunks, segments, sessions) | Same structure | **Adopt Plan-1's schema wholesale.** |

## vs [plan-2.md](file:///c:/Users/sahoo/Desktop/RIFT/plan-2.md) (Stack Recommendations)

| Aspect | Plan-2 | Our Plan | Verdict |
|---|---|---|---|
| **State machine** | XState + Zustand | Same | ✅ Exact match |
| **PDF parsing** | PyMuPDF + Docling for complex layouts | PyMuPDF + Gemini multimodal vision | **Our plan leverages Gemini vision** for complex diagrams instead of adding heavyweight Docling. |
| **TTS** | ElevenLabs / Cartesia / OpenAI TTS | **Chatterbox (MIT) + Kokoro fallback** | **Our plan eliminates cloud voice costs** while gaining emotional modulation (`exaggeration` dial). |
| **STT** | Deepgram + Silero VAD | Web Speech API (proto) → Deepgram (prod) | **Aligned.** |
| **Web search** | Tavily / Exa / Brave | Gemini Search grounding | **Our plan eliminates extra third-party search subscriptions.** |
| **Build order** | 7 steps | 10 prototype steps + 8 production steps | **Our plan provides granular test criteria for each phase.** |

## vs [Build Guide](file:///c:/Users/sahoo/Desktop/RIFT/Build%20Guide_%20AI%20Teacher%20PDF%20Narrator.md) (Detailed 18-Step Guide)

| Aspect | Build Guide | Our Plan | Verdict |
|---|---|---|---|
| **Granularity** | 18 detailed steps with code snippets | 10 prototype + 8 hardening steps with exact test checkpoints | **Build Guide is our execution blueprint.** |
| **LLM** | Claude (Anthropic) | Gemini (Google) | Swapped provider, maintained all prompt contracts. |
| **TTS** | ElevenLabs + browser fallback | **Chatterbox + Kokoro + browser fallback** | Swapped provider; added pedagogical emotion mapping. |
| **Coordinate system** | Normalized fractions (0..1), top-left origin | Adopt this exact contract | ✅ **Critical foundation — adopted.** |
| **Cursor granularity** | `(segment_ord, sentence_index)` persisted | Adopt this exact contract | ✅ **Critical foundation — adopted.** |
| **Citation aliases** | LLM outputs `[c1]`, server validates against retrieved set | Adopt this exact contract | ✅ **Critical foundation — adopted.** |

---

# 🎭 Pedagogical Emotion Mapping (Chatterbox Integration)

Chatterbox allows dynamic voice modulation via its `exaggeration` parameter (0.0 to 1.0) and inline tags (`[laugh]`, `[sigh]`, `[whisper]`). We map the Gemini lesson planner's pedagogical `move` tags directly to vocal performance:

| Teacher Move | Vocal Characteristic | Chatterbox `exaggeration` | Inline Modifiers |
|---|---|:---:|---|
| `intro` | Warm, welcoming, inviting | `0.35` | Measured pacing, clear articulation |
| `explain` | Clear, focused, instructive | `0.40` | Steady pitch, moderate rhythm |
| `example` | Enthusiastic, engaging, vivid | `0.65` | Higher pitch dynamics, upbeat inflection |
| `analogy` | Playful, relatable, imaginative | `0.75` | Natural conversational pauses, `[laugh]` where humor fits |
| `recap` | Grounded, authoritative, summarizing | `0.30` | Slower tempo, falling final cadence |
| `check` | Encouraging, warm, inquisitive | `0.55` | Rising question intonation |

### Mapping Implementation Helper (Python FastAPI)

```python
# app/teach/emotion.py

MOVE_EMOTION_CONFIG = {
    "intro":    {"exaggeration": 0.35, "speed": 1.00},
    "explain":  {"exaggeration": 0.40, "speed": 1.00},
    "example":  {"exaggeration": 0.65, "speed": 1.05},
    "analogy":  {"exaggeration": 0.75, "speed": 1.02},
    "recap":    {"exaggeration": 0.30, "speed": 0.95},
    "check":    {"exaggeration": 0.55, "speed": 1.00},
}

def get_tts_params_for_move(move: str) -> dict:
    return MOVE_EMOTION_CONFIG.get(move, {"exaggeration": 0.45, "speed": 1.00})
```

---

# ⚠️ Gotchas & Pitfalls

| # | Pitfall | Mitigation |
|---|---|---|
| 1 | **Echo: teacher's voice triggers VAD** | `echoCancellation: true` in `getUserMedia`, suppress VAD while TTS is actively playing, push-to-talk fallback (Space key). |
| 2 | **Latency: >2s from end-of-speech to audio kills conversation** | Stream STT, execute intent router and retrieval in parallel, begin Chatterbox synthesis on first sentence token stream. |
| 3 | **Chatterbox Model Cold-Start** | Model loading takes ~2s on startup. Pre-warm Chatterbox during FastAPI lifecycle `lifespan` startup event so first audio is instant. |
| 4 | **Figures, tables, and mathematical equations** | Pure text extraction garbles them. Crop bounding boxes and send to Gemini Vision for spoken narration descriptions. |
| 5 | **Multi-column and messy reading orders** | Standard `sort=True` in PyMuPDF stumbles on columns. Test with 2-column papers early; fallback to Gemini layout analysis. |
| 6 | **Mobile Safari Audio Unlock** | Browsers block programmatic audio play without explicit gesture. Initialize `AudioContext` on the initial "Start Lesson" click. |
| 7 | **Chrome SpeechSynthesis hangs on long strings** | If using browser fallback, synthesize strictly one sentence at a time (<150 chars). Never queue full paragraphs. |
| 8 | **PDF coordinate misalignment on resize/zoom** | Highlights shift when pages rescale. Use normalized coordinates `(x0, y0, x1, y1)` in fractions of page dimensions (0..1) with CSS percentages. |
| 9 | **Audio overlapping on barge-in (leaked requests)** | Ensure every audio playback and network fetch accepts an `AbortController`. Immediately cancel current audio on `USER_SPEECH_START`. |
| 10 | **Copyright & multi-user data isolation** | Do not share document chunks or cached audio across unauthenticated users for non-public-domain material. |

---

# 🔄 Narrator State Machine

```
                    ┌──────────┐
                    │   idle   │
                    └────┬─────┘
                         │ PLAY
                    ┌────▼─────┐
              ┌─────│ planning │
              │     └────┬─────┘
              │          │ PLAN_READY
              │     ┌────▼──────┐
              │  ┌──│ narrating │◄────────────────┐
              │  │  └────┬──────┘                 │
              │  │       │ USER_SPEECH_START       │
              │  │  ┌────▼──────┐                 │
              │  │  │ listening │                 │
              │  │  └──┬────┬───┘                 │
              │  │     │    │ QUESTION_READY       │
              │  │     │  ┌─▼────────┐            │
              │  │     │  │ answering│            │
              │  │     │  └──┬───────┘            │
              │  │     │     │ ANSWER_DONE         │
              │  │     │  ┌──▼───────┐            │
              │  │     │  │ resuming │────────────┘
              │  │     │  └──────────┘  BRIDGE_DONE
              │  │     │
              │  │     │ SPEECH_MISFIRE
              │  │     └──────────────────────────┘
              │  │
              │  │ PAUSE
              │  │  ┌────────┐
              │  └─►│ paused │
              │     └───┬────┘
              │         │ PLAY
              │         └────────────────────────►narrating
              │
              │ LESSON_END
              │  ┌──────────┐
              └─►│ finished │
                 └──────────┘
```

**Key transitions:**
- `narrating → listening`: Client-side barge-in immediately silences Web Audio node before server round-trip.
- `listening → narrating`: Misfire detection (cough, background bump) resumes audio mid-sentence without jarring delay.
- `answering → listening`: User interrupts teacher's answer; aborts answer TTS and processes follow-up, keeping lesson cursor intact.
- `resuming → narrating`: Spoken bridge ("Got it, picking back up where we were...") then resumes playback at `(segment_ord, sentence_index)`.

---

# 🗄️ Production Data Model

```sql
-- Core PostgreSQL + pgvector schema
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES auth.users(id),
    title TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    page_count INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'uploaded',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE pages (
    doc_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    page_no INT NOT NULL,
    width FLOAT NOT NULL,
    height FLOAT NOT NULL,
    PRIMARY KEY (doc_id, page_no)
);

CREATE TABLE chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    ord INT NOT NULL,
    page_no INT NOT NULL,
    rects JSONB NOT NULL, -- Array of {x0, y0, x1, y1} in 0..1 fractions
    kind TEXT NOT NULL,   -- 'heading' | 'paragraph' | 'figure_caption' | 'table'
    text TEXT NOT NULL,
    embedding vector(768),
    tsv tsvector
);

CREATE TABLE lesson_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    ord INT NOT NULL,
    chunk_ids UUID[] NOT NULL,
    move TEXT NOT NULL,   -- 'intro' | 'explain' | 'example' | 'analogy' | 'recap' | 'check'
    script TEXT NOT NULL,
    sentences JSONB NOT NULL -- Array of {text, duration_estimate_ms}
);

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    doc_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    seg_ord INT NOT NULL DEFAULT 0,
    sent_idx INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL, -- 'user' | 'teacher'
    text TEXT NOT NULL,
    at_seg INT,
    at_sent INT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, -- 'book' | 'web'
    chunk_id UUID REFERENCES chunks(id),
    url TEXT,
    title TEXT,
    snippet TEXT
);

CREATE TABLE audio_cache (
    cache_key TEXT PRIMARY KEY, -- SHA256(text + voice + speed + exaggeration)
    storage_path TEXT NOT NULL,
    duration_ms INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

---

# ⏱️ Latency Budget

Target: **end of user speech → first teacher audio < 2.0 seconds**

| Stage | Target | Notes |
|---|---|---|
| VAD end-of-speech detection | ~200-300ms | Client-side Silero ONNX |
| STT transcript | ~300ms | Web Speech API (proto) / Deepgram streaming (prod) |
| Router (intent classification) | ~150-200ms | Gemini 2.5 Flash, compact classification prompt |
| Retrieval (hybrid chunk + web search) | ~200-350ms | Parallel execution: local chunks + Gemini Google Search |
| LLM first sentence generation | ~400-600ms | Gemini 2.5 Pro streaming response |
| Chatterbox TTS first audio chunk | ~150-250ms | Chatterbox-Turbo GPU / Nano CPU streaming synthesis |
| **Total** | **~1.4 - 1.9s** | Well within natural conversation tolerance |

---

# 🔌 Provider Abstraction Protocols

All AI and audio services are isolated behind clean Python interfaces:

```python
# app/providers/base.py
from typing import Protocol, AsyncGenerator

class TTSProvider(Protocol):
    async def synth(
        self,
        text: str,
        voice: str = "default",
        speed: float = 1.0,
        emotion_exaggeration: float = 0.5,
    ) -> bytes:
        """Synthesize audio bytes with emotional modulation."""
        ...

    async def stream_synth(
        self,
        text: str,
        voice: str = "default",
        speed: float = 1.0,
        emotion_exaggeration: float = 0.5,
    ) -> AsyncGenerator[bytes, None]:
        """Stream raw audio chunks."""
        ...

class STTProvider(Protocol):
    async def transcribe(self, audio_bytes: bytes) -> str:
        """Convert incoming audio buffer to text."""
        ...

class LLMProvider(Protocol):
    async def generate_lesson(self, chunks: list[dict]) -> list[dict]:
        """Generate structured lesson segments."""
        ...

    async def answer_question_stream(
        self,
        question: str,
        context_chunks: list[dict],
        history: list[dict]
    ) -> AsyncGenerator[dict, None]:
        """Yield tokens, citations (book & web), and completion signals."""
        ...
```

---

# 📡 API Contract Summary

| Endpoint | Method | Payload / Response | Purpose |
|---|---|---|---|
| `/health` | GET | `{status: "ok", chatterbox_ready: true}` | Health check & model pre-warm status |
| `/documents` | POST | `Multipart(file: PDF)` → `{id, pages, chunks_count}` | Upload & synchronous prototype parsing |
| `/documents/{id}/chunks` | GET | `?page_no=1` → `[{id, rects, text, kind}]` | Page chunks with normalized bounding boxes |
| `/sessions` | POST | `{doc_id}` → `{session_id, seg_ord, sent_idx}` | Initialize or resume reading session |
| `/sessions/{id}/segments` | GET | `?from=0&count=5` → `[{ord, move, script, sentences, chunk_ids}]` | Fetch structured lesson plan segments |
| `/sessions/{id}/cursor` | PATCH | `{seg_ord: int, sent_idx: int}` → `{ok: true}` | Persist playback cursor |
| `/tts` | POST | `{text, move, voice?, speed?}` → `audio/wav` | Synthesize speech with move-matched emotion |
| `/sessions/{id}/ask` | POST | `{question: str}` → SSE stream | Stream dual-grounded answers with citation chips |

---

# 📐 Step-by-Step Build Procedure

## Phase A: Foundation (Week 1)

### Step 1: Monorepo Skeleton & Environment Setup
**Build:**
- Setup monorepo: `apps/web` (Next.js 14 App Router, Vanilla CSS) + `apps/api` (FastAPI, Python 3.12).
- Configure environment variables (`GEMINI_API_KEY`).
- Setup dependencies:
  - Frontend: `react-pdf`, `framer-motion`, `zustand`, `xstate`, `@ricky0123/vad-web`, `idb`, `canvas-confetti`.
  - Backend: `fastapi`, `uvicorn`, `pymupdf`, `google-genai`, `torch`, `torchaudio`, `chatterbox-tts`, `kokoro-onnx`.
- Establish global design system in `apps/web/styles/globals.css` (dark glassmorphism, glowing accents, CSS tokens).

**Test:**
```bash
# Terminal 1: Backend
cd apps/api && uvicorn app.main:app --reload --port 8000
# Terminal 2: Frontend
cd apps/web && npm run dev
# Browser: http://localhost:3000 loads UI; http://localhost:8000/health returns status "ok"
```
**Done When:** Both apps run locally with clean console logs and verified CORS communication.

---

### Step 2: PDF Viewer & Normalized Highlight Layer
**Build:**
- Implement `PdfViewer.tsx` using `react-pdf` with virtualized or paginated canvas rendering.
- Build `HighlightLayer.tsx` using percentage-based absolute positioning.
- Enforce coordinate contract: `{x0, y0, x1, y1}` as normalized fractions (0..1) relative to page bounds.
- Implement spotlight mode (CSS backdrop-filter dimming non-active regions) and active pulse glow animation.
- Add zoom controls (50% to 200%) and responsive resize observers.

**Test:**
- Load sample PDF.
- Hardcode test highlight rects across 3 pages.
- Zoom in and out: highlights must remain pinned exactly to test words without drifting 1 pixel.

**Done When:** Highlights scale perfectly at all zoom factors and window aspect ratios.

---

### Step 3: PDF Ingestion Engine (PyMuPDF)
**Build:**
- Implement `app/ingest/parse.py` using PyMuPDF (`fitz`).
- Extract text blocks with exact normalized bounding rectangles.
- Group into pedagogical chunks (100-250 words, preserving sentence boundaries).
- Implement heading detection (font size threshold) and filter recurring headers/footers.
- Expose `POST /documents` and `GET /documents/{id}/chunks`.

**Test:**
- Upload multi-page textbook PDF.
- Inspect JSON response: every chunk must contain valid normalized rects and clean text without broken hyphenation.

**Done When:** Real PDFs render accurate bounding boxes when overlaid on `react-pdf`.

---

### Step 4: Synchronized Highlight & Mini-Map Navigation
**Build:**
- Connect live parsed chunks to `HighlightLayer.tsx`.
- Click any chunk in UI → PDF auto-scrolls smoothly to page position.
- Build `MiniMap.tsx`: visual sidebar strip showing miniature page representations with covered/active chunk indicators.

**Test:**
- Click chunks in lesson panel: PDF scrolls smoothly with glowing active highlight.
- Mini-map highlights active page and covered regions.

**Done When:** Visual navigation between chunk list, mini-map, and PDF canvas is instantaneous and fluid.

---

## Phase B: Teacher Core (Week 2)

### Step 5: Structured Lesson Planner (Gemini 2.5 Flash)
**Build:**
- Build `app/teach/planner.py` using Gemini 2.5 Flash with JSON schema enforcement.
- Planner prompt generates teaching segments:
  - `move`: `intro` | `explain` | `example` | `analogy` | `recap` | `check`
  - `script`: conversational, spoken-friendly explanation (no markdown or bullet points)
  - `chunk_ids`: exact chunks referenced
- Split scripts into discrete sentences server-side with duration estimates.
- Expose `GET /sessions/{id}/segments`.

**Test:**
- Upload textbook chapter.
- Run planner: verify scripts sound like a charismatic teacher, not a robotic text-to-speech reader.
- Verify every chunk is accounted for without duplicate assignments.

**Done When:** Gemini produces high-quality, spoken-friendly pedagogical scripts mapped to chunks.

---

### Step 6: Emotional Narration Engine (Chatterbox TTS)
**Build:**
- Setup Chatterbox-Nano TTS in `app/providers/tts.py`.
- Pre-warm model weights on FastAPI startup.
- Implement move-to-emotion mapping (`intro`: 0.35, `explain`: 0.40, `example`: 0.65, `analogy`: 0.75).
- Build Kokoro-82M fallback if Chatterbox exceeds threshold or in low-resource environments.
- Build audio playback client in browser using Web Audio API:
  - Sentence-by-sentence streaming playback.
  - Active chunk glow synced to current sentence.
  - Real-time `Waveform.tsx` visualizer via `AnalyserNode`.
  - Transport bar (play, pause, skip, 0.8x-1.5x speed).

**Test:**
- Click "Start Lesson" → audio begins playback.
- Compare vocal delivery across `explain` vs `analogy`: analogy exhibits noticeably higher expressiveness and natural inflection.
- Waveform pulses in sync with vocal audio.
- Pause and resume: restarts immediately at exact sentence without audio click or artifact.

**Done When:** Teacher narrates emotionally with highlight synchronization and audio-reactive waveforms.

---

### Step 7: Cursor State & IndexedDB Persistence
**Build:**
- Build `narrator.ts` using XState v5 for state management.
- Persist cursor `(seg_ord, sent_idx)` to IndexedDB (`idb`) after every sentence completion.
- Listen for `beforeunload` and `visibilitychange` to guarantee latest cursor is saved.
- On app launch: detect previous session → prompt "Resume lesson from where you left off?".

**Test:**
- Start lesson, let it play for 45 seconds.
- Force-refresh the browser or close and reopen the tab.
- Click "Resume" → audio and highlights pick up at the exact sentence where it was interrupted.

**Done When:** Sessions survive page reloads, tab closures, and accidental navigation without losing place.

---

## Phase C: Voice Q&A & Interruption Loop (Week 3)

### Step 8: Client-Side Barge-In & Voice Input
**Build:**
- Integrate `@ricky0123/vad-web` in browser.
- Detect `onSpeechStart`: instantly mute and pause Web Audio playback node client-side (<50ms).
- Transition XState to `listening`.
- Record speech; transcribe via Web Speech API (or send audio to backend).
- Handle false triggers (cough/noise): auto-resume playback after 1.2s silence.
- Support Space-key push-to-talk and text input as keyboard fallback.

**Test:**
- While teacher is speaking, start talking into microphone.
- Narration must cut out immediately without lag.
- Speak a question → speech converts to text in chat panel.

**Done When:** Interruption feels instantaneous, responsive, and natural.

---

### Step 9: Grounded Q&A with Gemini & Google Search
**Build:**
- Build `POST /sessions/{id}/ask` with SSE streaming.
- Prompt Gemini 2.5 Pro with:
  - User query + conversation history
  - Active document chunks
  - Google Search grounding enabled
- LLM outputs answer with:
  - Book citations: mapped to chunk IDs (`[c1]`, `[c2]`) → amber glow highlight in PDF
  - Web citations: URLs, domain titles, snippets → blue source cards
- Chat UI renders streaming markdown with clickable citation chips.

**Test:**
- Ask book question ("Explain this theorem"): returns answer citing active PDF chunk with amber highlight.
- Ask external question ("How is this applied in industry today?"): returns web-grounded answer with blue source cards.
- Click citation chip: smoothly scrolls PDF directly to referenced chunk.

**Done When:** Dual-source answers clearly distinguish between book text and internet grounding with clickable references.

---

### Step 10: Seamless Lesson Resumption & Final Polish
**Build:**
- After teacher finishes answering question, insert spoken bridge sentence:
  - "Alright, returning to where we left off..."
- Transition state machine from `answering` → `resuming` → `narrating`.
- Play audio from saved cursor `(seg_ord, sent_idx)`.
- If user interrupts *during* an answer, cleanly abort current answer stream and process new question without resetting lesson cursor.
- Add celebratory confetti (`canvas-confetti`) when completing full chapters.
- Ensure three-panel layout adapts responsively to smaller laptop displays.

**Test:**
- Full loop test: Teach → Speak to interrupt → Teacher answers with citations → Bridge line plays → Lesson resumes smoothly from exact sentence.
- Interrupt teacher's answer halfway: handles new question gracefully, resumes lesson accurately afterward.

**Done When:** The complete end-to-end interactive AI teacher loop operates seamlessly with zero state desync.

---

## Phase D: Production Hardening (Post-Prototype)

### Step 11: Database & Hybrid Vector Search Migration
- Migrate IndexedDB storage to Supabase (PostgreSQL + pgvector).
- Generate embeddings using Gemini `text-embedding-004`.
- Implement hybrid search combining pgvector cosine similarity with PostgreSQL BM25 `tsvector`.

### Step 12: Authentication & Multi-Tenant Data Isolation
- Integrate Supabase Auth (Google & GitHub OAuth).
- Enable Row-Level Security (RLS) on documents, chunks, and sessions.
- Isolate private document embeddings per user.

### Step 13: GPU Chatterbox-Turbo & Audio Caching
- Deploy Chatterbox-Turbo (350M) on GPU container (RunPod / Modal / Railway GPU) for sub-150ms synthesis.
- Cache generated sentence audio in Cloudflare R2 keyed by `SHA256(text + voice + speed + exaggeration)`.
- Replayed lessons serve cached audio directly from CDN (zero compute cost).

### Step 14: Asynchronous Processing Queue
- Setup Redis + Arq queue for asynchronous PDF parsing and lesson pre-planning.
- Expose SSE progress events for long document uploads ("Processing page 24 of 120...").

### Step 15: Security & Prompt Defense
- Sandbox PyMuPDF parser execution against malformed PDF exploits.
- Implement prompt-injection guards on user question inputs.
- Sign expiring presigned URLs for all stored PDF files and audio assets.

### Step 16: Observability & Latency SLOs
- Setup Langfuse for LLM cost/token tracing and search quality evaluations.
- Integrate Sentry for frontend and backend error telemetry.
- Enforce strict SLO: barge-in to first audio token < 1.8 seconds.

### Step 17: Billing & Metered Usage
- Integrate Stripe checkout and customer portal.
- Meter usage by PDF pages processed and live voice generation minutes.

### Step 18: Continuous Deployment
- Setup GitHub Actions CI/CD pipeline (linting, pytest, Playwright end-to-end suite).
- Deploy frontend to Vercel and backend microservices to Railway.

---

# 🧪 Testing Checklist (Prototype)

| # | Scenario | Expected Result |
|---|---|---|
| 1 | Upload 15-page textbook PDF | Text blocks parsed; normalized rects render clean overlays |
| 2 | Click "Start Lesson" | Teacher begins narrating with synchronized active chunk glow |
| 3 | Listen for 60 seconds | Smooth sentence transitions; Chatterbox delivers emotional voice dynamics |
| 4 | Speak mid-sentence | VAD detects voice; audio cuts out instantly (<300ms) |
| 5 | Ask question about current chunk | Teacher answers citing specific PDF chunk with amber highlight |
| 6 | Ask question beyond PDF scope | Teacher responds with Google Search grounded citations & blue source cards |
| 7 | Teacher finishes answer | Spoken bridge line plays; narration resumes from exact pre-interruption sentence |
| 8 | Interrupt teacher during answer | Current answer aborts cleanly; handles new question; keeps lesson cursor intact |
| 9 | Reload browser tab | "Resume lesson?" prompt appears; resumes playback at exact sentence |
| 10 | Complete section | Confetti animation fires; progress bar and mini-map update |

---

# 📁 Recommended Folder Structure

```
RIFT/
├── apps/
│   ├── web/                          # Next.js 14 frontend
│   │   ├── app/
│   │   │   ├── page.tsx              # Landing / PDF upload
│   │   │   └── reader/
│   │   │       └── [docId]/
│   │   │           └── page.tsx      # Main 3-panel teacher workspace
│   │   ├── components/
│   │   │   ├── pdf/
│   │   │   │   ├── PdfViewer.tsx     # react-pdf canvas container
│   │   │   │   ├── HighlightLayer.tsx # Normalized CSS percentage highlights
│   │   │   │   ├── MiniMap.tsx       # Document thumbnail navigation strip
│   │   │   │   └── PageNav.tsx       # Page numbers and zoom controls
│   │   │   ├── teacher/
│   │   │   │   ├── LessonPanel.tsx   # Lesson script and outline
│   │   │   │   ├── LessonMap.tsx     # Section roadmap
│   │   │   │   ├── TransportBar.tsx  # Play, pause, skip, speed controls
│   │   │   │   ├── Waveform.tsx      # Audio-reactive frequency visualizer
│   │   │   │   └── Caption.tsx       # Live spoken sentence subtitle
│   │   │   ├── chat/
│   │   │   │   ├── ChatPanel.tsx     # Q&A message stream
│   │   │   │   ├── MessageBubble.tsx # Teacher/user messages
│   │   │   │   ├── CitationChip.tsx  # Amber book reference links
│   │   │   │   ├── SourceCard.tsx    # Blue web grounding cards
│   │   │   │   └── VoiceInput.tsx    # VAD mic indicator & push-to-talk
│   │   │   └── ui/
│   │   │       ├── Confetti.tsx      # Milestone animation
│   │   │       ├── GlassCard.tsx     # Reusable glassmorphic container
│   │   │       └── ProgressBar.tsx   # Dynamic lesson progress
│   │   ├── lib/
│   │   │   ├── narrator.ts           # XState v5 state machine
│   │   │   ├── store.ts              # Zustand stores
│   │   │   ├── vad.ts                # Client-side VAD handler
│   │   │   ├── tts.ts                # Audio fetch and Web Audio node manager
│   │   │   └── persistence.ts        # IndexedDB session & cursor manager
│   │   └── styles/
│   │       └── globals.css           # Vanilla CSS theme & design system
│   │
│   └── api/                          # FastAPI backend
│       ├── app/
│       │   ├── main.py               # FastAPI entrypoint & lifecycle
│       │   ├── core/
│       │   │   ├── config.py         # App settings & Gemini keys
│       │   │   └── deps.py           # Dependency injection
│       │   ├── ingest/
│       │   │   ├── parse.py          # PyMuPDF block & coordinate extractor
│       │   │   ├── chunk.py          # Semantic grouping & filtering
│       │   │   └── outline.py        # Section & heading detection
│       │   ├── teach/
│       │   │   ├── planner.py        # Gemini lesson plan generator
│       │   │   ├── qa.py             # Grounded Q&A with Google Search
│       │   │   ├── emotion.py        # Move-to-emotion exaggeration mapping
│       │   │   └── prompts.py        # System instructions & prompts
│       │   ├── providers/
│       │   │   ├── base.py           # TTS, STT, LLM protocol interfaces
│       │   │   ├── gemini.py         # Gemini API client
│       │   │   ├── tts_chatterbox.py # Chatterbox local synthesis engine
│       │   │   └── tts_kokoro.py     # Kokoro fallback synthesis engine
│       │   └── routes/
│       │       ├── documents.py      # Upload & chunk endpoints
│       │       ├── sessions.py       # Session management & cursor tracking
│       │       └── tts.py            # Audio generation route
│       ├── tests/                    # Backend test suite
│       └── pyproject.toml
│
├── docs/                             # Architecture plans & notes
├── evals/                            # Test PDF sample benchmark set
└── proposed-steps.md                 # Consolidated actionable execution guide
```

---

# 💡 Execution Recommendation

> [!IMPORTANT]
> **Begin execution with Step 2 (PDF Viewer & Normalized Highlight Layer).** The highlight system is the core visual anchor of RIFT. Once normalized bounding coordinates and pulse glow overlays are pixel-perfect across all zoom levels, integrating the PyMuPDF backend (Step 3) and Chatterbox narration (Step 6) will flow smoothly.

The three decisions expensive to change later are locked:
1. **Normalized coordinates (`0..1` fractions, top-left origin)**
2. **Cursor granularity `(segment_ord, sentence_index)`**
3. **Server-validated citation aliases (`[c1]`, `[c2]` mapped to real chunks)**
