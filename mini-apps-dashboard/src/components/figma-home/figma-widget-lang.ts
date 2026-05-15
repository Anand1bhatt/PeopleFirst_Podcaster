/** Figma feed widget: English or Hindi briefing audio. */

import type { OutputLanguage, TtsProvider } from "@/types";

export type FigmaWidgetLang = "en" | "hi";

export const FIGMA_WIDGET_LANG_STORAGE_KEY = "figmaWidgetLang";

export function parseFigmaWidgetLang(raw: unknown): FigmaWidgetLang {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return s === "hi" ? "hi" : "en";
}

/** Stable key for playback state, errors, and audio URL cache (date + language). */
export function feedPlaybackKey(date: string, lang: FigmaWidgetLang): string {
  return `${date}::${lang}`;
}

/** API/searchParam `lang` → output language; Hindi always uses Azure (microsoft) in figma routes. */
export function figmaLangToOutputAndTts(
  widgetLang: FigmaWidgetLang,
  requestedTts: "elevenlabs" | "microsoft" | undefined
): { outputLanguage: OutputLanguage; ttsProvider: TtsProvider } {
  if (widgetLang === "hi") {
    return { outputLanguage: "hi", ttsProvider: "microsoft" };
  }
  const ttsProvider =
    requestedTts === "microsoft" ? "microsoft" : "elevenlabs";
  return { outputLanguage: "en", ttsProvider };
}
