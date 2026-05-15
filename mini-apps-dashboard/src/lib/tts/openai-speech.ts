import OpenAI from "openai";

export type OpenAiTtsVoice =
  | "alloy"
  | "echo"
  | "fable"
  | "onyx"
  | "nova"
  | "shimmer";

const VOICE = (process.env.OPENAI_TTS_VOICE ?? "nova") as OpenAiTtsVoice;
type OpenAiVoice = OpenAiTtsVoice;

/**
 * OpenAI Text-to-Speech (fallback when ElevenLabs is unavailable or lacks permission).
 */
export async function openAiTextToSpeech(text: string): Promise<Buffer | null> {
  return openAiTextToSpeechWithVoice(text, VOICE, 1.05);
}

export async function openAiTextToSpeechWithVoice(
  text: string,
  voice: OpenAiVoice,
  speed = 1.0
): Promise<Buffer | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  const input = text.slice(0, 4096).trim();
  if (!input) return null;

  try {
    const client = new OpenAI({ apiKey: key });
    const res = await client.audio.speech.create({
      model: "tts-1",
      voice,
      input,
      response_format: "mp3",
      speed: Math.min(1.25, Math.max(0.75, speed)),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.byteLength >= 64 ? buf : null;
  } catch (e) {
    console.error("[OpenAI TTS]", e);
    return null;
  }
}
