-- 020: Add inbox reference to followup_config for Chatwoot integration
ALTER TABLE followup_config ADD COLUMN IF NOT EXISTS followup_inbox_id BIGINT REFERENCES inboxes(id) ON DELETE SET NULL;
