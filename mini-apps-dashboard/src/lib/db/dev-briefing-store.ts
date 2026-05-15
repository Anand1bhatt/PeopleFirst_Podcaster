/**
 * When Supabase is not configured, briefings are stored here so GET/POST/workers
 * share state (in-memory Maps are per-process — Next dev uses multiple workers → 404).
 */
import fs from "fs/promises";
import path from "path";
import type { BriefingRow, BriefingSourceRow } from "./client";

export type DevBriefingEntry = { row: BriefingRow; sourceRows: BriefingSourceRow[] };

const dir = () => path.join(process.cwd(), ".briefing-dev-store");

function filePath(id: string) {
  return path.join(dir(), `${id}.json`);
}

export async function devBriefingWrite(entry: DevBriefingEntry): Promise<void> {
  await fs.mkdir(dir(), { recursive: true });
  await fs.writeFile(filePath(entry.row.id), JSON.stringify(entry), "utf-8");
}

export async function devBriefingRead(id: string): Promise<DevBriefingEntry | null> {
  try {
    const raw = await fs.readFile(filePath(id), "utf-8");
    return JSON.parse(raw) as DevBriefingEntry;
  } catch {
    return null;
  }
}

export async function devAudioWrite(briefingId: string, buffer: Buffer): Promise<void> {
  await fs.mkdir(path.join(dir(), "audio"), { recursive: true });
  await fs.writeFile(path.join(dir(), "audio", `${briefingId}.mp3`), buffer);
}

export async function devAudioRead(briefingId: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(path.join(dir(), "audio", `${briefingId}.mp3`));
  } catch {
    return null;
  }
}

export async function devBriefingListAll(): Promise<DevBriefingEntry[]> {
  let names: string[] = [];
  try {
    names = await fs.readdir(dir());
  } catch {
    return [];
  }
  const out: DevBriefingEntry[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -5);
    const e = await devBriefingRead(id);
    if (e) out.push(e);
  }
  return out;
}
