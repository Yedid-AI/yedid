-- Migration 003: Cleanup — supprimer colonnes obsoletes apres deploiement du nouveau code
-- A executer uniquement APRES que le code restructure est deploye et fonctionne

-- Supprimer bot_token de inboxes (deplace vers agent_bots)
ALTER TABLE inboxes DROP COLUMN IF EXISTS bot_token;

-- Supprimer user_id de playbooks (scope via agent_bot_id maintenant)
ALTER TABLE playbooks DROP COLUMN IF EXISTS user_id;

-- Supprimer user_id de tools (scope via agent_bot_id maintenant)
ALTER TABLE tools DROP COLUMN IF EXISTS user_id;

-- Supprimer user_id de escalation_rules (scope via agent_bot_id maintenant)
ALTER TABLE escalation_rules DROP COLUMN IF EXISTS user_id;
