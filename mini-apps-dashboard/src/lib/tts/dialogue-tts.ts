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
import { resolveDialogueVoiceIds, textToSpeechWithVoiceId } from "@/lib/tts/elevenlabs";
import {
  microsoftTextToSpeechWithVoice,
  microsoftSynthesizeBreak,
} from "@/lib/tts/microsoft-speech";
import {
  openAiTextToSpeechWithVoice,
  type OpenAiTtsVoice,
} from "@/lib/tts/openai-speech";
import { sarvamTextToSpeech } from "@/lib/tts/sarvam-speech";
import { mergeMp3Buffers } from "@/lib/tts/merge-mp3";
import { synthesizeElevenLabsTextToDialogue } from "@/lib/tts/elevenlabs-text-to-dialogue";

const OPENAI_VALID = new Set<string>([
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
]);

/** Optional light cleanup; ELEVENLABS_RAW_TEXT=1 sends script verbatim (playground parity). */
function prepConversationalLine(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (process.env.ELEVENLABS_RAW_TEXT === "1") {
    return normalized;
  }
  return normalized
    .replace(/\s*—\s*/g, ", ")
    .replace(/\s+-\s+/g, ", ")
    // Fix Sarvam pronunciation: "tier-2" / "tier-3" → "tier two" / "tier three" (words, not digits)
    .replace(/\btier[-\s]1\b/gi, "tier one")
    .replace(/\btier[-\s]2\b/gi, "tier two")
    .replace(/\btier[-\s]3\b/gi, "tier three")
    .replace(/\btier[-\s]4\b/gi, "tier four")
    // Add slight pause between sentences to prevent Sarvam filler-word fumbles
    .replace(/([.!?])\s+([A-Z])/g, "$1.. $2");
}

async function elevenVoiceIdFor(speaker: DialogueSpeaker): Promise<string> {
  const ids = await resolveDialogueVoiceIds();
  return speaker === "akshay" ? ids.akshay : ids.kriti;
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
    const vid = await elevenVoiceIdFor(speaker);
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

  async function trySarvam(text: string, speaker: DialogueSpeaker): Promise<Buffer | null> {
    if (!process.env.SARVAM_API_KEY?.trim()) return null;
    return sarvamTextToSpeech(text, speaker);
  }

  return { tryElevenLabs, tryMicrosoft, tryOpenAi, trySarvam };
}

async function synthesizeTurn(
  text: string,
  speaker: DialogueSpeaker,
  preferred: TtsProvider,
  outputLanguage: OutputLanguage
): Promise<Buffer | null> {
  const trimmed = prepConversationalLine(text);
  if (!trimmed) return null;

  const { tryElevenLabs, tryMicrosoft, tryOpenAi, trySarvam } = createTurnSynthesizers(outputLanguage);
  const order =
    preferred === "sarvam"
      ? [trySarvam, tryElevenLabs, tryMicrosoft, tryOpenAi]
      : preferred === "elevenlabs"
      ? [tryElevenLabs, tryMicrosoft, tryOpenAi]
      : preferred === "openai"
      ? [tryOpenAi, trySarvam, tryMicrosoft, tryElevenLabs]
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

  if (preferred === "elevenlabs" && process.env.ELEVENLABS_API_KEY?.trim()) {
    const dialogue = await synthesizeElevenLabsTextToDialogue(turns);
    log.push(...dialogue.log);
    if (dialogue.buffer) {
      return { buffer: dialogue.buffer, log };
    }
    log.push("Falling back to per-turn ElevenLabs TTS.");
  }

  if (preferred === "sarvam" && !process.env.SARVAM_API_KEY?.trim()) {
    log.push("Sarvam TTS skipped (no SARVAM_API_KEY). Falling back to OpenAI.");
  }

  // Sarvam has strict rate limits — run sequentially (concurrency=1) to avoid failures
  const defaultConcurrency = preferred === "sarvam" ? 1 : 4;
  const dialogueConcurrency = Math.min(
    6,
    Math.max(1, Number(process.env.DIALOGUE_TTS_CONCURRENCY ?? String(defaultConcurrency)) || defaultConcurrency)
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

  const merged = mergeMp3Buffers(parts);
  if (merged.byteLength < 128) {
    log.push("Merged dialogue audio too small.");
    return { buffer: null, log };
  }
  log.push(`Dialogue TTS: ${turns.length} turns merged (${merged.byteLength} bytes).`);
  return { buffer: merged, log };
}
