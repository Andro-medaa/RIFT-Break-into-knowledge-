-- RIFT Production PostgreSQL + pgvector Migration
-- Step 11: Initial Schema and Hybrid Search Setup

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 1. Documents
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID,
    title TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    storage_path TEXT NOT NULL DEFAULT '',
    page_count INT NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'uploaded',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Pages
CREATE TABLE IF NOT EXISTS pages (
    doc_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    page_no INT NOT NULL,
    width FLOAT NOT NULL DEFAULT 612.0,
    height FLOAT NOT NULL DEFAULT 792.0,
    PRIMARY KEY (doc_id, page_no)
);

-- 3. Document Chunks with 768-dim Embeddings & Full-Text tsvector
CREATE TABLE IF NOT EXISTS chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    ord INT NOT NULL,
    page_no INT NOT NULL,
    rects JSONB NOT NULL, -- Array of {x0, y0, x1, y1} in 0..1 fractions
    kind TEXT NOT NULL DEFAULT 'paragraph', -- 'heading' | 'paragraph' | 'figure_caption' | 'table'
    text TEXT NOT NULL,
    embedding vector(768),
    tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', text)) STORED
);

-- Fast GIN Index for BM25 Keyword Search
CREATE INDEX IF NOT EXISTS idx_chunks_tsv ON chunks USING GIN(tsv);

-- HNSW Vector Index for Cosine Distance Search
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON chunks(doc_id);

-- 4. Lesson Segments
CREATE TABLE IF NOT EXISTS lesson_segments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    ord INT NOT NULL,
    chunk_ids UUID[] NOT NULL DEFAULT '{}',
    move TEXT NOT NULL, -- 'intro' | 'explain' | 'example' | 'analogy' | 'recap' | 'check'
    script TEXT NOT NULL,
    sentences JSONB NOT NULL -- Array of {text, duration_estimate_ms}
);

CREATE INDEX IF NOT EXISTS idx_lesson_segments_doc_id_ord ON lesson_segments(doc_id, ord);

-- 5. Reading Sessions & Cursor State
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    doc_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    seg_ord INT NOT NULL DEFAULT 0,
    sent_idx INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Messages (Q&A Turns)
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL, -- 'user' | 'teacher'
    text TEXT NOT NULL,
    at_seg INT,
    at_sent INT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Citations (Book & Web Evidence)
CREATE TABLE IF NOT EXISTS citations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, -- 'book' | 'web'
    chunk_id UUID REFERENCES chunks(id),
    url TEXT,
    title TEXT,
    snippet TEXT
);

-- 8. Audio Cache
CREATE TABLE IF NOT EXISTS audio_cache (
    cache_key TEXT PRIMARY KEY, -- SHA256(text + voice + speed + exaggeration)
    storage_path TEXT NOT NULL,
    duration_ms INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
