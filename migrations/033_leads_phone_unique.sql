-- Migration 033: enforce one lead per (user_id, phone) at the DB level.
--
-- The POST /api/leads handler already merges by (user_id, phone), but two simultaneous
-- requests can both pass the "does it exist?" SELECT before either INSERT, producing
-- duplicate leads. A unique partial index closes that race deterministically.
--
-- Pre-clean: collapse pre-existing duplicates onto the oldest row before creating the index.
-- Rather than dropping data we copy each duplicate's full payload into the oldest row's
-- metadata.history array, so the audit trail of every submission is preserved even though
-- only one row remains.

DO $$
DECLARE
  dup_count int;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT user_id, phone
    FROM leads
    WHERE phone IS NOT NULL AND phone <> ''
    GROUP BY user_id, phone
    HAVING count(*) > 1
  ) d;
  IF dup_count > 0 THEN
    RAISE NOTICE 'leads dedup: collapsing % (user_id, phone) groups with duplicates', dup_count;
  END IF;
END $$;

-- Push every newer dup's full row into the oldest row's metadata.history before deletion.
WITH ranked AS (
  SELECT id, user_id, phone, created_at,
         row_number() OVER (PARTITION BY user_id, phone ORDER BY created_at ASC, id ASC) AS rn,
         first_value(id) OVER (PARTITION BY user_id, phone ORDER BY created_at ASC, id ASC) AS keeper_id
  FROM leads
  WHERE phone IS NOT NULL AND phone <> ''
),
dups AS (
  SELECT r.keeper_id, jsonb_build_object(
    'date', l.created_at,
    'merged_from_dup_id', l.id,
    'name', l.name,
    'email', l.email,
    'city', l.city,
    'branch', l.branch,
    'source', l.source,
    'lead_channel', l.lead_channel,
    'service_requested', l.service_requested,
    'service_type', l.service_type,
    'details', l.details,
    'campaign', l.campaign,
    'custom_fields', l.custom_fields
  ) AS entry
  FROM ranked r
  JOIN leads l ON l.id = r.id
  WHERE r.rn > 1
)
UPDATE leads k
SET metadata = jsonb_set(
  COALESCE(k.metadata, '{}'::jsonb),
  '{history}',
  COALESCE(k.metadata->'history', '[]'::jsonb) || d.entry
)
FROM dups d
WHERE k.id = d.keeper_id;

-- Now safe to remove the duplicates.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY user_id, phone ORDER BY created_at ASC, id ASC) AS rn
  FROM leads
  WHERE phone IS NOT NULL AND phone <> ''
)
DELETE FROM leads
USING ranked
WHERE leads.id = ranked.id AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS leads_user_phone_unique
  ON leads (user_id, phone)
  WHERE phone IS NOT NULL AND phone <> '';
