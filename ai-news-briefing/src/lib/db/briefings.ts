import { supabase } from "./client";
import type { BriefingRow, BriefingSourceRow } from "./client";
import {
  devBriefingWrite,
  devBriefingRead,
  devBriefingListAll,
  type DevBriefingEntry,
} from "./dev-briefing-store";
import type {
  Source,
  SummaryOutput,
  BriefingStatus,
  TtsProvider,
  DialogueTurn,
  PipelineProgress,
  OutputLanguage,
} from "@/types";
import { parseOutputLanguage } from "@/types";
import { normalizeDialogueSpeaker } from "@/lib/dialogue-speakers";

type MemoryBriefing = DevBriefingEntry;

const FIGMA_DIGEST_IN_PROGRESS: BriefingStatus[] = [
  "pending",
  "extracting",
  "summarizing",
  "generating_audio",
];

export type CreateBriefingOptions = {
  /** YYYY-MM-DD when this job is the figma feed conversation for that calendar day. */
  figmaDigestDate?: string;
};

/** Server-side reuse for figma day briefing: completed audio or an existing in-flight job. */
export type FigmaDigestReuseResult =
  | { kind: "completed"; id: string; audio_url: string }
  | { kind: "in_progress"; id: string }
  | null;

export type BriefingWithSources = {
  id: string;
  status: BriefingStatus;
  tts_provider: TtsProvider;
  output_language: OutputLanguage;
  sources: Source[];
  summary: SummaryOutput | null;
  audio_url: string | null;
  error: string | null;
  pipeline_progress: PipelineProgress | null;
  created_at: string;
  updated_at: string;
};

// In-process cache; disk in .briefing-dev-store/ is source of truth when no Supabase
const memoryStore = new Map<string, MemoryBriefing>();

function parseDialogueTurns(raw: unknown): DialogueTurn[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: DialogueTurn[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") return undefined;
    const mapped = normalizeDialogueSpeaker(
      String((row as { speaker?: string }).speaker ?? "")
    );
    const t = String((row as { text?: string }).text ?? "").trim();
    if (!mapped) return undefined;
    if (t.length < 1) return undefined;
    const section_break = Boolean((row as { section_break?: boolean }).section_break);
    out.push(
      section_break
        ? { speaker: mapped, text: t, section_break: true }
        : { speaker: mapped, text: t }
    );
  }
  return out.length ? out : undefined;
}

function parsePipelineProgress(raw: unknown): PipelineProgress | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const percent = Number(o.percent);
  const step_key = o.step_key;
  const message = typeof o.message === "string" ? o.message : "";
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  if (step_key !== "queue" && step_key !== "sources" && step_key !== "summarize" && step_key !== "audio")
    return null;
  const p: PipelineProgress = {
    percent: Math.round(percent),
    step_key,
    message: message.slice(0, 280),
  };
  if (typeof o.source_index === "number") p.source_index = o.source_index;
  if (typeof o.source_total === "number") p.source_total = o.source_total;
  if (o.active_host === null || typeof o.active_host === "string") p.active_host = o.active_host ?? null;
  if (o.active_source_type === "url" || o.active_source_type === "text")
    p.active_source_type = o.active_source_type;
  return p;
}

