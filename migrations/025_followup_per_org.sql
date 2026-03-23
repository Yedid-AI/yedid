-- 025: Followup config per org
-- Allow multiple followup configs per user (one per maskyoo org).

ALTER TABLE followup_config ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES maskyoo_orgs(id) ON DELETE CASCADE;

-- Drop old unique constraint (one config per user)
ALTER TABLE followup_config DROP CONSTRAINT IF EXISTS followup_config_user_id_key;

-- New unique constraint: one config per (user, org)
ALTER TABLE followup_config ADD CONSTRAINT followup_config_user_org_unique UNIQUE(user_id, org_id);

-- Add org_id to followup_queue so we can match queue items back to their org config
ALTER TABLE followup_queue ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES maskyoo_orgs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_followup_queue_org ON followup_queue(org_id);
