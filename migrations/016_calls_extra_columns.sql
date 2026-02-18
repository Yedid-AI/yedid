-- Migration 016: Add gclid and cdr_meta_data columns to calls table
ALTER TABLE calls ADD COLUMN IF NOT EXISTS gclid TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS cdr_meta_data JSONB;

CREATE INDEX IF NOT EXISTS idx_calls_gclid ON calls(gclid) WHERE gclid IS NOT NULL;
