/**
 * Sarvam AI TTS — Bulbul v2
 * Docs: https://docs.sarvam.ai/api-reference-docs/text-to-speech
 *
 * API returns base64-encoded WAV audio. We convert to MP3 via ffmpeg
 * so buffers are compatible with the rest of the pipeline (mergeMp3Buffers).
 * Free tier: 100 credits (~1 credit per request).
 */
import type { DialogueSpeaker } from "@/types";
import { execFile } from "child_process";
import { promisify } from "util";
import * as os from "os";
import * as fs from "fs/promises";
import * as path from "path";

const execFileAsync = promisify(execFile);

const SARVAM_API_BASE = "https://api.sarvam.ai";
const SARVAM_API_IP_FALLBACK = "https://20.235.220.20"; // Direct IP fallback for DNS issues
const SARVAM_MODEL = "bulbul:v3"; // Latest version - using natural-sounding voices

/** Default voice mapping — override via env vars */
const DEFAULT_VOICES: Record<DialogueSpeaker, string> = {
  kriti: "simran",     // Female Indian English (perfect natural voice)
  akshay: "shubh",     // Male Indian English (natural conversational voice)
};

function sarvamApiKey(): string {
  return (process.env.SARVAM_API_KEY ?? "").trim();
}

function sarvamVoiceFor(speaker: DialogueSpeaker): string {
  if (speaker === "kriti") {
    return process.env.SARVAM_VOICE_KRITI?.trim() || DEFAULT_VOICES.kriti;
  }
  return process.env.SARVAM_VOICE_AKSHAY?.trim() || DEFAULT_VOICES.akshay;
}

/** Convert a WAV Buffer to MP3 using ffmpeg. Returns null if ffmpeg unavailable or fails. */
async function wavToMp3(wavBuffer: Buffer): Promise<Buffer | null> {
  const tmpDir = os.tmpdir();
  const inFile = path.join(tmpDir, `sarvam_in_${Date.now()}.wav`);
  const outFile = path.join(tmpDir, `sarvam_out_${Date.now()}.mp3`);
  try {
    await fs.writeFile(inFile, wavBuffer);
    await execFileAsync("ffmpeg", [
      "-y", "-i", inFile,
      "-codec:a", "libmp3lame",
      "-qscale:a", "2",
      "-ar", "44100",
      outFile,
    ]);
    const mp3 = await fs.readFile(outFile);
    return mp3.byteLength > 64 ? mp3 : null;
  } catch (err) {
    console.error("[Sarvam TTS] WAV→MP3 conversion failed:", err);
    return null;
  } finally {
    await fs.unlink(inFile).catch(() => {});
    await fs.unlink(outFile).catch(() => {});
  }
}

const SARVAM_CHAR_LIMIT = 450; // Sarvam API limit is 500 chars; use 450 for safety

/** Split text into chunks of max SARVAM_CHAR_LIMIT chars, splitting on sentence boundaries. */
function chunkText(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= SARVAM_CHAR_LIMIT) return [trimmed];

  const chunks: string[] = [];
  // Split on sentence-ending punctuation
  const sentences = trimmed.split(/(?<=[.!?])\s+/);
  let current = "";
  for (const sentence of sentences) {
    if ((current + " " + sentence).trim().length > SARVAM_CHAR_LIMIT) {
      if (current.trim()) chunks.push(current.trim());
      current = sentence;
    } else {
      current = current ? current + " " + sentence : sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [trimmed.slice(0, SARVAM_CHAR_LIMIT)];
}

/** Call Sarvam API for a single chunk of text. */
async function sarvamApiCall(
  text: string,
  voice: string,
  apiKey: string
): Promise<Buffer | null> {
  async function doFetch(baseUrl: string, extraHeaders: Record<string, string> = {}) {
    return fetch(`${baseUrl}/text-to-speech`, {
      method: "POST",
      headers: {
        "api-subscription-key": apiKey,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify({
        inputs: [text.trim()],
        target_language_code: "en-IN",
        speaker: voice,
        model: SARVAM_MODEL,
        enable_preprocessing: true,
      }),
    });
  }

  let res: Response;
  try {
    res = await doFetch(SARVAM_API_BASE);
  } catch (dnsError: any) {
    if (dnsError?.code === "ENOTFOUND" || dnsError?.cause?.code === "ENOTFOUND") {
      console.warn("[Sarvam TTS] DNS failed, trying IP fallback…");
      res = await doFetch(SARVAM_API_IP_FALLBACK, { Host: "api.sarvam.ai" });
    } else {
      throw dnsError;
    }
  }

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    console.error(`[Sarvam TTS] ${res.status} — ${msg}`);
    return null;
  }

  const data = (await res.json()) as { audios?: string[] };
  const b64 = data?.audios?.[0];
  if (!b64) return null;

  const wavBuffer = Buffer.from(b64, "base64");
  return wavToMp3(wavBuffer);
}

/**
 * Synthesize text using Sarvam Bulbul v3.
 * Automatically chunks texts > 450 chars and concatenates the MP3 buffers.
 * Returns an MP3 Buffer or null on failure.
 */
export async function sarvamTextToSpeech(
  text: string,
  speaker: DialogueSpeaker
): Promise<Buffer | null> {
  const apiKey = sarvamApiKey();
  if (!apiKey) return null;

  const voice = sarvamVoiceFor(speaker);
  const chunks = chunkText(text);

  try {
    const buffers: Buffer[] = [];
    for (const chunk of chunks) {
      const mp3 = await sarvamApiCall(chunk, voice, apiKey);
      if (!mp3) {
        console.error(`[Sarvam TTS] Chunk failed: "${chunk.slice(0, 60)}…"`);
        return null;
      }
      buffers.push(mp3);
    }

    if (buffers.length === 1) return buffers[0];

    // Concatenate multiple chunk MP3s using mergeMp3Buffers
    const { mergeMp3Buffers } = await import("@/lib/tts/merge-mp3");
    return mergeMp3Buffers(buffers);
  } catch (err) {
    console.error("[Sarvam TTS] error:", err);
    return null;
  }
}
