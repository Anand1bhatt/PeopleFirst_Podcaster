-- Run once if your `briefings` table was created before tts_provider existed.
ALTER TABLE briefings
  ADD COLUMN IF NOT EXISTS tts_provider TEXT DEFAULT 'elevenlabs';

UPDATE briefings SET tts_provider = 'elevenlabs' WHERE tts_provider IS NULL;

ALTER TABLE briefings
  ALTER COLUMN tts_provider SET DEFAULT 'elevenlabs';

-- Optional: enforce NOT NULL after backfill (may fail if any row still null)
-- ALTER TABLE briefings ALTER COLUMN tts_provider SET NOT NULL;
