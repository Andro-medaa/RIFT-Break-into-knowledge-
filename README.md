# RIFT — Break into Knowledge 📖⚡

> **PDF Dictator**: A smart AI teacher that skims, explains, highlights, answers questions with dual-source grounding (book + web), and resumes seamlessly from where it left off.

[![Verification Ladder](https://img.shields.io/badge/Verification%20Ladder-4%2F4%20Tiers%20Passed-10b981?style=for-the-badge)](#-the-4-tier-verification-ladder)
[![Frontend](https://img.shields.io/badge/Frontend-Next.js%2014%20App%20Router-6366f1?style=for-the-badge)](./apps/web)
[![Backend](https://img.shields.io/badge/Backend-FastAPI%20Python%203.14-06b6d4?style=for-the-badge)](./apps/api)

---

## 🏛️ Architecture Overview

RIFT is organized as a contract-first monorepo:

```
RIFT/
├── apps/
│   ├── web/                    # Next.js 14 App Router (TypeScript, Vanilla CSS)
│   │   ├── app/                # Layouts, pages, and interactive UI
│   │   ├── styles/globals.css  # Dark glassmorphic design system & tokens
│   │   └── types/api.ts        # TypeScript API envelope contracts
│   │
│   └── api/                    # FastAPI Backend (Python 3.12+)
│       ├── app/
│       │   ├── main.py         # Entrypoint, CORS middleware, /health, /api/ping
│       │   ├── core/config.py  # Environment config & allowed origins
│       │   └── schemas/        # Generic Pydantic ApiResponse[T] envelope
│       └── tests/              # Isolated hermetic pytest suite with conftest fixture
│
├── .agents/rules/              # Locked workspace coding & verification standards
├── RIFT-master-plan.md         # Full project architectural roadmap & execution plan
└── package.json                # Monorepo root scripts
```

---

## 🛡️ The 4-Tier Verification Ladder

All functional steps in RIFT are guarded by our verification ladder:

| Tier | Gate | Target | Standard |
|---|---|---|---|
| **Tier 1: Static Typecheck** | `tsc --noEmit` & `next build` | `apps/web` | Zero type errors, strict TypeScript compliance. |
| **Tier 2: Independent Tests** | `pytest -v` (conftest mock client) | `apps/api` | Hermetic unit tests with zero unnecessary boilerplate. |
| **Tier 3: Runtime Boot** | `uvicorn` & `next dev` | Ports `8000` & `3000` | Clean startup with zero port conflicts or unhandled errors. |
| **Tier 4: Browser Subagent E2E** | Autonomous navigation & ping | `http://localhost:3000` | Verified live full-stack communication and active CORS. |

---

## 📐 Contract-First Envelopes

Every endpoint adheres to a standardized response wrapper:

### Backend: `ApiResponse[T]` (Python)
```python
class ApiResponse(BaseModel, Generic[T]):
    success: bool
    data: Optional[T] = None
    error: Optional[str] = None
    message: Optional[str] = None
```

### Frontend: `ApiResponse<T>` (TypeScript)
```typescript
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string | null;
  message?: string | null;
}
```

---

## 🚀 Quickstart & Scripts

From the repository root:

```bash
# Install frontend dependencies
cd apps/web && npm install && cd ../..

# Install backend dependencies
python -m pip install -r apps/api/requirements.txt

# Run backend unit tests (Tier 2)
npm run test:api

# Start Next.js frontend on http://localhost:3000
npm run dev:web

# Start FastAPI backend on http://localhost:8000
npm run dev:api
```
