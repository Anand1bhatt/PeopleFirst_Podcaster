export type SourceType = "url" | "text";

export type Source = {
  id: string;
  type: SourceType;
  value: string; // URL or raw text content
  title?: string; // extracted title for URLs
  /** Figma multi-section feed: topic label for dialogue bridges */
  briefing_section?: string;
};

export type DialogueSpeaker = "akshay" | "kriti";

export type DialogueTurn = {
  speaker: DialogueSpeaker;
  text: string;
  /** Brief pause in audio before this line (Azure SSML break when available) */
  section_break?: boolean;
};

export type SummaryOutput = {
  headline: string;
  summary_points: string[];
  /** Flat transcript for storage / single-voice fallback */
  audio_script: string;
  /** Two-host dialogue for dual-voice TTS (length scales with source count, up to ~3 min) */
  dialogue_turns?: DialogueTurn[];
};

export type BriefingStatus = "pending" | "extracting" | "summarizing" | "generating_audio" | "completed" | "failed";

/** Shown in the loading UI while the pipeline runs */
export type PipelineProgress = {
  /** 0–100 approximate completion */
  percent: number;
  /** Which major phase is active */
  step_key: "queue" | "sources" | "summarize" | "audio";
  /** Short status line, e.g. “Fetching from bbc.com…” */
  message: string;
  /** Source being scanned (0-based), during extract */
  source_index?: number;
  source_total?: number;
  /** URL hostname during extract, for favicon */
  active_host?: string | null;
  active_source_type?: "url" | "text";
};

/** User-chosen voice engine; pipeline falls back in order (e.g. ElevenLabs → Microsoft → OpenAI). */
export type TtsProvider = "elevenlabs" | "microsoft";

/** Briefing audio + transcript language. Haryanvi uses hi-IN TTS + dialectal dialogue. */
export type OutputLanguage = "en" | "hi" | "mr" | "pa" | "bn" | "hi-haryanvi";

export const OUTPUT_LANGUAGES: OutputLanguage[] = [
  "en",
  "hi",
  "mr",
  "pa",
  "bn",
  "hi-haryanvi",
];

export function parseOutputLanguage(raw: unknown): OutputLanguage {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === "hi-haryanvi" || OUTPUT_LANGUAGES.includes(s as OutputLanguage))
    return s as OutputLanguage;
  return "en";
}

export type Briefing = {
  id: string;
  status: BriefingStatus;
  sources: Source[];
  summary?: SummaryOutput | null;
  audio_url?: string | null;
  error?: string | null;
  created_at: string;
  updated_at: string;
};

export type BriefingInsert = Omit<Briefing, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};
