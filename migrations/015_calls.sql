-- Migration 015: Calls (Maskyoo CDR cache)
-- Stores call detail records fetched from Maskyoo API locally for fast queries

CREATE TABLE IF NOT EXISTS calls (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Core CDR fields (indexed for fast filters/search)
  cdr_uniqueid TEXT NOT NULL,
  start_call TIMESTAMPTZ,
  end_call TIMESTAMPTZ,
  call_duration INTEGER DEFAULT 0,
  cdr_ani TEXT,          -- caller number
  cdr_ddi TEXT,          -- maskyoo number
  user_phone TEXT,       -- destination
  user_name TEXT,
  call_status TEXT,
  onetouch TEXT,

  -- All raw data from Maskyoo (preserves every field)
  raw_data JSONB DEFAULT '{}',

  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: one CDR per user (avoid duplicates on re-sync)
CREATE UNIQUE INDEX IF NOT EXISTS idx_calls_user_uniqueid ON calls(user_id, cdr_uniqueid);

-- Query indexes
CREATE INDEX IF NOT EXISTS idx_calls_user_id ON calls(user_id);
CREATE INDEX IF NOT EXISTS idx_calls_start_call ON calls(user_id, start_call DESC);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(user_id, call_status);
CREATE INDEX IF NOT EXISTS idx_calls_cdr_ani ON calls(cdr_ani);
CREATE INDEX IF NOT EXISTS idx_calls_cdr_ddi ON calls(cdr_ddi);
CREATE INDEX IF NOT EXISTS idx_calls_user_phone ON calls(user_phone);

ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_calls" ON calls
  FOR ALL USING (true) WITH CHECK (true);
