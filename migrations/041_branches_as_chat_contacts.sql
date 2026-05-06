-- ============================================================
-- 041 — BRANCHES AS FIRST-CLASS CHAT CONTACTS
-- ============================================================
-- The dispatch flow used to create stub `leads` rows tagged
-- metadata.is_branch=true purely to satisfy chat_conversations.contact_id
-- NOT NULL FK. Per-tenant duplication created a polluted leads table
-- (10 stubs for 4 real branches). This migration:
--   - makes contact_id nullable on chat_conversations
--   - adds chat_conversations.branch_id (FK branches.id)
--   - mirror on chat_messages so contact replies from a coordinator can
--     point at a branch instead of needing a stub lead
--   - relaxes the chat_messages sender-consistency CHECK accordingly
--   - backfills existing branch dispatch convs from their stub leads
--   - deletes the 4 pure-stub branch leads (Aaron #15562 stays — hybrid
--     customer + coordinator)
-- ============================================================

-- 1. SCHEMA: chat_conversations
ALTER TABLE chat_conversations
  ALTER COLUMN contact_id DROP NOT NULL;

ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS branch_id BIGINT REFERENCES branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chat_conv_branch
  ON chat_conversations(branch_id) WHERE branch_id IS NOT NULL;

-- Conversation must have at least one anchor: a lead OR a branch.
ALTER TABLE chat_conversations
  DROP CONSTRAINT IF EXISTS chat_conversations_contact_or_branch;
ALTER TABLE chat_conversations
  ADD CONSTRAINT chat_conversations_contact_or_branch
  CHECK (contact_id IS NOT NULL OR branch_id IS NOT NULL);

-- 2. SCHEMA: chat_messages
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS branch_id BIGINT REFERENCES branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chat_msg_branch
  ON chat_messages(branch_id) WHERE branch_id IS NOT NULL;

-- Replace the sender-consistency CHECK: a contact message must have
-- contact_id OR branch_id (a coordinator reply on a dispatch conv has
-- branch_id, no contact_id). Bot messages remain unanchored.
-- The original constraint is `chk_sender_ref` (cf. migration 038).
ALTER TABLE chat_messages
  DROP CONSTRAINT IF EXISTS chk_sender_ref;
ALTER TABLE chat_messages
  ADD CONSTRAINT chk_sender_ref CHECK (
    (sender_type = 'agent'
       AND agent_id IS NOT NULL
       AND contact_id IS NULL
       AND branch_id IS NULL) OR
    (sender_type = 'contact'
       AND (contact_id IS NOT NULL OR branch_id IS NOT NULL)
       AND agent_id IS NULL) OR
    (sender_type = 'bot'
       AND agent_id IS NULL
       AND contact_id IS NULL)
  );

-- 3. BACKFILL: hydrate branch_id on existing branch dispatch convs/msgs
-- Identify the source-of-truth branch_id from the stub lead's metadata.

-- Aaron (#15562) is a real customer who is also a branch coordinator —
-- his convs need branch_id set (so AI skips) but contact_id kept (so
-- his customer history stays linked to his lead row).
UPDATE chat_conversations c
SET branch_id = (l.metadata->>'branch_id')::BIGINT
FROM leads l
WHERE c.contact_id = l.id
  AND l.metadata->>'is_branch' = 'true'
  AND l.id = 15562;

-- Pure stub branch leads (no real customer history): hydrate branch_id
-- AND clear contact_id, so the conv is anchored on the branch only.
UPDATE chat_conversations c
SET branch_id = (l.metadata->>'branch_id')::BIGINT,
    contact_id = NULL
FROM leads l
WHERE c.contact_id = l.id
  AND l.metadata->>'is_branch' = 'true'
  AND l.id IN (10663, 15578, 15612, 15619);

-- Same for chat_messages where contact_id points at a pure stub.
UPDATE chat_messages m
SET branch_id = (l.metadata->>'branch_id')::BIGINT,
    contact_id = NULL
FROM leads l
WHERE m.contact_id = l.id
  AND l.metadata->>'is_branch' = 'true'
  AND l.id IN (10663, 15578, 15612, 15619);

-- 4. DELETE the 4 pure stub branch leads. Aaron #15562 is preserved.
DELETE FROM leads
WHERE id IN (10663, 15578, 15612, 15619)
  AND metadata->>'is_branch' = 'true';
