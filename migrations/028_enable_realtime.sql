-- Migration 028: Enable Supabase Realtime on key tables
-- Backend SSE endpoint subscribes to postgres_changes and pushes to frontend

ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS leads;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS lead_activities;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS lead_affiliations;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS lead_documents;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS conversation_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS calls;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS agent_bots;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS inboxes;
