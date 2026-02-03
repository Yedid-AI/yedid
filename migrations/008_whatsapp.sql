-- 008: WhatsApp integration via Unipile
-- Adds channel_type, unipile_account_id, and phone_number to inboxes

ALTER TABLE inboxes ADD COLUMN IF NOT EXISTS channel_type TEXT NOT NULL DEFAULT 'web';
ALTER TABLE inboxes ADD COLUMN IF NOT EXISTS unipile_account_id TEXT;
ALTER TABLE inboxes ADD COLUMN IF NOT EXISTS phone_number TEXT;

-- Index for looking up inboxes by Unipile account (used in webhook handler)
CREATE INDEX IF NOT EXISTS idx_inboxes_unipile_account_id ON inboxes (unipile_account_id) WHERE unipile_account_id IS NOT NULL;
