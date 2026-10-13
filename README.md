# RIFT — Break into Knowledge 📖⚡

> **PDF Dictator**: An intelligent AI teacher that skims, explains, highlights, answers student questions with dual-source grounding (book + web), and resumes narration seamlessly from where it left off.

[![CI/CD Pipeline](https://img.shields.io/github/actions/workflow/status/Andro-medaa/RIFT-Break-into-knowledge-/ci.yml?branch=main&style=for-the-badge&label=CI%2FCD%20Pipeline)](https://github.com/Andro-medaa/RIFT-Break-into-knowledge-/actions)
[![Verification Ladder](https://img.shields.io/badge/Verification%20Ladder-4%2F4%20Tiers%20Passed-10b981?style=for-the-badge)](#-the-4-tier-verification-ladder)
[![Test Suite](https://img.shields.io/badge/Pytest-50%2F50%20Tests%20Passing-06b6d4?style=for-the-badge)](#-test-suite)
[![Frontend](https://img.shields.io/badge/Frontend-Next.js%2014%20App%20Router-6366f1?style=for-the-badge)](./apps/web)
[![Backend](https://img.shields.io/badge/Backend-FastAPI%20Python%203.12-f59e0b?style=for-the-badge)](./apps/api)

---

## 🗺️ Master Plan Completion Status (18/18 Steps)

### Phase A: Foundation
- [x] **Step 1: Monorepo Skeleton & Environment Setup** — Next.js 14, FastAPI, dark glassmorphism design system (`23c7883`).
- [x] **Step 2: PDF Viewer & Normalized Highlight Layer** — Percentage-based normalized coordinates `(x0, y0, x1, y1)` resilient to zoom/viewport changes (`1a8851f`).
- [x] **Step 3: PDF Ingestion Engine (PyMuPDF)** — Block parsing, heading heuristics, and semantic chunking (`2eeca90`).
- [x] **Step 4: Synchronized Highlight & Mini-Map Navigation** — Glowing pulse highlights, auto-scroll, and interactive mini-map navigation (`41c079d`).

### Phase B: Teacher Core
- [x] **Step 5: Structured Lesson Planner (Gemini 2.5 Flash)** — Pedagogical moves (`intro`, `explain`, `example`, `analogy`, `recap`, `check`) with spoken sentence splitting (`18a0c61`).
- [x] **Step 6: Emotional Narration Engine (Chatterbox TTS)** — 24kHz audio synthesis, move-to-emotion exaggeration mapping, and Web Audio API waveform visualizer (`b834b15`).
- [x] **Step 7: Cursor State & IndexedDB Persistence** — Granular `(seg_ord, sent_idx)` tracking with instant reload session recovery (`e2dd4db`).

### Phase C: Voice Q&A & Interruption Loop
- [x] **Step 8: Client-Side Barge-In & Voice Input** — Sub-50ms audio muting on speech detection, push-to-talk Spacebar, and microphone waveform (`785bd66`).
- [x] **Step 9: Grounded Q&A with Gemini & Dual Citations** — Dual grounding with amber book citations `[c1]` auto-scrolling the PDF, and blue web citation cards (`71d94cd`).
- [x] **Step 10: Seamless Lesson Resumption & Final Polish** — Spoken pedagogical bridge lines before resuming lesson, multi-burst celebratory confetti (`af7ded6`).

### Phase D: Production Hardening
- [x] **Step 11: Database & Hybrid Vector Search Migration** — PostgreSQL + `pgvector`, BM25 full-text search, and Reciprocal Rank Fusion (RRF `k=60`) (`95394c0`).
- [x] **Step 12: Authentication & Multi-Tenant Data Isolation** — User identity claims, Row-Level Security (RLS) policies, and private document isolation (`249feb3`).
- [x] **Step 13: GPU Chatterbox-Turbo & Cloudflare R2 Audio Caching** — Multi-tiered audio caching (L1 RAM + L2 Disk + L3 R2) and sub-150ms GPU synthesis fallback (`d7267af`).
- [x] **Step 14: Asynchronous Processing Queue & SSE Progress** — Async pipeline queue, page-by-page parsing, and real-time Server-Sent Events progress stream (`3a5e141`).
- [x] **Step 15: Security & Prompt Defense** — Prompt injection scanner, PDF decompression bomb sandbox validation, and expiring HMAC-SHA256 presigned URLs (`c8b3a17`).
- [x] **Step 16: Observability & Latency SLOs** — Response timing middleware, sub-1.8s barge-in SLO monitor, and telemetry metrics API (`739b302`).
- [x] **Step 17: Billing & Metered Usage** — Stripe checkout, customer portal, metered quotas (PDF pages, voice minutes, search queries) (`c27ca23`).
- [x] **Step 18: Continuous Deployment** — GitHub Actions CI/CD matrix, Vercel frontend deployment, and Railway backend containerization.

---

## 🏛️ Monorepo Structure

```
RIFT/
├── .github/workflows/ci.yml    # Automated CI/CD pipeline (lint, typecheck, pytest)
├── apps/
│   ├── web/                    # Next.js 14 App Router (TypeScript, Vanilla CSS)
│   │   ├── app/                # Main 3-panel teacher workspace
│   │   ├── components/         # PdfViewer, AudioPlayer, GroundedQaPanel, VoiceBargeInBar
│   │   ├── lib/                # Speech recognition, client barge-in controller, indexedDB
│   │   └── styles/globals.css  # Dark glassmorphic design system tokens
│   │
│   └── api/                    # FastAPI Microservice (Python 3.12+)
│       ├── app/
│       │   ├── main.py         # App entrypoint, middleware, and route registry
│       │   ├── core/           # Config, authentication, and security settings
│       │   ├── ingest/         # PyMuPDF block parser & chunker
│       │   ├── teach/          # Lesson planner, grounded Q&A, and emotion mapping
│       │   ├── providers/      # TTS engine, audio cache, Chatterbox-Turbo GPU client
│       │   ├── search/         # Hybrid search (BM25 + 768-dim embeddings + RRF)
│       │   ├── queue/          # Async job processing queue with SSE streaming
│       │   ├── security/       # Prompt injection defense, PDF sandbox, signed URLs
│       │   ├── telemetry/      # Sub-1.8s SLO latency tracer & timing middleware
│       │   ├── billing/        # Stripe checkout, customer portal, and metered quotas
│       │   └── routes/         # Documents, sessions, tts, metrics, and billing
│       ├── migrations/         # PostgreSQL schema & Row-Level Security policies
│       └── tests/              # 50 unit and integration tests
│
├── vercel.json                 # Vercel deployment configuration
├── railway.json                # Railway service configuration
└── package.json                # Monorepo root scripts
```

---

## 🛡️ The 4-Tier Verification Ladder

All features adhere to our locked verification ladder:

| Tier | Gate | Target | Standard |
|---|---|---|---|
| **Tier 1: Static Typecheck** | `tsc --noEmit` & `next build` | `apps/web` | Zero type errors, strict TypeScript compliance. |
| **Tier 2: Independent Tests** | `pytest apps/api/tests -v` | `apps/api` | 50 hermetic tests passing with 100% success rate. |
| **Tier 3: Runtime Boot** | `uvicorn` & `next dev` | Ports `8000` & `3000` | Clean boot with verified CORS and security headers. |
| **Tier 4: Interactive E2E** | Live browser loop | `http://localhost:3000` | Real-time barge-in, dual citations, audio narration. |

---

## 🧪 Test Suite (50 Hermetic Tests)

Run the full backend test suite:

```bash
# Terminal (Monorepo root)
python -m pytest apps/api/tests -v
```

Tests cover:
- **Async Processing & SSE**: `test_async_queue.py` (3 tests)
- **Multi-Tenant Isolation**: `test_auth_isolation.py` (2 tests)
- **Billing & Stripe Quotas**: `test_billing.py` (6 tests)
- **Document Ingestion**: `test_documents.py` (4 tests)
- **Health & Ping**: `test_health.py` (2 tests)
- **Hybrid BM25 + Vector Search**: `test_hybrid_search.py` (4 tests)
- **Observability & Latency SLOs**: `test_observability.py` (5 tests)
- **Structured Lesson Planner**: `test_planner.py` (4 tests)
- **Dual-Grounded Q&A**: `test_qa.py` (3 tests)
- **Security & Prompt Defense**: `test_security_defense.py` (7 tests)
- **Chatterbox TTS & Audio Cache**: `test_tts.py` (10 tests)

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js 20+
- Python 3.12+
- (Optional) Docker for containerized deployment

### 2. Installation
```bash
# Install frontend dependencies
cd apps/web && npm install && cd ../..

# Install backend dependencies
python -m pip install -r apps/api/requirements.txt
```

### 3. Running Locally
```bash
# Start backend on http://localhost:8000
npm run dev:api

# In a separate terminal, start frontend on http://localhost:3000
npm run dev:web
```

Navigate to `http://localhost:3000` to upload any PDF or click **"Load Deep Learning Sample Textbook"** to begin learning.
