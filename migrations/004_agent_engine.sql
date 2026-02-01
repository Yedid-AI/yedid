-- Migration 004: Agent Engine — LLM provider/model config + vector search RPC
-- Run after deploying the agent engine code

-- 1. Add LLM provider and model columns to agent_config
ALTER TABLE agent_config ADD COLUMN IF NOT EXISTS llm_provider VARCHAR(20) DEFAULT 'openai';
ALTER TABLE agent_config ADD COLUMN IF NOT EXISTS llm_model VARCHAR(50) DEFAULT 'gpt-4.1-mini';

-- 2. Create vector search RPC function (requires pgvector extension)
-- This function is used by the knowledge base search in the agent engine.
-- If match_vectors already exists, this will replace it.
CREATE OR REPLACE FUNCTION match_vectors(
  query_embedding vector(1536),
  match_count int DEFAULT 5,
  filter_user_id text DEFAULT NULL
)
RETURNS TABLE (id uuid, content text, similarity float)
LANGUAGE sql STABLE
AS $$
  SELECT
    vs.id,
    vs.content,
    1 - (vs.embedding <=> query_embedding) AS similarity
  FROM vector_store vs
  WHERE (filter_user_id IS NULL OR vs.metadata->>'user_id' = filter_user_id)
  ORDER BY vs.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- 3. Remove N8N-related settings (optional cleanup)
-- DELETE FROM settings WHERE key IN ('N8N_AGENT_WEBHOOK_URL', 'N8N_BASE_URL', 'N8N_API_KEY');
