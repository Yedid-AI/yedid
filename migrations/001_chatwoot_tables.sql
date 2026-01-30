-- Migration: Extraire les colonnes chatwoot_* de users vers des tables dediees
-- A executer dans le SQL Editor de Supabase

-- 1. Creer la table chatwoot_accounts (1:1 avec users)
CREATE TABLE chatwoot_accounts (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id      INTEGER NOT NULL,
  chatwoot_user_id INTEGER,
  access_token    TEXT,
  pubsub_token    TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id),
  UNIQUE(account_id)
);

-- 2. Creer la table inboxes (1:N avec users)
CREATE TABLE inboxes (
  id                   BIGSERIAL PRIMARY KEY,
  user_id              BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chatwoot_account_id  INTEGER NOT NULL,
  inbox_id             INTEGER NOT NULL,
  website_token        TEXT,
  bot_token            TEXT,
  name                 TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Index
CREATE INDEX idx_chatwoot_accounts_user_id ON chatwoot_accounts(user_id);
CREATE INDEX idx_inboxes_user_id ON inboxes(user_id);
CREATE INDEX idx_inboxes_chatwoot_account_id ON inboxes(chatwoot_account_id);

-- 4. Copier les donnees existantes depuis users vers chatwoot_accounts
INSERT INTO chatwoot_accounts (user_id, account_id, chatwoot_user_id, access_token, pubsub_token)
SELECT id, chatwoot_account_id, chatwoot_user_id, chatwoot_access_token, chatwoot_pubsub_token
FROM users
WHERE chatwoot_account_id IS NOT NULL;

-- 5. Copier les donnees existantes depuis users vers inboxes
INSERT INTO inboxes (user_id, chatwoot_account_id, inbox_id, website_token, bot_token, name)
SELECT id, chatwoot_account_id, chatwoot_inbox_id, chatwoot_website_token, chatwoot_bot_token, enterprise
FROM users
WHERE chatwoot_inbox_id IS NOT NULL;

-- 6. Supprimer toutes les anciennes colonnes chatwoot de users
ALTER TABLE users DROP COLUMN IF EXISTS chatwoot_account_id;
ALTER TABLE users DROP COLUMN IF EXISTS chatwoot_user_id;
ALTER TABLE users DROP COLUMN IF EXISTS chatwoot_access_token;
ALTER TABLE users DROP COLUMN IF EXISTS chatwoot_pubsub_token;
ALTER TABLE users DROP COLUMN IF EXISTS chatwoot_inbox_id;
ALTER TABLE users DROP COLUMN IF EXISTS chatwoot_website_token;
ALTER TABLE users DROP COLUMN IF EXISTS chatwoot_bot_token;

-- 7. RLS + policies service_role
ALTER TABLE chatwoot_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inboxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_chatwoot_accounts" ON chatwoot_accounts
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_inboxes" ON inboxes
  FOR ALL USING (true) WITH CHECK (true);
