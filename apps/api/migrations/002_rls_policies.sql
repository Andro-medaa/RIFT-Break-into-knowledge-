-- Step 12: PostgreSQL Row-Level Security (RLS) & Multi-Tenant Data Isolation

-- 1. Enable RLS on all tables
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE citations ENABLE ROW LEVEL SECURITY;

-- 2. Documents Policies:
-- Users can read their own documents, or public sample documents (where owner_id IS NULL)
CREATE POLICY "Users can read own or public documents"
ON documents FOR SELECT
USING (owner_id IS NULL OR owner_id = auth.uid());

CREATE POLICY "Users can insert own documents"
ON documents FOR INSERT
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own documents"
ON documents FOR UPDATE
USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own documents"
ON documents FOR DELETE
USING (auth.uid() = owner_id);

-- 3. Chunks & Pages Policies (Cascaded through document ownership):
CREATE POLICY "Users can read chunks of accessible documents"
ON chunks FOR SELECT
USING (
    doc_id IN (
        SELECT id FROM documents
        WHERE owner_id IS NULL OR owner_id = auth.uid()
    )
);

CREATE POLICY "Users can read pages of accessible documents"
ON pages FOR SELECT
USING (
    doc_id IN (
        SELECT id FROM documents
        WHERE owner_id IS NULL OR owner_id = auth.uid()
    )
);

-- 4. Lesson Segments Policies:
CREATE POLICY "Users can read lesson segments of accessible documents"
ON lesson_segments FOR SELECT
USING (
    doc_id IN (
        SELECT id FROM documents
        WHERE owner_id IS NULL OR owner_id = auth.uid()
    )
);

-- 5. Sessions Policies:
CREATE POLICY "Users can manage own sessions"
ON sessions FOR ALL
USING (user_id IS NULL OR user_id = auth.uid());

-- 6. Messages & Citations Policies:
CREATE POLICY "Users can read messages of own sessions"
ON messages FOR ALL
USING (
    session_id IN (
        SELECT id FROM sessions
        WHERE user_id IS NULL OR user_id = auth.uid()
    )
);
