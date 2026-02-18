-- Migration 017: Internal Tools Support
-- Add type and handler columns to tools table to support internal (non-HTTP) tools.
-- Internal tools execute server-side handlers (e.g., save_lead) instead of HTTP requests.

-- type: 'api' (default, existing behavior) or 'internal'
ALTER TABLE tools ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'api';
ALTER TABLE tools ADD COLUMN IF NOT EXISTS handler TEXT;

-- Make url nullable (internal tools don't need a URL)
ALTER TABLE tools ALTER COLUMN url DROP NOT NULL;

-- Constraint: internal tools must have a handler
ALTER TABLE tools ADD CONSTRAINT chk_internal_handler
  CHECK (type = 'api' OR (type = 'internal' AND handler IS NOT NULL));
