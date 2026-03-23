-- Add contact info to sessions so closing cron can create leads
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS contact_name TEXT;
