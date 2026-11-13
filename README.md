# RIFT: Break into Knowledge

RIFT is a multimodal, interactive document intelligence platform. It features synchronized audio-visual PDF exploration, continuous voice interaction with real-time ChatGPT-style fluid cloud orb visualizations, intelligent barge-in with acoustic echo rejection, grounded bounding-box citations, and multi-thread persistent conversations.

---

## 📋 Prerequisites

Before running the project, make sure you have installed:
- **Node.js**: `v18.0.0` or later ([Download Node.js](https://nodejs.org/))
- **Python**: `3.11` or later ([Download Python](https://www.python.org/))
- **uv** (recommended Python package manager) or standard `pip`:
  ```bash
  # Install uv (fast Python package manager)
  pip install uv
  # OR on Windows PowerShell:
  powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
  ```

---

## ⚙️ Environment Configuration

1. In the `apps/api` folder, copy `.env.example` to `.env`:
   ```bash
   cd apps/api
   cp .env.example .env
   # On Windows PowerShell:
   copy .env.example .env
   ```

2. Fill in your API keys in `apps/api/.env`:
   ```env
   # Supabase Database & Auth
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
   SUPABASE_SECRET_KEY=your_supabase_secret_key
   DATABASE_URL=postgresql://postgres:yourpassword@db.your-project.supabase.co:5432/postgres

   # AI Model Providers
   GEMINI_API_KEY=your_gemini_api_key
   ELEVENLABS_API_KEY=your_elevenlabs_api_key  # (Optional: fallback to browser voice if omitted)
   ```

---

## 🚀 Running the Project

You will need **two terminal windows**: one for the Backend API and one for the Frontend Web App.

### Terminal 1: Backend API (FastAPI)

```bash
# Navigate to the repository root
cd apps/api

# Option A: Using uv (Fastest)
uv run uvicorn app.main:app --reload --port 8000

# Option B: Using standard Python venv & pip
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On macOS/Linux:
source .venv/bin/activate

pip install -r ../../pyproject.toml   # Or install dependencies via uv/pip
uvicorn app.main:app --reload --port 8000
```
Backend will be live at: **`http://localhost:8000`** (Swagger docs at `http://localhost:8000/docs`).

---

### Terminal 2: Frontend Web App (Next.js)

```bash
# Navigate to the web folder
cd apps/web

# Install frontend dependencies
npm install

# Start development server
npm run dev
```
Frontend will be live at: **`http://localhost:3000`**.

---

## 🗄️ Database Migrations

If setting up a fresh Supabase database instance, run the SQL migrations located in:
`apps/api/migrations/` in your Supabase SQL Editor in numerical order:
1. `001_create_documents.sql`
2. `002_create_document_chunks.sql`
3. `003_storage_buckets.sql`
4. `004_create_conversations_and_messages.sql`

---

## 🎙️ Core Features

- **Continuous Voice Interaction Mode**: Speak naturally to inquire about PDF content with auto-silence detection.
- **ChatGPT-Style Fluid Cloud Orb**: Real-time Web Audio API visualization with orbiting gyroscopic rings and audio modulation.
- **Acoustic Echo Rejection & Barge-In**: Laptop speaker echo is filtered out to prevent self-interruption, while speaking distinct commands instantly pauses dictation.
- **Unified Voice Engine**: Toggle between ElevenLabs AI Emotional Voices and Browser Built-in Voices with automatic fallback.
- **Grounded Bounding-Box References**: Click any citation chip to jump and highlight document sections in the PDF viewer.
