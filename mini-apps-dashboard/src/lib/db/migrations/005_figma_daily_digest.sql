-- Daily digest for Figma newsfeed (cached LLM summaries per calendar day + language)
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
