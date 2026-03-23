-- Lead activity log for timeline tracking
CREATE TABLE IF NOT EXISTS lead_activities (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'created', 'updated', 'status_changed', 'dispatched', 'call', 'enriched'
  changes JSONB DEFAULT '{}', -- { field: { from, to } } for updates
  metadata JSONB DEFAULT '{}', -- extra context (call data, dispatch info, etc.)
  actor TEXT, -- who performed the action: user email, 'system', 'chatbot', etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lead_activities_lead_id ON lead_activities(lead_id);
CREATE INDEX idx_lead_activities_created_at ON lead_activities(created_at DESC);
