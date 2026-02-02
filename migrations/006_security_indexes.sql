-- Migration 006: Security & performance indexes
-- Addresses missing indexes and session race condition constraint

-- Performance: session lookups by conversation + user (used in createOrFindSession)
CREATE INDEX IF NOT EXISTS idx_sessions_conversation_user_status
  ON sessions (chatwoot_conversation_id, user_id, status);

-- Performance: session lookups by account (used in closing cron)
CREATE INDEX IF NOT EXISTS idx_sessions_account_status
  ON sessions (chatwoot_account_id, status);

-- Performance: session lookups by status + created_at (used in inactivity queries)
CREATE INDEX IF NOT EXISTS idx_sessions_status_created
  ON sessions (status, created_at);

-- Performance: conversation messages by session (memory loading)
CREATE INDEX IF NOT EXISTS idx_conversation_messages_session
  ON conversation_messages (session_id, created_at);

-- Performance: chatwoot accounts lookup by account_id (webhook routing)
CREATE INDEX IF NOT EXISTS idx_chatwoot_accounts_account_id
  ON chatwoot_accounts (account_id);

-- Performance: inboxes lookup by inbox_id (webhook routing)
CREATE INDEX IF NOT EXISTS idx_inboxes_inbox_id
  ON inboxes (inbox_id);

-- Race condition protection: prevent duplicate open sessions per conversation
-- This ensures createOrFindSession cannot create duplicates even under concurrent requests
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_unique_open_conversation
  ON sessions (chatwoot_conversation_id, user_id)
  WHERE status = 'open';