function rowToBriefing(row: BriefingRow, sourceRows: BriefingSourceRow[]): BriefingWithSources {
  const sources: Source[] = sourceRows
    .filter((s) => s.briefing_id === row.id)
    .map((s) => ({
      id: s.id,
      type: s.type as "url" | "text",
      value: s.value,
      title: s.title ?? undefined,
      briefing_section: s.briefing_section?.trim() || undefined,
    }));
  const tp = row.tts_provider;
  const tts_provider: TtsProvider =
    tp === "microsoft" ? "microsoft" : "elevenlabs";
  return {
    id: row.id,
    status: row.status as BriefingStatus,
    tts_provider,
    output_language: parseOutputLanguage(row.output_language),
    sources,
    summary:
      row.summary_headline != null
        ? {
            headline: row.summary_headline,
            summary_points: Array.isArray(row.summary_points) ? row.summary_points : [],
            audio_script: row.audio_script ?? "",
            dialogue_turns: parseDialogueTurns(row.dialogue_turns),
          }
        : null,
    audio_url: row.audio_url,
    error: row.error_message,
    pipeline_progress: parsePipelineProgress(row.pipeline_progress),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowMatchesFigmaDigest(
  row: BriefingRow,
  digestDate: string,
  ttsProvider: TtsProvider,
  outputLanguage: OutputLanguage
): boolean {
  const ymd = row.figma_digest_date?.trim().slice(0, 10);
  if (!ymd || ymd !== digestDate) return false;
  const tp: TtsProvider = row.tts_provider === "microsoft" ? "microsoft" : "elevenlabs";
  if (tp !== ttsProvider) return false;
  return parseOutputLanguage(row.output_language) === outputLanguage;
}

async function loadAllDevBriefingEntries(): Promise<MemoryBriefing[]> {
  const disk = await devBriefingListAll();
  const byId = new Map<string, MemoryBriefing>();
  for (const e of disk) byId.set(e.row.id, e);
  for (const e of memoryStore.values()) byId.set(e.row.id, e);
  return Array.from(byId.values());
}

/**
 * Find a figma-digest briefing to reuse: latest completed with audio, else latest in-progress.
 * Ignores `failed` rows so a new generation can start after errors.
 */
export async function findFigmaDigestBriefingForReuse(
  digestDate: string,
  ttsProvider: TtsProvider,
  outputLanguage: OutputLanguage = "en"
): Promise<FigmaDigestReuseResult> {
  const date = digestDate.slice(0, 10);

  if (supabase) {
    const { data: completed, error: cErr } = await supabase
      .from("briefings")
      .select("id, audio_url")
      .eq("figma_digest_date", date)
      .eq("tts_provider", ttsProvider)
      .eq("output_language", outputLanguage)
      .eq("status", "completed")
      .not("audio_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    if (cErr) {
      console.error("[briefings] findFigmaDigest completed:", cErr.message);
    } else {
      const row = completed?.[0];
      const url = row && typeof row.audio_url === "string" ? row.audio_url.trim() : "";
      if (row?.id && url) return { kind: "completed", id: row.id, audio_url: url };
    }

    const { data: inflight, error: iErr } = await supabase
      .from("briefings")
      .select("id")
      .eq("figma_digest_date", date)
      .eq("tts_provider", ttsProvider)
      .eq("output_language", outputLanguage)
      .in("status", [...FIGMA_DIGEST_IN_PROGRESS])
      .order("created_at", { ascending: false })
      .limit(1);
    if (iErr) {
      console.error("[briefings] findFigmaDigest in_progress:", iErr.message);
      return null;
    }
    const ir = inflight?.[0];
    if (ir?.id) return { kind: "in_progress", id: ir.id };
    return null;
  }

  const entries = await loadAllDevBriefingEntries();
  const matching = entries
    .map((e) => e.row)
    .filter((r) => rowMatchesFigmaDigest(r, date, ttsProvider, outputLanguage))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  for (const r of matching) {
    if (r.status === "completed") {
      const url = r.audio_url?.trim() ?? "";
      if (url) return { kind: "completed", id: r.id, audio_url: url };
    }
  }
  for (const r of matching) {
    if (FIGMA_DIGEST_IN_PROGRESS.includes(r.status as BriefingStatus)) {
      return { kind: "in_progress", id: r.id };
    }
  }
  return null;
}

export async function createBriefing(
  sources: Omit<Source, "id">[],
  ttsProvider: TtsProvider = "elevenlabs",
  outputLanguage: OutputLanguage = "en",
  options?: CreateBriefingOptions
): Promise<string | null> {
  if (supabase) {
    const insertRow: Record<string, unknown> = {
      status: "pending",
      tts_provider: ttsProvider,
      output_language: outputLanguage,
    };
    if (options?.figmaDigestDate?.trim()) {
      insertRow.figma_digest_date = options.figmaDigestDate.trim().slice(0, 10);
    }
    const { data: briefing, error: briefingError } = await supabase
      .from("briefings")
      .insert(insertRow)
      .select("id")
      .single();
    if (briefingError || !briefing) return null;
    const sourceRows = sources.map((s) => ({
      briefing_id: briefing.id,
      type: s.type,
      value: s.value,
      title: s.title ?? null,
      briefing_section: s.briefing_section?.trim() || null,
    }));
    const { error: sourcesError } = await supabase.from("briefing_sources").insert(sourceRows);
    if (sourcesError) return null;
    return briefing.id;
  }
  // In-memory fallback for localhost without Supabase
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const row: BriefingRow = {
    id,
    status: "pending",
    tts_provider: ttsProvider,
    output_language: outputLanguage,
    summary_headline: null,
    summary_points: null,
    audio_script: null,
    dialogue_turns: null,
    audio_url: null,
    error_message: null,
    pipeline_progress: null,
    figma_digest_date: options?.figmaDigestDate?.trim().slice(0, 10) ?? null,
    created_at: now,
    updated_at: now,
  };
  const sourceRows: BriefingSourceRow[] = sources.map((s, i) => ({
    id: crypto.randomUUID(),
    briefing_id: id,
    type: s.type,
    value: s.value,
    title: s.title ?? null,
    briefing_section: s.briefing_section?.trim() || null,
    created_at: now,
  }));
  const entry = { row, sourceRows };
  memoryStore.set(id, entry);
  await devBriefingWrite(entry).catch((e) =>
    console.error("[briefings] dev disk write failed", e)
  );
  return id;
}

export async function updateBriefingStatus(
  id: string,
  status: BriefingStatus,
  updates?: {
    summary_headline?: string;
    summary_points?: string[];
    audio_script?: string;
    dialogue_turns?: DialogueTurn[] | null;
    audio_url?: string;
    error_message?: string;
  }
): Promise<boolean> {
  if (supabase) {
    const payload: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (updates?.summary_headline != null) payload.summary_headline = updates.summary_headline;
    if (updates?.summary_points != null) payload.summary_points = updates.summary_points;
    if (updates?.audio_script != null) payload.audio_script = updates.audio_script;
    if (updates?.dialogue_turns !== undefined)
      payload.dialogue_turns = updates.dialogue_turns;
    if (updates?.audio_url != null) payload.audio_url = updates.audio_url;
    if (updates?.error_message != null) payload.error_message = updates.error_message;
    if (status === "completed" || status === "failed") payload.pipeline_progress = null;
    const { error } = await supabase.from("briefings").update(payload).eq("id", id);
    return !error;
  }
  let entry = memoryStore.get(id);
  if (!entry) {
    const fromDisk = await devBriefingRead(id);
    if (fromDisk) {
      memoryStore.set(id, fromDisk);
      entry = fromDisk;
    }
  }
  if (!entry) return false;
  const now = new Date().toISOString();
  entry.row.status = status;
  entry.row.updated_at = now;
  if (updates?.summary_headline != null) entry.row.summary_headline = updates.summary_headline;
  if (updates?.summary_points != null) entry.row.summary_points = updates.summary_points;
  if (updates?.audio_script != null) entry.row.audio_script = updates.audio_script;
  if (updates?.dialogue_turns !== undefined)
    entry.row.dialogue_turns = updates.dialogue_turns as unknown[] | null;
  if (updates?.audio_url != null) entry.row.audio_url = updates.audio_url;
  if (updates?.error_message != null) entry.row.error_message = updates.error_message;
  if (status === "completed" || status === "failed") entry.row.pipeline_progress = null;
  await devBriefingWrite(entry).catch((e) =>
    console.error("[briefings] dev disk write failed", e)
  );
  return true;
}

/** Update loading UI fields without changing status (e.g. per-source extract). */
export async function updateBriefingProgress(
  id: string,
  progress: PipelineProgress | null
): Promise<boolean> {
  if (supabase) {
    const payload: Record<string, unknown> = {
      pipeline_progress: progress,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("briefings").update(payload).eq("id", id);
    return !error;
  }
  let entry = memoryStore.get(id);
  if (!entry) {
    const fromDisk = await devBriefingRead(id);
    if (fromDisk) {
      memoryStore.set(id, fromDisk);
      entry = fromDisk;
    }
  }
  if (!entry) return false;
  entry.row.pipeline_progress = progress;
  entry.row.updated_at = new Date().toISOString();
  await devBriefingWrite(entry).catch((e) =>
    console.error("[briefings] dev disk write failed", e)
  );
  return true;
}

export async function getBriefing(id: string): Promise<BriefingWithSources | null> {
  if (supabase) {
    const { data: row, error } = await supabase
      .from("briefings")
      .select("*")
      .eq("id", id)
      .single();
    if (error) {
      console.error("[briefings] Supabase read failed (check RLS policies):", error.message);
      return null;
    }
    if (!row) return null;
    const { data: sourceRows, error: srcErr } = await supabase
      .from("briefing_sources")
      .select("*")
      .eq("briefing_id", id);
    if (srcErr) {
      console.error("[briefings] Supabase sources read:", srcErr.message);
      return null;
    }
    return rowToBriefing(row as BriefingRow, (sourceRows ?? []) as BriefingSourceRow[]);
  }
  let entry = memoryStore.get(id);
  if (!entry) {
    const fromDisk = await devBriefingRead(id);
    if (fromDisk) {
      memoryStore.set(id, fromDisk);
      entry = fromDisk;
    }
  }
  if (!entry) return null;
  return rowToBriefing(entry.row, entry.sourceRows);
}

export async function listBriefings(limit = 20): Promise<BriefingWithSources[]> {
  if (supabase) {
    const { data: rows, error } = await supabase
      .from("briefings")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !rows?.length) return [];
    const ids = (rows as BriefingRow[]).map((r) => r.id);
    const { data: sourceRows } = await supabase
      .from("briefing_sources")
      .select("*")
      .in("briefing_id", ids);
    const allSources = (sourceRows ?? []) as BriefingSourceRow[];
    return (rows as BriefingRow[]).map((r) =>
      rowToBriefing(r, allSources.filter((s) => s.briefing_id === r.id))
    );
  }
  const disk = await devBriefingListAll();
  const byId = new Map<string, MemoryBriefing>();
  for (const e of disk) byId.set(e.row.id, e);
  for (const e of memoryStore.values()) byId.set(e.row.id, e);
  const all = Array.from(byId.values())
    .map(({ row, sourceRows }) => rowToBriefing(row, sourceRows))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return all.slice(0, limit);
}
