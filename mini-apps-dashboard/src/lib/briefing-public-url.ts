/**
 * Path or URL for the embedded AI News Podcast UI (same app: /briefing).
 * Set NEXT_PUBLIC_AI_NEWS_BRIEFING_URL only if briefing is hosted elsewhere.
 */
export function getBriefingAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_AI_NEWS_BRIEFING_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");
  return "/briefing";
}
