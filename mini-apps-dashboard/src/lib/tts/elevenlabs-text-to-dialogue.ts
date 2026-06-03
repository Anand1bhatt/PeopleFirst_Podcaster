/**
 * ElevenLabs Text-to-Dialogue: one continuous MP3 for all turns (no per-turn MP3 splice glitches).
 * @see https://elevenlabs.io/docs/api-reference/text-to-dialogue
 */
import type { DialogueSpeaker, DialogueTurn } from "@/types";
import { mergeMp3Buffers } from "@/lib/tts/merge-mp3";
import { resolveDialogueVoiceIds } from "@/lib/tts/elevenlabs";

const MAX_CHARS_PER_REQUEST = 1900;

function elevenLabsV1Base(): string {
  const raw = (process.env.ELEVENLABS_API_BASE_URL ?? "https://api.elevenlabs.io")
    .trim()
    .replace(/\/$/, "");
  return `${raw}/v1`;
}

function normalizeApiKey(raw: string | undefined): string {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/^["']|["']$/g, "");
}

function isElevenLabsDialogueApiEnabled(): boolean {
  const raw = process.env.ELEVENLABS_USE_DIALOGUE_API?.trim();
  if (raw === "0" || /^false$/i.test(raw ?? "")) return false;
  return true;
}

function modelId(): string {
  return process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_multilingual_v2";
}

function outputFormat(): string {
  return process.env.ELEVENLABS_OUTPUT_FORMAT?.trim() || "mp3_44100_128";
}

function chunkTurns(turns: DialogueTurn[]): DialogueTurn[][] {
  const batches: DialogueTurn[][] = [];
  let current: DialogueTurn[] = [];
  let chars = 0;
  for (const turn of turns) {
    const add = turn.text.length + 8;
    if (current.length && chars + add > MAX_CHARS_PER_REQUEST) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(turn);
    chars += add;
  }
  if (current.length) batches.push(current);
  return batches;
}

async function postDialogue(
  inputs: { text: string; voice_id: string }[],
  apiKey: string,
  base: string
): Promise<Buffer | null> {
  const fmt = outputFormat();
  const url = new URL(`${base}/text-to-dialogue`);
  if (fmt) url.searchParams.set("output_format", fmt);

  const body = JSON.stringify({
    inputs,
    model_id: modelId(),
  });

  for (const headers of [
    { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg,*/*" },
    { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "audio/mpeg,*/*" },
  ]) {
    try {
      const res = await fetch(url.toString(), { method: "POST", headers, body });
      if (!res.ok) continue;
      const ct = (res.headers.get("content-type") ?? "").toLowerCase();
      const ab = await res.arrayBuffer();
      if (ct.includes("json") || ab.byteLength < 128) continue;
      return Buffer.from(ab);
    } catch {
      /* try next auth */
    }
  }
  return null;
}

/**
 * Full-episode dialogue via ElevenLabs text-to-dialogue (preferred when enabled).
 * Returns null if API unavailable — caller should fall back to per-turn TTS.
 */
export async function synthesizeElevenLabsTextToDialogue(
  turns: DialogueTurn[]
): Promise<{ buffer: Buffer | null; log: string[] }> {
  const log: string[] = [];
  if (!isElevenLabsDialogueApiEnabled()) {
    log.push("ElevenLabs text-to-dialogue skipped (ELEVENLABS_USE_DIALOGUE_API=0).");
    return { buffer: null, log };
  }

  const apiKey = normalizeApiKey(process.env.ELEVENLABS_API_KEY);
  if (!apiKey) {
    log.push("ElevenLabs text-to-dialogue skipped (no API key).");
    return { buffer: null, log };
  }

  const { akshay, kriti } = await resolveDialogueVoiceIds(apiKey);
  const voiceFor = (s: DialogueSpeaker) => (s === "akshay" ? akshay : kriti);
  const base = elevenLabsV1Base();
  const batches = chunkTurns(turns);
  const mp3Parts: Buffer[] = [];

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b]!;
    const inputs = batch.map((t) => ({
      text: t.text.trim(),
      voice_id: voiceFor(t.speaker),
    }));
    const buf = await postDialogue(inputs, apiKey, base);
    if (!buf) {
      log.push(`ElevenLabs text-to-dialogue batch ${b + 1}/${batches.length} failed.`);
      return { buffer: null, log };
    }
    mp3Parts.push(buf);
    log.push(`ElevenLabs text-to-dialogue batch ${b + 1}/${batches.length} ok (${buf.byteLength} bytes).`);
  }

  const merged = mergeMp3Buffers(mp3Parts);
  if (merged.byteLength < 128) {
    log.push("ElevenLabs text-to-dialogue merged audio too small.");
    return { buffer: null, log };
  }
  log.push(`ElevenLabs text-to-dialogue: ${turns.length} turns → ${merged.byteLength} bytes.`);
  return { buffer: merged, log };
}
