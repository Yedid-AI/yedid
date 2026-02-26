-- Follow-up module: automated WhatsApp follow-up for Maskyoo callers not yet in leads

CREATE TABLE IF NOT EXISTS followup_config (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  is_active BOOLEAN DEFAULT false,
  whatsapp_account_id TEXT,
  whatsapp_connected BOOLEAN DEFAULT false,
  agent_bot_id INTEGER REFERENCES agent_bots(id),
  delay_minutes INTEGER DEFAULT 3,
  message_template TEXT,
  sources JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS followup_queue (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  phone TEXT NOT NULL,
  call_id INTEGER REFERENCES calls(id),
  source_user_name TEXT,
  source_cdr_ddi TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending',
  result TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_followup_queue_pending ON followup_queue (status, scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_followup_queue_phone ON followup_queue (phone);

ALTER TABLE followup_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE followup_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY followup_config_user ON followup_config FOR ALL USING (true);
CREATE POLICY followup_queue_user ON followup_queue FOR ALL USING (true);
