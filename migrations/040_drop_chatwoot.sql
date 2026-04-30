-- ============================================================
-- 040 — DROP CHATWOOT (DESTRUCTIVE — DO NOT RUN UNTIL VALIDATED)
-- ============================================================
-- Cette migration supprime toutes les structures liees a Chatwoot.
-- Prerequis avant de l'executer:
--   1. NATIVE_CHAT_ENABLED=true en prod depuis au moins 7 jours
--   2. NATIVE_CHAT_INBOXES vide (= tous les inboxes routes en natif)
--   3. Aucune relance Chatwoot recente (verifier
--      followup_queue WHERE chatwoot_conversation_id IS NOT NULL
--      AND processed_at > now()-interval '7 days')
--   4. Backup de la base
--
-- Apres execution, deployer le commit qui retire le code Chatwoot
-- (server/chatwoot.js, server/engine/chatwoot-messaging.js, route
-- /api/webhook/chatwoot, fallbacks Chatwoot dans followup/dispatch).
-- ============================================================

BEGIN;

-- ─── 1. Drop columns referencing Chatwoot ─────────────────
ALTER TABLE leads        DROP COLUMN IF EXISTS chatwoot_conversation_id;
ALTER TABLE branches     DROP COLUMN IF EXISTS chatwoot_conversation_id;
ALTER TABLE followup_queue DROP COLUMN IF EXISTS chatwoot_conversation_id;

-- sessions: 3 colonnes Chatwoot
ALTER TABLE sessions DROP COLUMN IF EXISTS chatwoot_account_id;
ALTER TABLE sessions DROP COLUMN IF EXISTS chatwoot_inbox_id;
ALTER TABLE sessions DROP COLUMN IF EXISTS chatwoot_conversation_id;

-- agent_bots: bot_id et bot_token sont Chatwoot-only
ALTER TABLE agent_bots DROP COLUMN IF EXISTS chatwoot_account_id;
ALTER TABLE agent_bots DROP COLUMN IF EXISTS bot_id;
ALTER TABLE agent_bots DROP COLUMN IF EXISTS bot_token;
ALTER TABLE agent_bots DROP COLUMN IF EXISTS outgoing_url;

-- ─── 2. Drop Chatwoot tables ──────────────────────────────
-- inboxes (Chatwoot bridge table) — chat_inboxes est le successeur natif
DROP TABLE IF EXISTS inboxes CASCADE;
-- chatwoot_accounts (1:1 user↔compte Chatwoot)
DROP TABLE IF EXISTS chatwoot_accounts CASCADE;

COMMIT;

-- ============================================================
-- ROLLBACK MANUEL si necessaire:
--   Restaurer le backup pris avant l'execution. Les colonnes/tables
--   ne peuvent pas etre re-creees a l'identique sans backup (les
--   donnees Chatwoot id/tokens sont perdues).
-- ============================================================
