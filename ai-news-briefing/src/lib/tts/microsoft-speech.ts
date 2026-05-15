/**
 * Azure AI Speech — text-to-speech (REST).
 * https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech
 */
import { xmlLangFromAzureVoice } from "@/lib/tts/language-voices";

export type MicrosoftTtsResult = { buffer: Buffer | null; error?: string };

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** ~3.5k chars per request to stay under SSML limits for long scripts. */
function chunkText(text: string, maxLen: number): string[] {
  const t = text.trim();
  if (t.length <= maxLen) return t ? [t] : [];
  const parts: string[] = [];
  let rest = t;
  while (rest.length > 0) {
    if (rest.length <= maxLen) {
      parts.push(rest);
      break;
    }
    let cut = rest.lastIndexOf(". ", maxLen);
    if (cut < maxLen / 2) cut = rest.lastIndexOf("\n", maxLen);
    if (cut < maxLen / 2) cut = rest.lastIndexOf(" ", maxLen);
    if (cut < 80) cut = maxLen;
    parts.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  return parts.filter(Boolean);
}

export async function microsoftTextToSpeech(text: string): Promise<MicrosoftTtsResult> {
  const key = (
    process.env.AZURE_SPEECH_KEY ??
    process.env.MICROSOFT_SPEECH_KEY ??
    ""
  ).trim();
  const region = (
    process.env.AZURE_SPEECH_REGION ??
    process.env.MICROSOFT_SPEECH_REGION ??
    "eastus"
  )
    .trim()
    .replace(/\/$/, "");
  const voice = (
    process.env.AZURE_SPEECH_VOICE ?? "en-US-JennyNeural"
  ).trim();

  return microsoftTextToSpeechWithVoice(text, voice);
}

/** Single-voice Azure TTS (used for dialogue per turn with different voices). */
export async function microsoftTextToSpeechWithVoice(
  text: string,
  voiceName: string
): Promise<MicrosoftTtsResult> {
  const key = (
    process.env.AZURE_SPEECH_KEY ??
    process.env.MICROSOFT_SPEECH_KEY ??
    ""
  ).trim();
  const region = (
    process.env.AZURE_SPEECH_REGION ??
    process.env.MICROSOFT_SPEECH_REGION ??
    "eastus"
  )
    .trim()
    .replace(/\/$/, "");
  const voice = voiceName.trim() || "en-US-JennyNeural";

  if (!key) {
    return {
      buffer: null,
      error:
        "Azure Speech not configured. Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.local.",
    };
  }

  const chunks = chunkText(text, 3500);
  if (chunks.length === 0) {
    return { buffer: null, error: "No text to speak." };
  }

  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const buffers: Buffer[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const lang = xmlLangFromAzureVoice(voice);
    const ssml = `<?xml version="1.0" encoding="UTF-8"?>
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${escapeXml(lang)}">
  <voice name="${escapeXml(voice)}">${escapeXml(chunks[i])}</voice>
</speak>`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": "application/ssml+xml; charset=utf-8",
          "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
          "User-Agent": "AINewsBriefing/1.0",
        },
        body: ssml,
      });

      if (!res.ok) {
        const errBody = await res.text();
        console.error("[Microsoft TTS]", res.status, errBody.slice(0, 400));
        return {
          buffer: null,
          error: `Azure Speech HTTP ${res.status}: ${errBody.slice(0, 280)}`,
        };
      }

      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength < 32) {
        return { buffer: null, error: "Azure returned empty audio." };
      }
      buffers.push(buf);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[Microsoft TTS]", e);
      return { buffer: null, error: msg };
    }
  }

  const merged = Buffer.concat(buffers);
  return merged.byteLength >= 64 ? { buffer: merged } : { buffer: null, error: "Audio too small." };
}

/** Short silent gap via SSML (mono MP3, same format as dialogue TTS). */
export async function microsoftSynthesizeBreak(
  voiceName: string,
  durationMs: number
): Promise<Buffer | null> {
  const key = (
    process.env.AZURE_SPEECH_KEY ??
    process.env.MICROSOFT_SPEECH_KEY ??
    ""
  ).trim();
  const region = (
    process.env.AZURE_SPEECH_REGION ??
    process.env.MICROSOFT_SPEECH_REGION ??
    "eastus"
  )
    .trim()
    .replace(/\/$/, "");
  const voice = voiceName.trim() || "en-US-JennyNeural";
  if (!key) return null;
  const ms = Math.min(2000, Math.max(200, Math.floor(durationMs)));
  const lang = xmlLangFromAzureVoice(voice);
  const ssml = `<?xml version="1.0" encoding="UTF-8"?>
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${escapeXml(lang)}">
  <voice name="${escapeXml(voice)}"><break time="${ms}ms"/></voice>
</speak>`;
  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml; charset=utf-8",
        "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
        "User-Agent": "AINewsBriefing/1.0",
      },
      body: ssml,
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.byteLength >= 32 ? buf : null;
  } catch {
    return null;
  }
}
