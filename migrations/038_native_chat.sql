-- ============================================================
-- 038 — NATIVE CHAT (remplace Chatwoot)
-- ============================================================
-- Adapte du chat natif de cardynal-app pour le schema yedid.
--
-- Differences cle vs cardynal:
--   - Pas d'org_id ni d'organizations: scope par user_id (BIGINT)
--   - Pas d'org_agents ni de contacts: agent = users, contact = leads
--   - chat_conversations.contact_id REFERENCES leads(id) (BIGINT)
--   - chat_messages.agent_id REFERENCES users(id) (BIGINT)
--
-- Cohabite avec les tables Chatwoot existantes (inboxes, chatwoot_accounts,
-- sessions). Le cleanup Chatwoot se fera dans une migration ulterieure.
-- ============================================================

-- ============================================================
-- 0. EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. ENUMS
-- ============================================================

-- Canaux supportes:
--   website         : widget web embarque
--   api             : canal generique (integrations custom)
--   gmail           : email via Gmail
--   whatsapp_unipile: WhatsApp via Unipile (compte perso/business)
--   whatsapp_business_manual: WhatsApp Business Cloud API (Meta direct)
DO $$ BEGIN
    CREATE TYPE channel_type_enum AS ENUM (
        'website',
        'api',
        'gmail',
        'whatsapp_unipile',
        'whatsapp_business_manual'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE conversation_status AS ENUM ('open', 'pending', 'resolved', 'snoozed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE sender_type AS ENUM ('contact', 'agent', 'bot');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE message_content_type AS ENUM ('text', 'image', 'file', 'audio', 'video', 'template', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE conversation_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE delivery_status AS ENUM ('sent', 'delivered', 'read', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 2. CHAT_INBOXES (multi-canal par user)
-- ============================================================
-- Coexiste avec la table `inboxes` Chatwoot pendant la transition.
CREATE TABLE IF NOT EXISTS chat_inboxes (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    channel_type      channel_type_enum NOT NULL DEFAULT 'website',
    agent_bot_id      BIGINT REFERENCES agent_bots(id) ON DELETE SET NULL,
    config            JSONB DEFAULT '{}'::jsonb,
    greeting_message  TEXT,
    is_active         BOOLEAN DEFAULT true,
    -- AI availability
    ai_enabled        BOOLEAN DEFAULT true,
    ai_schedule       JSONB,                -- { "0": [bool x24], ..., "6": [...] }
    ai_timezone       TEXT,                 -- IANA tz
    -- WhatsApp Unipile binding (etait a la racine de l'ancienne table inboxes)
    unipile_account_id TEXT,
    phone_number      TEXT,
    widget_locale     TEXT,
    -- Sync tracking
    last_sync_at      TIMESTAMPTZ,
    sync_status       TEXT,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_inboxes_user ON chat_inboxes(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_inboxes_user_active ON chat_inboxes(user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_chat_inboxes_ai_enabled ON chat_inboxes(user_id, ai_enabled) WHERE ai_enabled = false;
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_inboxes_unipile_account
    ON chat_inboxes(unipile_account_id) WHERE unipile_account_id IS NOT NULL;

-- ============================================================
-- 3. CHAT_CONVERSATIONS
-- ============================================================
-- contact_id pointe sur leads(id): un lead est un contact.
-- assigned_agent_id pointe sur users(id): un agent est un user.
CREATE TABLE IF NOT EXISTS chat_conversations (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id            BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    inbox_id           UUID REFERENCES chat_inboxes(id) ON DELETE SET NULL,
    contact_id         BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    channel            channel_type_enum NOT NULL DEFAULT 'website',
    status             conversation_status DEFAULT 'open',
    priority           conversation_priority DEFAULT 'medium',
    assigned_agent_id  BIGINT REFERENCES users(id) ON DELETE SET NULL,
    subject            TEXT,
    metadata           JSONB DEFAULT '{}'::jsonb,
    -- Compteur denormalise (MAJ par trigger)
    unread_count       INTEGER DEFAULT 0,
    -- AI override per-conversation
    ai_disabled        BOOLEAN DEFAULT false,
    first_message_at   TIMESTAMPTZ,
    last_message_at    TIMESTAMPTZ,
    resolved_at        TIMESTAMPTZ,
    snoozed_until      TIMESTAMPTZ,
    created_at         TIMESTAMPTZ DEFAULT now(),
    updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_conv_user_status ON chat_conversations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_chat_conv_user_agent ON chat_conversations(user_id, assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_chat_conv_contact ON chat_conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_chat_conv_last_msg ON chat_conversations(user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conv_inbox ON chat_conversations(inbox_id) WHERE inbox_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_conv_snoozed ON chat_conversations(snoozed_until) WHERE snoozed_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_conv_ai_disabled ON chat_conversations(user_id, ai_disabled) WHERE ai_disabled = true;

-- ============================================================
-- 4. CHAT_MESSAGES
-- ============================================================
-- contact_id ON DELETE CASCADE (cf. cardynal migration 064): la check
-- contrainte interdit contact_id NULL sur sender_type='contact', donc SET NULL
-- echouerait. CASCADE est coherent avec chat_conversations.contact_id CASCADE.
CREATE TABLE IF NOT EXISTS chat_messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_type     sender_type NOT NULL,
    agent_id        BIGINT REFERENCES users(id) ON DELETE SET NULL,
    contact_id      BIGINT REFERENCES leads(id) ON DELETE CASCADE,
    -- Contenu
    content_type    message_content_type DEFAULT 'text',
    content         TEXT,
    attachments     JSONB DEFAULT '[]'::jsonb,
    metadata        JSONB DEFAULT '{}'::jsonb,
    is_private      BOOLEAN DEFAULT false,
    -- WhatsApp/external delivery tracking
    delivery_status delivery_status,
    external_id     TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_sender_ref CHECK (
        (sender_type = 'agent'   AND agent_id   IS NOT NULL AND contact_id IS NULL) OR
        (sender_type = 'contact' AND contact_id IS NOT NULL AND agent_id   IS NULL) OR
        (sender_type = 'bot'     AND agent_id   IS NULL     AND contact_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_chat_msg_conversation ON chat_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_msg_user ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_msg_external ON chat_messages(external_id) WHERE external_id IS NOT NULL;

-- ============================================================
-- 5. TRIGGERS
-- ============================================================

-- updated_at automatique
CREATE OR REPLACE FUNCTION chat_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    CREATE TRIGGER trg_chat_inboxes_updated_at
        BEFORE UPDATE ON chat_inboxes
        FOR EACH ROW EXECUTE FUNCTION chat_update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_chat_conversations_updated_at
        BEFORE UPDATE ON chat_conversations
        FOR EACH ROW EXECUTE FUNCTION chat_update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- MAJ conversation quand un message arrive
CREATE OR REPLACE FUNCTION on_chat_new_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE chat_conversations
    SET
        last_message_at  = NEW.created_at,
        first_message_at = COALESCE(first_message_at, NEW.created_at),
        -- Contact reouvre une conv resolved
        status = CASE
            WHEN status = 'resolved' AND NEW.sender_type = 'contact'
            THEN 'open'::conversation_status
            ELSE status
        END,
        -- Unread: incremente si contact, reset si agent/bot (sauf private)
        unread_count = CASE
            WHEN NEW.sender_type = 'contact' AND NOT NEW.is_private
            THEN unread_count + 1
            WHEN NEW.sender_type IN ('agent', 'bot') AND NOT NEW.is_private
            THEN 0
            ELSE unread_count
        END,
        updated_at = now()
    WHERE id = NEW.conversation_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    CREATE TRIGGER trg_on_chat_new_message
        AFTER INSERT ON chat_messages
        FOR EACH ROW EXECUTE FUNCTION on_chat_new_message();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 6. RLS (service_role bypass, coherent avec le reste de yedid)
-- ============================================================
ALTER TABLE chat_inboxes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages     ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "service_role_all_chat_inboxes" ON chat_inboxes
        FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "service_role_all_chat_conversations" ON chat_conversations
        FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "service_role_all_chat_messages" ON chat_messages
        FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 7. REALTIME
-- ============================================================
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_conversations;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_inboxes;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;

-- ============================================================
-- NOTES
-- ============================================================
-- Migration 100% additive. Aucune donnee Chatwoot supprimee.
-- Strategie de bascule: tester sur un user de test, puis basculer en bloc
-- (suppression des routes/tables Chatwoot dans une migration ulterieure).
-- Tables/colonnes Chatwoot a supprimer apres bascule:
--   chatwoot_accounts, inboxes, colonnes chatwoot_conversation_id sur
--   leads/sessions/branches.
-- ============================================================
