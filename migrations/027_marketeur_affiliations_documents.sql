-- Migration 027: Marketeur role + Lead Affiliations + Lead Documents
-- Adds marketeur role, lead-user affiliation system, document attachments, and capture tokens

-- ============ EXTEND USERS ROLE ============
-- Update CHECK constraint to include 'marketeur'
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('super_admin', 'admin', 'agent', 'marketeur'));

-- ============ CAPTURE TOKEN ============
-- Each user gets a unique token for shareable public lead capture links
ALTER TABLE users ADD COLUMN IF NOT EXISTS capture_token UUID UNIQUE DEFAULT gen_random_uuid();

-- Backfill existing users
UPDATE users SET capture_token = gen_random_uuid() WHERE capture_token IS NULL;

-- ============ LEAD AFFILIATIONS ============
-- Junction table: M:N relationship between leads and users
-- Tracks which user(s) brought/manage each lead
CREATE TABLE IF NOT EXISTS lead_affiliations (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT DEFAULT 'manual',  -- manual, capture_link, import, auto, closing_cron
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lead_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_affiliations_user ON lead_affiliations(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_affiliations_lead ON lead_affiliations(lead_id);

ALTER TABLE lead_affiliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_lead_affiliations" ON lead_affiliations
  FOR ALL USING (true) WITH CHECK (true);

-- ============ LEAD DOCUMENTS ============
-- File attachments for leads (PDF, images, docs)
CREATE TABLE IF NOT EXISTS lead_documents (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  uploaded_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_documents_lead ON lead_documents(lead_id);

ALTER TABLE lead_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_lead_documents" ON lead_documents
  FOR ALL USING (true) WITH CHECK (true);

-- ============ BACKFILL AFFILIATIONS ============
-- Affiliate all existing leads to their user_id owner
INSERT INTO lead_affiliations (lead_id, user_id, source)
SELECT id, user_id, 'auto'
FROM leads
ON CONFLICT (lead_id, user_id) DO NOTHING;
