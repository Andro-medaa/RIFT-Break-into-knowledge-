-- Migration 004: Create conversations and chat_messages tables with Row-Level Security (RLS)
--
-- Enables database-backed multi-thread RAG conversations per PDF document with:
-- 1. Cascade deletion on document removal
-- 2. JSONB citations for interactive PDF reticles
-- 3. Tenant isolation via owner_id

CREATE TABLE IF NOT EXISTS public.conversations (
    id VARCHAR(36) PRIMARY KEY,
    document_id VARCHAR(36) NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    owner_id VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL DEFAULT 'New Discussion',
    system_prompt TEXT,
    summary TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_conversations_doc_owner ON public.conversations (document_id, owner_id);

CREATE TABLE IF NOT EXISTS public.chat_messages (
    id VARCHAR(36) PRIMARY KEY,
    conversation_id VARCHAR(36) NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    document_id VARCHAR(36) NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    owner_id VARCHAR(64) NOT NULL,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    citations JSONB DEFAULT '[]'::jsonb,
    sequence_number INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_seq ON public.chat_messages (conversation_id, sequence_number ASC);
CREATE INDEX IF NOT EXISTS idx_messages_doc ON public.chat_messages (document_id);

-- Enable Row-Level Security
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies ─────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'conversations' AND policyname = 'Users can view own conversations'
    ) THEN
        CREATE POLICY "Users can view own conversations"
            ON public.conversations
            FOR ALL
            USING (auth.uid()::text = owner_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'chat_messages' AND policyname = 'Users can view own messages'
    ) THEN
        CREATE POLICY "Users can view own messages"
            ON public.chat_messages
            FOR ALL
            USING (auth.uid()::text = owner_id);
    END IF;
END $$;
