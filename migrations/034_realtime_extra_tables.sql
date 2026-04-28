-- Migration 034: extend supabase_realtime publication with the tables the frontend
-- now invalidates on. Without this the SSE bridge in server/routes/realtime.js subscribes
-- to postgres_changes for these tables but Postgres never sends anything → frontend caches
-- go stale until manual refetch.

ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS users;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS branches;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS user_branches;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS playbooks;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS tools;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS escalation_rules;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS dispatch_config;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS followup_config;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS followup_queue;
