-- Migration 003: Create document_chunks table with pgvector & RLS
--
-- Stores multimodal chunks (text, table, image) with normalized bounding boxes,
-- Gemini 768-dim embeddings, and full-text search tokens.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.document_chunks (
    id VARCHAR(36) PRIMARY KEY,
    document_id VARCHAR(36) NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    owner_id VARCHAR(64) NOT NULL,
    chunk_index INTEGER NOT NULL,
    chunk_type VARCHAR(32) NOT NULL DEFAULT 'text',
    content TEXT NOT NULL,
    parent_content TEXT,
    page_number INTEGER NOT NULL,
    bbox JSONB NOT NULL,
    section_path JSONB NOT NULL DEFAULT '[]'::jsonb,
    image_url TEXT,
    table_markdown TEXT,
    token_count INTEGER NOT NULL DEFAULT 0,
    embedding vector(768),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Full-text search stored generated column
ALTER TABLE public.document_chunks 
    ADD COLUMN IF NOT EXISTS fts_tokens tsvector 
    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_chunks_owner_doc 
    ON public.document_chunks (owner_id, document_id);

CREATE INDEX IF NOT EXISTS idx_chunks_fts 
    ON public.document_chunks USING GIN (fts_tokens);

-- HNSW vector similarity search index (Cosine distance)
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw 
    ON public.document_chunks USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Enable Row-Level Security
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies (Defence-in-depth for direct client connections) ─────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'document_chunks' AND policyname = 'Users can view own chunks'
    ) THEN
        CREATE POLICY "Users can view own chunks"
            ON public.document_chunks
            FOR SELECT
            USING (auth.uid()::text = owner_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'document_chunks' AND policyname = 'Users can delete own chunks'
    ) THEN
        CREATE POLICY "Users can delete own chunks"
            ON public.document_chunks
            FOR DELETE
            USING (auth.uid()::text = owner_id);
    END IF;
END $$;
