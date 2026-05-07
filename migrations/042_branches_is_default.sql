-- Migration 042: default branch fallback per tenant
-- Used when a lead has no fixed-branch service and no city_branch_index match.
-- Aviezer currently has a single branch (elyahou) and no city index → without
-- this fallback, every aviezer lead lands branch=null and can't be dispatched.

ALTER TABLE branches ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

-- Only one default branch per tenant — partial unique index prevents accidents.
CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_one_default_per_user
  ON branches(user_id) WHERE is_default = TRUE;
