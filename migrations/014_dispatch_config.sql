-- 014: Dispatch configuration
-- Add dispatch_enabled toggle to branches + dispatch_config table

-- 1. Add dispatch_enabled to branches
ALTER TABLE branches ADD COLUMN IF NOT EXISTS dispatch_enabled BOOLEAN DEFAULT false;

-- 2. Dispatch configuration per user
CREATE TABLE IF NOT EXISTS dispatch_config (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  dispatch_inbox_id BIGINT REFERENCES inboxes(id) ON DELETE SET NULL,
  message_fields JSONB DEFAULT '["company","name","phone","email","city","service_requested","service_type","details","source"]',
  message_header TEXT DEFAULT '',
  message_footer TEXT DEFAULT '',
  schedule_days JSONB DEFAULT '[0,1,2,3,4,5,6]',
  schedule_hour_start INTEGER DEFAULT 8,
  schedule_hour_end INTEGER DEFAULT 20,
  auto_dispatch BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- RLS
ALTER TABLE dispatch_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dispatch_config_user ON dispatch_config;
CREATE POLICY dispatch_config_user ON dispatch_config FOR ALL
  USING (user_id = current_setting('app.user_id', true)::bigint);

-- Index
CREATE INDEX IF NOT EXISTS idx_dispatch_config_user ON dispatch_config(user_id);
