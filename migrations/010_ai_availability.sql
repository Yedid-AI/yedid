-- 010: AI availability toggle and schedule for inboxes
-- ai_enabled: global ON/OFF for AI on this inbox (default true)
-- ai_schedule: weekly schedule JSONB, null = always active (24/7)
-- ai_timezone: IANA timezone for schedule interpretation (null = UTC)

ALTER TABLE inboxes ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE inboxes ADD COLUMN IF NOT EXISTS ai_schedule JSONB DEFAULT NULL;
ALTER TABLE inboxes ADD COLUMN IF NOT EXISTS ai_timezone TEXT DEFAULT NULL;
