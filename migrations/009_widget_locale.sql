-- Add widget_locale column to inboxes (controls Chatwoot widget language)
ALTER TABLE inboxes ADD COLUMN IF NOT EXISTS widget_locale TEXT DEFAULT NULL;
