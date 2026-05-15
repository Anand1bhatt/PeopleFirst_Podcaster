/**
 * Dual-voice dialogue: one TTS call per turn, concatenate MP3 buffers.
 * Falls back to single-voice via run.ts when this returns null.
 */
import type {
  DialogueTurn,
  DialogueSpeaker,
  OutputLanguage,
  TtsProvider,
} from "@/types";
import { azureVoiceForDialogue } from "@/lib/tts/language-voices";
import { textToSpeechWithVoiceId } from "@/lib/tts/elevenlabs";
import {
  microsoftTextToSpeechWithVoice,
  microsoftSynthesizeBreak,
} from "@/lib/tts/microsoft-speech";
import {
  openAiTextToSpeechWithVoice,
  type OpenAiTtsVoice,
} from "@/lib/tts/openai-speech";

const OPENAI_VALID = new Set<string>([
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
]);

function elevenVoiceIdFor(speaker: DialogueSpeaker): string {
  if (speaker === "akshay") {
    return (
      process.env.ELEVENLABS_VOICE_AKSHAY?.trim() ||
      process.env.ELEVENLABS_VOICE_ALEX?.trim() ||
      process.env.ELEVENLABS_VOICE_ID?.trim() ||
      ""
    );
  }
  return (
    process.env.ELEVENLABS_VOICE_KRITI?.trim() ||
    process.env.ELEVENLABS_VOICE_JAMIE?.trim() ||
    process.env.ELEVENLABS_VOICE_ID?.trim() ||
    ""
  );
}

function openAiVoiceFor(speaker: DialogueSpeaker): OpenAiTtsVoice {
  const raw =
    speaker === "akshay"
      ? process.env.OPENAI_TTS_VOICE_AKSHAY?.trim() ||
        process.env.OPENAI_TTS_VOICE_ALEX?.trim()
      : process.env.OPENAI_TTS_VOICE_KRITI?.trim() ||
        process.env.OPENAI_TTS_VOICE_JAMIE?.trim();
  if (raw && OPENAI_VALID.has(raw)) return raw as OpenAiTtsVoice;
  return speaker === "akshay" ? "onyx" : "nova";
}

function createTurnSynthesizers(outputLanguage: OutputLanguage) {
  async function tryElevenLabs(text: string, speaker: DialogueSpeaker): Promise<Buffer | null> {
    if (!process.env.ELEVENLABS_API_KEY?.trim()) return null;
    const vid = elevenVoiceIdFor(speaker);
    if (!vid) return null;
    const r = await textToSpeechWithVoiceId(text, vid);
    return r.buffer;
  }

  async function tryMicrosoft(text: string, speaker: DialogueSpeaker): Promise<Buffer | null> {
    const voice = azureVoiceForDialogue(outputLanguage, speaker);
    let r = await microsoftTextToSpeechWithVoice(text, voice);
    if (r.buffer) return r.buffer;
    if (outputLanguage === "pa") {
      r = await microsoftTextToSpeechWithVoice(text, azureVoiceForDialogue("hi", speaker));
      if (r.buffer) return r.buffer;
    }
    return null;
  }

  async function tryOpenAi(text: string, speaker: DialogueSpeaker): Promise<Buffer | null> {
    return openAiTextToSpeechWithVoice(text, openAiVoiceFor(speaker), 1.0);
  }

  return { tryElevenLabs, tryMicrosoft, tryOpenAi };
}

async function synthesizeTurn(
  text: string,
  speaker: DialogueSpeaker,
  preferred: TtsProvider,
  outputLanguage: OutputLanguage
): Promise<Buffer | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const { tryElevenLabs, tryMicrosoft, tryOpenAi } = createTurnSynthesizers(outputLanguage);
  const order =
    preferred === "elevenlabs"
      ? [tryElevenLabs, tryMicrosoft, tryOpenAi]
      : [tryMicrosoft, tryElevenLabs, tryOpenAi];

  for (const fn of order) {
    const b = await fn(trimmed, speaker);
    if (b && b.byteLength >= 64) return b;
  }
  return null;
}

/** Run `fn` on each item with at most `limit` concurrent; results ordered by index. */
async function parallelMapByIndex<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const n = items.length;
  const results = new Array<R>(n);
  let next = 0;
  const workerCount = Math.min(Math.max(1, limit), Math.max(1, n));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const j = next++;
        if (j >= n) break;
        results[j] = await fn(items[j], j);
      }
    })
  );
  return results;
}

export async function synthesizeDialogueAudio(
  turns: DialogueTurn[],
  preferred: TtsProvider,
  outputLanguage: OutputLanguage = "en"
): Promise<{ buffer: Buffer | null; log: string[] }> {
  const log: string[] = [];
  if (!turns.length) {
    return { buffer: null, log: ["No dialogue turns."] };
  }

  const dialogueConcurrency = Math.min(
    6,
    Math.max(1, Number(process.env.DIALOGUE_TTS_CONCURRENCY ?? "4") || 4)
  );

  const [turnAudios, gapBuffers] = await Promise.all([
    parallelMapByIndex(turns, dialogueConcurrency, (turn, _i) =>
      synthesizeTurn(turn.text, turn.speaker, preferred, outputLanguage)
    ),
    parallelMapByIndex(turns, dialogueConcurrency, async (turn, i) => {
      if (!turn.section_break || i === 0) return null;
      const voice = azureVoiceForDialogue(outputLanguage, turn.speaker);
      return microsoftSynthesizeBreak(voice, 480);
    }),
  ]);

  const parts: Buffer[] = [];
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    if (turn.section_break && i > 0) {
      const gap = gapBuffers[i];
      if (gap) parts.push(gap);
    }
    const buf = turnAudios[i];
    if (!buf) {
      log.push(`Dialogue turn ${i + 1} (${turn.speaker}) failed on all TTS providers.`);
      return { buffer: null, log };
    }
    parts.push(buf);
  }

  const merged = Buffer.concat(parts);
  if (merged.byteLength < 128) {
    log.push("Merged dialogue audio too small.");
    return { buffer: null, log };
  }
  log.push(`Dialogue TTS: ${turns.length} turns merged (${merged.byteLength} bytes).`);
  return { buffer: merged, log };
}
