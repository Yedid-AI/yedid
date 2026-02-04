-- Add emoji column to playbooks table
ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS emoji TEXT DEFAULT NULL;
