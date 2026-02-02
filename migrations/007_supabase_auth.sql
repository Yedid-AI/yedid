-- Migration 007: Supabase Auth integration
-- Adds auth_id bridge column to link public.users → auth.users (GoTrue)
-- Keeps existing BIGINT id + all FK references intact

-- 1. Add auth_id column (UUID, nullable during migration, unique when set)
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_id UUID UNIQUE;

-- 2. Create partial index for fast auth_id lookups (middleware queries by auth_id on every request)
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users (auth_id) WHERE auth_id IS NOT NULL;

-- 3. Helper RPC to copy existing bcrypt hashes into auth.users
--    Run migration script, then DROP this function.
CREATE OR REPLACE FUNCTION update_auth_password(target_user_id UUID, hashed_password TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE auth.users
  SET encrypted_password = hashed_password
  WHERE id = target_user_id;
END;
$$;

-- 4. After migration is verified stable, run separately:
-- ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
-- DROP FUNCTION IF EXISTS update_auth_password;
