-- Migration 005: Shared Libraries Architecture
-- Convert playbooks, tools, escalation_rules from agent-scoped to user-scoped shared resources
-- with many-to-many junction tables for agent associations.

-- STEP 1: Add user_id back to the three tables (nullable initially)
ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE tools ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE escalation_rules ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE;

-- STEP 2: Populate user_id from agent_bots relationship
UPDATE playbooks p SET user_id = (SELECT ab.user_id FROM agent_bots ab WHERE ab.id = p.agent_bot_id)
WHERE p.user_id IS NULL AND p.agent_bot_id IS NOT NULL;

UPDATE tools t SET user_id = (SELECT ab.user_id FROM agent_bots ab WHERE ab.id = t.agent_bot_id)
WHERE t.user_id IS NULL AND t.agent_bot_id IS NOT NULL;

UPDATE escalation_rules er SET user_id = (SELECT ab.user_id FROM agent_bots ab WHERE ab.id = er.agent_bot_id)
WHERE er.user_id IS NULL AND er.agent_bot_id IS NOT NULL;

-- STEP 3: Make user_id NOT NULL
ALTER TABLE playbooks ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE tools ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE escalation_rules ALTER COLUMN user_id SET NOT NULL;

-- STEP 4: Create junction tables
CREATE TABLE IF NOT EXISTS agent_bot_playbooks (
  id BIGSERIAL PRIMARY KEY,
  agent_bot_id BIGINT NOT NULL REFERENCES agent_bots(id) ON DELETE CASCADE,
  playbook_id BIGINT NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_bot_id, playbook_id)
);

CREATE TABLE IF NOT EXISTS agent_bot_escalation_rules (
  id BIGSERIAL PRIMARY KEY,
  agent_bot_id BIGINT NOT NULL REFERENCES agent_bots(id) ON DELETE CASCADE,
  escalation_rule_id BIGINT NOT NULL REFERENCES escalation_rules(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_bot_id, escalation_rule_id)
);

-- STEP 5: Populate junction tables from existing relationships
INSERT INTO agent_bot_playbooks (agent_bot_id, playbook_id)
SELECT agent_bot_id, id FROM playbooks WHERE agent_bot_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO agent_bot_escalation_rules (agent_bot_id, escalation_rule_id)
SELECT agent_bot_id, id FROM escalation_rules WHERE agent_bot_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- STEP 6: Create indexes
CREATE INDEX IF NOT EXISTS idx_playbooks_user_id ON playbooks(user_id);
CREATE INDEX IF NOT EXISTS idx_tools_user_id ON tools(user_id);
CREATE INDEX IF NOT EXISTS idx_escalation_rules_user_id ON escalation_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_bot_playbooks_agent_bot_id ON agent_bot_playbooks(agent_bot_id);
CREATE INDEX IF NOT EXISTS idx_agent_bot_playbooks_playbook_id ON agent_bot_playbooks(playbook_id);
CREATE INDEX IF NOT EXISTS idx_agent_bot_escalation_rules_agent_bot_id ON agent_bot_escalation_rules(agent_bot_id);
CREATE INDEX IF NOT EXISTS idx_agent_bot_escalation_rules_escalation_rule_id ON agent_bot_escalation_rules(escalation_rule_id);

-- STEP 7: RLS policies for junction tables
ALTER TABLE agent_bot_playbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_bot_escalation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_agent_bot_playbooks" ON agent_bot_playbooks
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_agent_bot_escalation_rules" ON agent_bot_escalation_rules
  FOR ALL USING (true) WITH CHECK (true);

-- NOTE: Do NOT drop agent_bot_id columns yet.
-- That will be done in migration 006 after the new code is deployed and verified.
