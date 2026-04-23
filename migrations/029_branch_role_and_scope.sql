-- Migration 029: Branch role + multi-tenant scope (company + branches)
-- Adds 'branch' role, user_branches M:N, leads.branch_id FK, normalized enterprise.
-- Backfills aviezer branches and reassigns mis-attributed public leads.

-- ============ NORMALIZE users.enterprise ============
UPDATE users SET enterprise = lower(enterprise) WHERE enterprise IS NOT NULL;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_enterprise_check;
ALTER TABLE users ADD CONSTRAINT users_enterprise_check
  CHECK (enterprise IS NULL OR enterprise IN ('babait','aviezer'));

-- ============ NEW ROLE 'branch' ============
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('super_admin','admin','marketeur','agent','branch'));

-- ============ USER ↔ BRANCHES (M:N) ============
CREATE TABLE IF NOT EXISTS user_branches (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, branch_id)
);
CREATE INDEX IF NOT EXISTS idx_user_branches_user ON user_branches(user_id);
CREATE INDEX IF NOT EXISTS idx_user_branches_branch ON user_branches(branch_id);

ALTER TABLE user_branches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_user_branches" ON user_branches;
CREATE POLICY "service_role_all_user_branches" ON user_branches
  FOR ALL USING (true) WITH CHECK (true);

-- ============ LEADS.branch_id FK ============
ALTER TABLE leads ADD COLUMN IF NOT EXISTS branch_id BIGINT REFERENCES branches(id);
CREATE INDEX IF NOT EXISTS idx_leads_branch_id ON leads(branch_id);

-- ============ DUPLICATE branches FOR aviezer ============
-- Aviezer (user_id=3) currently owns 0 branches; leads.branch text points to babait branches.
-- Create matching branches under aviezer for each branch name actually used by aviezer leads.
INSERT INTO branches (user_id, name, is_active, dispatch_enabled)
SELECT DISTINCT 3, l.branch, true, true
FROM leads l
WHERE l.company = 'aviezer'
  AND l.branch IS NOT NULL
  AND l.branch <> '#N/A'
  AND NOT EXISTS (
    SELECT 1 FROM branches b WHERE b.user_id = 3 AND b.name = l.branch
  );

-- ============ BACKFILL leads.branch_id ============
-- Match leads to the branch row owned by their company's admin user.
UPDATE leads l SET branch_id = b.id
FROM branches b, users u
WHERE b.user_id = u.id
  AND u.enterprise = l.company
  AND b.name = l.branch
  AND l.branch_id IS NULL
  AND l.branch IS NOT NULL
  AND l.branch <> '#N/A';

-- ============ REASSIGN MIS-ATTRIBUTED PUBLIC LEADS ============
-- 313 leads created via /api/public/leads got user_id=1 (yedid super_admin).
-- Reassign to the proper company owner (babait=2, aviezer=3, udi→babait).
UPDATE leads SET user_id = 2 WHERE user_id = 1 AND company IN ('babait','udi');
UPDATE leads SET user_id = 3 WHERE user_id = 1 AND company = 'aviezer';
