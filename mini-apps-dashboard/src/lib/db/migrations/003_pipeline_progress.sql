-- Live pipeline progress for loading UI (percent, current source, etc.)
ALTER TABLE briefings
  ADD COLUMN IF NOT EXISTS pipeline_progress JSONB;
