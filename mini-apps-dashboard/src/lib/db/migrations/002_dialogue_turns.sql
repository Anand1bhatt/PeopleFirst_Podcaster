-- Optional: two-host dialogue for transcript / dual-voice TTS
ALTER TABLE briefings
  ADD COLUMN IF NOT EXISTS dialogue_turns JSONB;
