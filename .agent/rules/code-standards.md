# RIFT — Coding & Testing Standards

This rule enforces development, typing, testing, and runtime contracts across the RIFT monorepo (`apps/web` and `apps/api`).

---

## 🛡️ The 4-Tier Verification Ladder

All functional additions and modifications must satisfy the 4 verification tiers:

| Tier | Gate | Target | Standard |
|---|---|---|---|
| **Tier 1: Static Typecheck** | `tsc --noEmit` & `next build` | `apps/web` | Zero type errors, strict TypeScript compliance. |
| **Tier 2: Independent Tests** | `pytest -v` (conftest mock client) | `apps/api` | Isolated unit tests with zero unnecessary boilerplate. |
| **Tier 3: Runtime Boot** | `uvicorn` & `next dev` | Ports `8000` & `3000` | Clean startup with zero port conflicts or unhandled lifecycle errors. |
| **Tier 4: Browser Subagent E2E** | Autonomous navigation & ping | `http://localhost:3000` | Verified live full-stack communication and active CORS. |

---

## 📐 Contract-First Development

Every endpoint and data contract must adhere to a contract-first design pairing Pydantic schemas (Python) with TypeScript types (Web):

### 1. Standard API Envelopes

All API responses must be wrapped in standard envelopes:

#### Backend: `ApiResponse[T]` (Python / Pydantic)
```python
from typing import Generic, TypeVar, Optional
from pydantic import BaseModel

T = TypeVar("T")

class ApiResponse(BaseModel, Generic[T]):
    success: bool
    data: Optional[T] = None
    error: Optional[str] = None
    message: Optional[str] = None
```

#### Frontend: `ApiResponse<T>` (TypeScript)
```typescript
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
```

### 2. Schema Synchronization
- Whenever a backend route changes its request or response payload, update the corresponding TypeScript type definition immediately.
- Enforce strict schemas over generic dictionaries (`dict` / `any`).

---

## 🧪 Testing Standards

- **Isolated & Independent**: Tests must run without depending on external network services or persistent shared state.
- **Fast Execution**: Mock external LLM and TTS endpoints via `conftest.py` fixtures.
- **Zero Boilerplate**: Avoid deeply nested test classes or redundant helper wrappers; write concise, direct assertion tests.

---

## 🚀 Monorepo Convenience Scripts

From the repository root, standard development and test flows are invoked via:

- `npm run test:api` — Runs backend unit tests (`pytest`).
- `npm run dev:web` — Runs frontend Next.js dev server (`next dev` on port 3000).
- `npm run dev:api` — Runs FastAPI backend (`uvicorn app.main:app --reload --port 8000`).
