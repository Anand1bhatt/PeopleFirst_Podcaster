/** localStorage cache for figma day briefing MP3 URLs (survives full page reload). */

import type { FigmaWidgetLang } from "@/components/figma-home/figma-widget-lang";
import { feedPlaybackKey } from "@/components/figma-home/figma-widget-lang";

export const FIGMA_BRIEFING_AUDIO_STORAGE_PREFIX_V2 = "figmaBriefingAudio:v2:";
/** Legacy: date-only keys (English only). */
const LEGACY_PREFIX_V1 = "figmaBriefingAudio:v1:";

export type FigmaBriefingAudioCacheEntry = {
  audioUrl: string;
  briefingId?: string;
  savedAt: number;
};

function parseEntry(raw: string | null): FigmaBriefingAudioCacheEntry | null {
  if (!raw?.trim()) return null;
  try {
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object") return null;
    const audioUrl = (j as { audioUrl?: unknown }).audioUrl;
    if (typeof audioUrl !== "string" || !audioUrl.trim()) return null;
    const briefingId = (j as { briefingId?: unknown }).briefingId;
    const savedAt = (j as { savedAt?: unknown }).savedAt;
    return {
      audioUrl: audioUrl.trim(),
      ...(typeof briefingId === "string" && briefingId.trim()
        ? { briefingId: briefingId.trim() }
        : {}),
      savedAt: typeof savedAt === "number" && Number.isFinite(savedAt) ? savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

function storageKeyV2(date: string, lang: FigmaWidgetLang): string {
  return `${FIGMA_BRIEFING_AUDIO_STORAGE_PREFIX_V2}${date}:${lang}`;
}

export function readFigmaBriefingAudioCache(
  date: string,
  lang: FigmaWidgetLang
): FigmaBriefingAudioCacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const v2 = parseEntry(localStorage.getItem(storageKeyV2(date, lang)));
    if (v2) return v2;
    if (lang === "en") {
      const legacy = parseEntry(localStorage.getItem(`${LEGACY_PREFIX_V1}${date}`));
      if (legacy) return legacy;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeFigmaBriefingAudioCache(
  date: string,
  lang: FigmaWidgetLang,
  entry: Omit<FigmaBriefingAudioCacheEntry, "savedAt"> & { savedAt?: number }
): void {
  if (typeof window === "undefined") return;
  try {
    const payload: FigmaBriefingAudioCacheEntry = {
      audioUrl: entry.audioUrl,
      savedAt: entry.savedAt ?? Date.now(),
      ...(entry.briefingId ? { briefingId: entry.briefingId } : {}),
    };
    localStorage.setItem(storageKeyV2(date, lang), JSON.stringify(payload));
  } catch {
    /* quota or private mode */
  }
}

/** Load all cached `date::lang` → audioUrl for hydrating refs on mount. */
export function loadAllFigmaBriefingAudioUrls(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const out: Record<string, string> = {};
  const p2 = FIGMA_BRIEFING_AUDIO_STORAGE_PREFIX_V2;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(p2)) continue;
      const rest = k.slice(p2.length);
      const colon = rest.lastIndexOf(":");
      if (colon <= 0) continue;
      const date = rest.slice(0, colon);
      const lang = rest.slice(colon + 1);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (lang !== "en" && lang !== "hi") continue;
      const e = parseEntry(localStorage.getItem(k));
      if (e?.audioUrl) out[feedPlaybackKey(date, lang as FigmaWidgetLang)] = e.audioUrl;
    }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(LEGACY_PREFIX_V1)) continue;
      const date = k.slice(LEGACY_PREFIX_V1.length);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const e = parseEntry(localStorage.getItem(k));
      if (e?.audioUrl) {
        const key = feedPlaybackKey(date, "en");
        if (!out[key]) out[key] = e.audioUrl;
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}
