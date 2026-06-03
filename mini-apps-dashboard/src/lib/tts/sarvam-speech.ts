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
const SARVAM_MODEL = "bulbul:v2";

/** Default voice mapping — override via env vars */
const DEFAULT_VOICES: Record<DialogueSpeaker, string> = {
  kriti: "anushka",   // Female Indian English
  akshay: "abhilash", // Male Indian English
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

/**
 * Synthesize a single text line using Sarvam Bulbul v2.
 * Returns an MP3 Buffer (converted from WAV) or null on failure.
 */
export async function sarvamTextToSpeech(
  text: string,
  speaker: DialogueSpeaker
): Promise<Buffer | null> {
  const apiKey = sarvamApiKey();
  if (!apiKey) return null;

  const voice = sarvamVoiceFor(speaker);

  try {
    const res = await fetch(`${SARVAM_API_BASE}/text-to-speech`, {
      method: "POST",
      headers: {
        "api-subscription-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: [text.trim()],
        target_language_code: "en-IN",
        speaker: voice,
        model: SARVAM_MODEL,
        enable_preprocessing: true,
      }),
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => res.statusText);
      console.error(`[Sarvam TTS] ${res.status} — ${msg}`);
      return null;
    }

    const data = (await res.json()) as { audios?: string[] };
    const b64 = data?.audios?.[0];
    if (!b64) return null;

    const wavBuffer = Buffer.from(b64, "base64");
    const mp3Buffer = await wavToMp3(wavBuffer);
    if (!mp3Buffer) {
      console.error("[Sarvam TTS] WAV→MP3 conversion returned null");
      return null;
    }
    return mp3Buffer;
  } catch (err) {
    console.error("[Sarvam TTS] fetch error:", err);
    return null;
  }
}
