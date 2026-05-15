/**
 * Azure neural voices per output language (male / female for dialogue).
 * Override with env vars documented in .env.example.
 */
import type { DialogueSpeaker, OutputLanguage } from "@/types";

/** TTS locale: Haryanvi reuses Hindi voices. */
export function ttsLanguageKey(lang: OutputLanguage): "en" | "hi" | "mr" | "pa" | "bn" {
  if (lang === "hi-haryanvi" || lang === "hi") return "hi";
  if (lang === "mr") return "mr";
  if (lang === "pa") return "pa";
  if (lang === "bn") return "bn";
  return "en";
}

export function azureVoiceForDialogue(
  outputLanguage: OutputLanguage,
  speaker: DialogueSpeaker
): string {
  const key = ttsLanguageKey(outputLanguage);
  const male = speaker === "akshay";

  if (key === "en") {
    return male
      ? process.env.AZURE_SPEECH_VOICE_MALE?.trim() || "en-US-GuyNeural"
      : process.env.AZURE_SPEECH_VOICE_FEMALE?.trim() || "en-US-JennyNeural";
  }
  if (key === "hi") {
    return male
      ? process.env.AZURE_VOICE_HI_MALE?.trim() || "hi-IN-MadhurNeural"
      : process.env.AZURE_VOICE_HI_FEMALE?.trim() || "hi-IN-SwaraNeural";
  }
  if (key === "mr") {
    return male
      ? process.env.AZURE_VOICE_MR_MALE?.trim() || "mr-IN-ManoharNeural"
      : process.env.AZURE_VOICE_MR_FEMALE?.trim() || "mr-IN-AarohiNeural";
  }
  if (key === "pa") {
    return male
      ? process.env.AZURE_VOICE_PA_MALE?.trim() || "pa-IN-OjasNeural"
      : process.env.AZURE_VOICE_PA_FEMALE?.trim() || "pa-IN-VaaniNeural";
  }
  if (key === "bn") {
    return male
      ? process.env.AZURE_VOICE_BN_MALE?.trim() || "bn-IN-BashkarNeural"
      : process.env.AZURE_VOICE_BN_FEMALE?.trim() || "bn-IN-TanishaaNeural";
  }
  return male ? "en-US-GuyNeural" : "en-US-JennyNeural";
}

/** Default female voice for single-voice fallback (clearer for Indic). */
export function azureVoiceSingleFallback(outputLanguage: OutputLanguage): string {
  return azureVoiceForDialogue(outputLanguage, "kriti");
}

/** BCP-47 tag for SSML xml:lang from voice name (e.g. hi-IN-MadhurNeural → hi-IN). */
export function xmlLangFromAzureVoice(voice: string): string {
  const v = voice.trim();
  const m = v.match(/^([a-z]{2})-([A-Z]{2})-/);
  if (m) return `${m[1]}-${m[2]}`;
  return "en-US";
}
