import fs from "fs/promises";
import path from "path";
import { supabase } from "./client";

export type FigmaDigestSectionStored = {
  key: string;
  title: string;
  blurb: string;
  articles: { url: string; title: string; source: string }[];
};

export type FigmaDigestRow = {
  digest_date: string;
  lang: "en" | "hi";
  day_summary: string;
  sections_json: FigmaDigestSectionStored[];
};

function digestDir() {
  return path.join(process.cwd(), ".briefing-dev-store", "digests");
}

function digestPath(date: string, lang: string) {
  return path.join(digestDir(), `${date}-${lang}.json`);
}

export async function figmaDigestRead(
  date: string,
  lang: "en" | "hi"
): Promise<FigmaDigestRow | null> {
  if (supabase) {
    const { data, error } = await supabase
      .from("figma_daily_digest")
      .select("digest_date, lang, day_summary, sections_json")
      .eq("digest_date", date)
      .eq("lang", lang)
      .maybeSingle();
    if (error || !data) return null;
    return {
      digest_date: data.digest_date,
      lang: data.lang as "en" | "hi",
      day_summary: data.day_summary ?? "",
      sections_json: Array.isArray(data.sections_json)
        ? (data.sections_json as FigmaDigestSectionStored[])
        : [],
    };
  }
  try {
    const raw = await fs.readFile(digestPath(date, lang), "utf-8");
    return JSON.parse(raw) as FigmaDigestRow;
  } catch {
    return null;
  }
}

export async function figmaDigestUpsert(row: FigmaDigestRow): Promise<void> {
  if (supabase) {
    const { error } = await supabase.from("figma_daily_digest").upsert(
      {
        digest_date: row.digest_date,
        lang: row.lang,
        day_summary: row.day_summary,
        sections_json: row.sections_json,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "digest_date,lang" }
    );
    if (error) throw new Error(error.message);
    return;
  }
  await fs.mkdir(digestDir(), { recursive: true });
  await fs.writeFile(digestPath(row.digest_date, row.lang), JSON.stringify(row, null, 2), "utf-8");
}

export async function figmaDigestList(lang: "en" | "hi", limit: number): Promise<FigmaDigestRow[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from("figma_daily_digest")
      .select("digest_date, lang, day_summary, sections_json")
      .eq("lang", lang)
      .order("digest_date", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map((d) => ({
      digest_date: d.digest_date,
      lang: d.lang as "en" | "hi",
      day_summary: d.day_summary ?? "",
      sections_json: Array.isArray(d.sections_json)
        ? (d.sections_json as FigmaDigestSectionStored[])
        : [],
    }));
  }
  let names: string[] = [];
  try {
    names = await fs.readdir(digestDir());
  } catch {
    return [];
  }
  const suffix = `-${lang}.json`;
  const rows: FigmaDigestRow[] = [];
  for (const name of names) {
    if (!name.endsWith(suffix)) continue;
    const date = name.slice(0, -suffix.length);
    const r = await figmaDigestRead(date, lang);
    if (r) rows.push(r);
  }
  rows.sort((a, b) => (a.digest_date < b.digest_date ? 1 : -1));
  return rows.slice(0, limit);
}
