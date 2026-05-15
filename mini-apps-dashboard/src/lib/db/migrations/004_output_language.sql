ALTER TABLE briefings
  ADD COLUMN IF NOT EXISTS output_language TEXT NOT NULL DEFAULT 'en'
  CHECK (output_language IN ('en', 'hi', 'mr', 'pa', 'bn', 'hi-haryanvi'));
