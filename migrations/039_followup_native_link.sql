-- ============================================================
-- 039 — Lien followup_queue ↔ chat_conversations (natif)
-- ============================================================
-- Permet a la relance native de tracker la conversation chat_conversations
-- creee pour la detection des replies, en parallele du legacy
-- chatwoot_conversation_id qui reste pour les anciennes relances.
-- ============================================================

ALTER TABLE followup_queue
  ADD COLUMN IF NOT EXISTS conversation_id UUID
  REFERENCES chat_conversations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_followup_queue_conversation_id
  ON followup_queue(conversation_id)
  WHERE conversation_id IS NOT NULL;
