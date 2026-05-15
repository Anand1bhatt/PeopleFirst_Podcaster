import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export type BriefingRow = {
  id: string;
  status: string;
  tts_provider: string | null;
  output_language?: string;
  summary_headline: string | null;
  summary_points: string[] | null;
  audio_script: string | null;
  /** Akshay/Kriti turns for transcript (JSON array); legacy alex/jamie normalized on read */
  dialogue_turns?: unknown[] | null;
  audio_url: string | null;
  error_message: string | null;
  pipeline_progress?: unknown;
  /** YYYY-MM-DD: figma feed conversation for this calendar day (enables server-side reuse). */
  figma_digest_date?: string | null;
  created_at: string;
  updated_at: string;
};

export type BriefingSourceRow = {
  id: string;
  briefing_id: string;
  type: string;
  value: string;
  title: string | null;
  briefing_section?: string | null;
  created_at: string;
};
