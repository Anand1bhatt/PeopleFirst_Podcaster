/** Figma feed widget: English or Hindi briefing audio (shared logic with mini-apps-dashboard). */

import type { OutputLanguage, TtsProvider } from "@/types";

export type FigmaWidgetLang = "en" | "hi";

export function parseFigmaWidgetLang(raw: unknown): FigmaWidgetLang {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return s === "hi" ? "hi" : "en";
}

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
