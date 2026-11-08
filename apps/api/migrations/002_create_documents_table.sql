-- Migration 002: Create documents table with Row-Level Security (RLS)
--
-- Tracks PDF documents stored in Supabase Storage.
-- The API backend connects via the service role connection string (bypassing RLS),
-- and RLS policies provide defence-in-depth for any direct client/anon connections.

CREATE TABLE IF NOT EXISTS public.documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_url TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    mime_type TEXT NOT NULL DEFAULT 'application/pdf',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ
);

-- Index for owner-scoped lookups
CREATE INDEX IF NOT EXISTS idx_documents_owner_id ON public.documents (owner_id);

-- Enable Row-Level Security
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies (Defence-in-depth for direct client connections) ─────────────

-- 1. SELECT policy: Users can only view their own documents
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'documents' AND policyname = 'Users can view own documents'
    ) THEN
        CREATE POLICY "Users can view own documents"
            ON public.documents
            FOR SELECT
            USING (auth.uid()::text = owner_id);
    END IF;
END $$;

-- 2. INSERT policy: Users can only insert documents for themselves
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'documents' AND policyname = 'Users can insert own documents'
    ) THEN
        CREATE POLICY "Users can insert own documents"
            ON public.documents
            FOR INSERT
            WITH CHECK (auth.uid()::text = owner_id);
    END IF;
END $$;

-- 3. DELETE policy: Users can only delete their own documents
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'documents' AND policyname = 'Users can delete own documents'
    ) THEN
        CREATE POLICY "Users can delete own documents"
            ON public.documents
            FOR DELETE
            USING (auth.uid()::text = owner_id);
    END IF;
END $$;

