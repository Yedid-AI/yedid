-- 024: Maskyoo Orgs + Lines
-- Allows grouping Maskyoo lines (user_name + cdr_ddi) under named orgs
-- for per-org followup configuration.

CREATE TABLE IF NOT EXISTS maskyoo_orgs (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_maskyoo_orgs_user ON maskyoo_orgs(user_id);

CREATE TABLE IF NOT EXISTS maskyoo_lines (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id INTEGER REFERENCES maskyoo_orgs(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  cdr_ddi TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, user_name, cdr_ddi)
);
CREATE INDEX IF NOT EXISTS idx_maskyoo_lines_org ON maskyoo_lines(org_id);
CREATE INDEX IF NOT EXISTS idx_maskyoo_lines_user ON maskyoo_lines(user_id);
