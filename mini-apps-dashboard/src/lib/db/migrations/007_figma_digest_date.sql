-- Tie figma "day" conversation briefings to a calendar date for reuse (one completed audio per day).
ALTER TABLE briefings
  ADD COLUMN IF NOT EXISTS figma_digest_date DATE;

CREATE INDEX IF NOT EXISTS idx_briefings_figma_digest_date
  ON briefings (figma_digest_date, tts_provider, output_language, status);
