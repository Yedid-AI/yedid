-- Migration 038: Add list_services tool + cross-enterprise awareness
--
-- Issue: Aviezer bot couldn't enumerate Babait's services when a contact asked
-- "what does the other association do?". Same problem in reverse for Babait.
--
-- Fix: a single internal tool list_services(company?) that reads service_config
-- on demand. Both bots get the tool. Their global prompts gain a one-line
-- instruction to call it when asked about the other enterprise's services.

-- ============================================================
-- 1. Add list_services tool to both bots (idempotent)
-- ============================================================
INSERT INTO tools (agent_bot_id, name, description, type, handler, body_schema, emoji)
SELECT
  b.id,
  'רשימת שירותים',
  'List configured services from service_config. Pass company=babait or company=aviezer to filter, omit to return both. Use when the contact asks about services offered by the OTHER association (e.g. an Aviezer-bot user asking "what does Babait do").',
  'internal',
  'list_services',
  '{
    "type": "object",
    "properties": {
      "company": {
        "type": "string",
        "enum": ["babait","aviezer"],
        "description": "Optional. Filter by enterprise. Omit to return all active services."
      }
    }
  }'::jsonb,
  '🧩'
FROM agent_bots b
WHERE b.id IN (1, 2)
  AND NOT EXISTS (
    SELECT 1 FROM tools t WHERE t.agent_bot_id = b.id AND t.handler = 'list_services'
  );

-- ============================================================
-- 2. Patch agent_config prompts: cross-enterprise awareness
-- ============================================================

-- Babait bot — append note about Aviezer
UPDATE agent_config SET
  prompt = prompt || E'\n\n# שירותי אביעזר\nאם פונה שואל "מה אביעזר עושים" / "מה השירותים של אביעזר" — קראי ל-list_services עם company=aviezer והציעי בקצרה. אסור להמציא.',
  updated_at = NOW()
WHERE agent_bot_id = 1
  AND prompt NOT LIKE '%list_services עם company=aviezer%';

-- Aviezer bot — append note about Babait
UPDATE agent_config SET
  prompt = prompt || E'\n\n# שירותי בבית\nאם פונה שואל "מה בבית עושים" / "מה השירותים של עמותת בבית" — קראי ל-list_services עם company=babait והציעי בקצרה. אסור להמציא.',
  updated_at = NOW()
WHERE agent_bot_id = 2
  AND prompt NOT LIKE '%list_services עם company=babait%';
