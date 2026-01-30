-- Migration 002: Restructuration Agents / Inboxes / Sessions
-- Creer agent_bots, agent_config, sessions, conversation_messages
-- Lier playbooks/tools/escalation a agent_bot_id

-- 1. Table agent_bots
CREATE TABLE agent_bots (
  id                   BIGSERIAL PRIMARY KEY,
  user_id              BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chatwoot_account_id  INTEGER,
  bot_id               INTEGER,
  bot_token            TEXT,
  name                 TEXT NOT NULL,
  outgoing_url         TEXT,
  is_active            BOOLEAN DEFAULT TRUE,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Table agent_config (1:1 avec agent_bots)
CREATE TABLE agent_config (
  id                BIGSERIAL PRIMARY KEY,
  agent_bot_id      BIGINT NOT NULL REFERENCES agent_bots(id) ON DELETE CASCADE,
  name              TEXT,
  prompt            TEXT,
  tone              TEXT,
  response_length   TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_bot_id)
);

-- 3. Table sessions
CREATE TABLE sessions (
  id                        BIGSERIAL PRIMARY KEY,
  user_id                   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  inbox_id                  BIGINT REFERENCES inboxes(id) ON DELETE SET NULL,
  chatwoot_account_id       INTEGER,
  chatwoot_inbox_id         INTEGER,
  chatwoot_conversation_id  INTEGER,
  status                    TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  billable                  BOOLEAN DEFAULT FALSE,
  ai_reason                 TEXT,
  ai_confidence             REAL,
  closed_at                 TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Table conversation_messages
CREATE TABLE conversation_messages (
  id              BIGSERIAL PRIMARY KEY,
  session_id      BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  playbook_id     BIGINT REFERENCES playbooks(id) ON DELETE SET NULL,
  escalation_id   BIGINT REFERENCES escalation_rules(id) ON DELETE SET NULL,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Ajouter FK agent_bot sur tables existantes
ALTER TABLE inboxes ADD COLUMN agent_bot_id BIGINT REFERENCES agent_bots(id) ON DELETE SET NULL;

ALTER TABLE playbooks ADD COLUMN agent_bot_id BIGINT REFERENCES agent_bots(id) ON DELETE CASCADE;
ALTER TABLE tools ADD COLUMN agent_bot_id BIGINT REFERENCES agent_bots(id) ON DELETE CASCADE;
ALTER TABLE escalation_rules ADD COLUMN agent_bot_id BIGINT REFERENCES agent_bots(id) ON DELETE CASCADE;

-- 6. Migration des donnees existantes

-- Creer un agent_bot par user ayant un chatwoot_account
INSERT INTO agent_bots (user_id, chatwoot_account_id, bot_token, name)
SELECT DISTINCT ca.user_id, ca.account_id, i.bot_token, COALESCE(i.name, 'Agent par defaut')
FROM chatwoot_accounts ca
LEFT JOIN inboxes i ON i.user_id = ca.user_id
WHERE ca.user_id IS NOT NULL;

-- Lier inboxes a leur agent_bot
UPDATE inboxes i SET agent_bot_id = ab.id
FROM agent_bots ab WHERE ab.user_id = i.user_id;

-- Lier playbooks/tools/escalation a leur agent_bot
UPDATE playbooks p SET agent_bot_id = ab.id FROM agent_bots ab WHERE ab.user_id = p.user_id;
UPDATE tools t SET agent_bot_id = ab.id FROM agent_bots ab WHERE ab.user_id = t.user_id;
UPDATE escalation_rules er SET agent_bot_id = ab.id FROM agent_bots ab WHERE ab.user_id = er.user_id;

-- Creer agent_config par defaut pour chaque agent_bot
INSERT INTO agent_config (agent_bot_id, name) SELECT id, name FROM agent_bots;

-- 7. Index
CREATE INDEX idx_agent_bots_user_id ON agent_bots(user_id);
CREATE INDEX idx_agent_config_agent_bot_id ON agent_config(agent_bot_id);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_inbox_id ON sessions(inbox_id);
CREATE INDEX idx_conversation_messages_session_id ON conversation_messages(session_id);
CREATE INDEX idx_inboxes_agent_bot_id ON inboxes(agent_bot_id);
CREATE INDEX idx_playbooks_agent_bot_id ON playbooks(agent_bot_id);
CREATE INDEX idx_tools_agent_bot_id ON tools(agent_bot_id);
CREATE INDEX idx_escalation_rules_agent_bot_id ON escalation_rules(agent_bot_id);

-- 8. RLS + policies
ALTER TABLE agent_bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_agent_bots" ON agent_bots
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_agent_config" ON agent_config
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_sessions" ON sessions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_conversation_messages" ON conversation_messages
  FOR ALL USING (true) WITH CHECK (true);
