-- Migration 031: city_branch_index → proper FK to branches(id)
--
-- Today city_branch_index.branch_name is plain text. It silently desyncs from
-- branches.name when a branch is renamed or deleted, and lets orphan rows
-- live (e.g. user_id=1 has 2 entries pointing at "test" with no matching
-- branches row).
--
-- Add a real FK alongside the legacy text column. branch_id becomes the
-- source of truth; branch_name is kept for back-compat until UI/API callers
-- migrate. A future migration can drop branch_name.

-- 1. Add nullable branch_id
ALTER TABLE city_branch_index
  ADD COLUMN IF NOT EXISTS branch_id BIGINT;

-- 2. Backfill via (user_id, name) match
UPDATE city_branch_index cbi
SET branch_id = b.id
FROM branches b
WHERE b.user_id = cbi.user_id
  AND b.name = cbi.branch_name
  AND cbi.branch_id IS NULL;

-- 3. Drop orphan rows (no matching branches row — desync detector)
DELETE FROM city_branch_index WHERE branch_id IS NULL;

-- 4. Enforce NOT NULL + FK going forward
ALTER TABLE city_branch_index
  ALTER COLUMN branch_id SET NOT NULL;

ALTER TABLE city_branch_index
  DROP CONSTRAINT IF EXISTS city_branch_index_branch_id_fkey;

ALTER TABLE city_branch_index
  ADD CONSTRAINT city_branch_index_branch_id_fkey
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_city_branch_branch_id
  ON city_branch_index (branch_id);

-- 5. Keep branch_name in sync via trigger so legacy readers keep working
--    until they migrate to the FK. New writes can set either column.
CREATE OR REPLACE FUNCTION sync_city_branch_name() RETURNS trigger AS $$
BEGIN
  IF NEW.branch_id IS NOT NULL THEN
    SELECT name INTO NEW.branch_name FROM branches WHERE id = NEW.branch_id;
  ELSIF NEW.branch_name IS NOT NULL AND NEW.branch_id IS NULL THEN
    SELECT id INTO NEW.branch_id
    FROM branches
    WHERE user_id = NEW.user_id AND name = NEW.branch_name
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_city_branch_name ON city_branch_index;
CREATE TRIGGER trg_sync_city_branch_name
  BEFORE INSERT OR UPDATE ON city_branch_index
  FOR EACH ROW EXECUTE FUNCTION sync_city_branch_name();

-- 6. Cleanup orphan WhatsApp inboxes left behind by past QR-rescan duplications
--    (rows whose unipile_account_id is no longer referenced by any active config)
DELETE FROM inboxes
WHERE id IN (
  SELECT i.id FROM inboxes i
  LEFT JOIN dispatch_config dc ON dc.dispatch_inbox_id = i.id
  LEFT JOIN followup_config fc ON fc.followup_inbox_id = i.id
  WHERE i.channel_type = 'whatsapp'
    AND (i.name LIKE 'Dispatch %' OR i.name LIKE 'Relance %')
    AND dc.dispatch_inbox_id IS NULL
    AND fc.followup_inbox_id IS NULL
);
