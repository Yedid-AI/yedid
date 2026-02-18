-- Migration 013: Leads Management Module
-- Creates branches, city_branch_index, leads, and lead_field_definitions tables

-- ============ BRANCHES ============
CREATE TABLE IF NOT EXISTS branches (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  mobile TEXT,
  fax TEXT,
  address TEXT,
  chatwoot_conversation_id INTEGER,
  whatsapp_phone TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_branches_user_id ON branches(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_user_name ON branches(user_id, name);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_branches" ON branches
  FOR ALL USING (true) WITH CHECK (true);

-- ============ CITY-BRANCH INDEX ============
CREATE TABLE IF NOT EXISTS city_branch_index (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  city TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_city_branch_user_id ON city_branch_index(user_id);
CREATE INDEX IF NOT EXISTS idx_city_branch_city ON city_branch_index(user_id, city);

ALTER TABLE city_branch_index ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_city_branch_index" ON city_branch_index
  FOR ALL USING (true) WITH CHECK (true);

-- ============ LEAD FIELD DEFINITIONS ============
CREATE TABLE IF NOT EXISTS lead_field_definitions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text',
  options JSONB,
  required BOOLEAN DEFAULT FALSE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_field_defs_user_id ON lead_field_definitions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_field_defs_user_key ON lead_field_definitions(user_id, field_key);

ALTER TABLE lead_field_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_lead_field_definitions" ON lead_field_definitions
  FOR ALL USING (true) WITH CHECK (true);

-- ============ LEADS ============
CREATE TABLE IF NOT EXISTS leads (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company TEXT NOT NULL DEFAULT 'babait',
  type TEXT NOT NULL DEFAULT 'patient',

  -- Contact
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  city TEXT,

  -- Routing
  branch TEXT,
  coordinator TEXT,

  -- Lead details
  source TEXT,
  lead_channel TEXT,
  service_requested TEXT,
  service_type TEXT,
  details TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'new',

  -- Caregiver-specific
  position_type TEXT,
  experience BOOLEAN,

  -- WhatsApp dispatch
  dispatched_at TIMESTAMPTZ,
  dispatch_message_id TEXT,

  -- Extensible
  custom_fields JSONB DEFAULT '{}',
  metadata JSONB,

  -- IP / campaign
  ip_address TEXT,
  campaign TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_company ON leads(user_id, company);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(user_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_type ON leads(user_id, type);
CREATE INDEX IF NOT EXISTS idx_leads_branch ON leads(user_id, branch);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_leads" ON leads
  FOR ALL USING (true) WITH CHECK (true);
