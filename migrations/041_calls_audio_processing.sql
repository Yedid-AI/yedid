-- Migration 041: Audio processing pipeline for answered calls without leads
-- Adds columns to track Whisper STT + LLM analysis on long-answered calls
-- where no lead was created within a short window after the call.

ALTER TABLE calls ADD COLUMN IF NOT EXISTS audio_processed_at TIMESTAMPTZ;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS transcript TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS transcript_analysis JSONB;

-- Index used by audio-pipeline to find candidates: long-answered, not yet processed.
-- Partial index keeps it tiny (only un-processed rows).
CREATE INDEX IF NOT EXISTS idx_calls_audio_pending
  ON calls(start_call DESC)
  WHERE audio_processed_at IS NULL AND call_duration >= 60;
