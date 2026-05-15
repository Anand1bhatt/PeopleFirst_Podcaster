-- Supabase/PostgreSQL schema for AI News Briefing
-- Run this in Supabase SQL editor or your Postgres client

-- Briefings: each generation job
CREATE TABLE IF NOT EXISTS briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'extracting', 'summarizing', 'generating_audio', 'completed', 'failed')),
  tts_provider TEXT NOT NULL DEFAULT 'elevenlabs' CHECK (tts_provider IN ('elevenlabs', 'microsoft')),
  output_language TEXT NOT NULL DEFAULT 'en' CHECK (output_language IN ('en', 'hi', 'mr', 'pa', 'bn', 'hi-haryanvi')),
  summary_headline TEXT,
  summary_points JSONB,
  audio_script TEXT,
  dialogue_turns JSONB,
  audio_url TEXT,
  error_message TEXT,
  pipeline_progress JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sources: URLs or raw text per briefing
CREATE TABLE IF NOT EXISTS briefing_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_id UUID NOT NULL REFERENCES briefings(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('url', 'text')),
  value TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_briefing_sources_briefing_id ON briefing_sources(briefing_id);
CREATE INDEX IF NOT EXISTS idx_briefings_created_at ON briefings(created_at DESC);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS briefings_updated_at ON briefings;
CREATE TRIGGER briefings_updated_at
  BEFORE UPDATE ON briefings
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

ALTER TABLE briefing_sources ADD COLUMN IF NOT EXISTS briefing_section TEXT;

CREATE TABLE IF NOT EXISTS figma_daily_digest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_date DATE NOT NULL,
  lang TEXT NOT NULL CHECK (lang IN ('en', 'hi')),
  sections_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  day_summary TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (digest_date, lang)
);

CREATE INDEX IF NOT EXISTS idx_figma_daily_digest_date ON figma_daily_digest (digest_date DESC);

DROP TRIGGER IF EXISTS figma_daily_digest_updated_at ON figma_daily_digest;
CREATE TRIGGER figma_daily_digest_updated_at
  BEFORE UPDATE ON figma_daily_digest
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
