-- Migration 036: Service routing configuration
-- Replaces hardcoded SERVICE_MAP / SERVICE_COMPANY / SERVICE_FIXED_BRANCH from
-- server/normalize-service.js with a DB-backed table editable from the admin UI.

CREATE TABLE IF NOT EXISTS service_config (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  company TEXT,
  fixed_branch TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_config_active ON service_config(is_active, display_order);

ALTER TABLE service_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_service_config" ON service_config;
CREATE POLICY "service_role_all_service_config" ON service_config
  FOR ALL USING (true) WITH CHECK (true);

-- Seed initial config from the previously hardcoded routing rules.
INSERT INTO service_config (name, aliases, company, fixed_branch, display_order) VALUES
  ('עובד זר',          '["אני מחפש/ת עובד זר"]'::jsonb,                                        'aviezer', NULL,    10),
  ('מטפל/ת',           '["אני מחפש/ת מטפל","מטפל ישראלי"]'::jsonb,                            'babait',  NULL,    20),
  ('יעוץ',             '["אני מחפש/ת יעוץ","מחפש יעוץ","ייעוץ","מידע וייעוץ"]'::jsonb,         'babait',  NULL,    30),
  ('שירות פרטי',       '["אני מחפש/ת שירות פרטי"]'::jsonb,                                     'babait',  'אודי',  40),
  ('השגחה בבית חולים', '[]'::jsonb,                                                             'babait',  'אודי',  50),
  ('אחות פרטית',       '[]'::jsonb,                                                             'babait',  'אודי',  60),
  ('שירות אמבולנס',    '[]'::jsonb,                                                             'babait',  NULL,    70),
  ('מחפש עבודה',       '[]'::jsonb,                                                             'babait',  NULL,    80)
ON CONFLICT (name) DO NOTHING;
