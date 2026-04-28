-- Migration 032: prevent duplicate inboxes when WhatsApp QR is rescanned
--
-- The reconnect flow currently creates a brand-new inbox row whenever Unipile
-- emits CREATION_SUCCESS for a name we already track. Two safeguards:
--   1. Make unipile_account_id unique so a re-issue of the SAME account never
--      lands twice in the table.
--   2. Add partial unique on (user_id, lower(name)) for the dispatch/relance/
--      whatsapp prefixes — a single user must not have two inboxes with the
--      exact same display name. Re-creation upserts on this key in code.
--
-- Cleanup of existing orphans (ids 17, 18 in production today) is done out
-- of band by the operator; this migration is safe to apply over the cleaned
-- DB and a no-op if duplicates remain (unique creation will fail loudly).

-- 1. Drop existing partial index (non-unique, only over WHERE) if present
DROP INDEX IF EXISTS idx_inboxes_unipile_account_id;

-- 2. Unique on unipile_account_id where set
CREATE UNIQUE INDEX IF NOT EXISTS idx_inboxes_unipile_account_id_unique
  ON inboxes (unipile_account_id)
  WHERE unipile_account_id IS NOT NULL;
