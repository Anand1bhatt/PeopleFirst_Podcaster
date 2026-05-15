/**
 * Shared server-side logic for the Figma daily feed: parallel upstream digest fetches.
 * Used by `/api/figma-daily-feed` and the home page RSC prefetch.
 */

/** Default window size — keep in sync with FigmaNewsFeed. */
export const DEFAULT_FIGMA_FEED_DAYS = 10;

/**
 * Next.js fetch cache for each upstream digest call. Briefing may be up to this many
 * seconds stale; repeat visits and parallel requests benefit.
 */
export const FIGMA_DAILY_DIGEST_REVALIDATE_SEC = 45;

export type FigmaDailyFeedDayRow = {
  date: string;
  dayLabel: string;
  day_summary: unknown;
  sections: unknown[];
  digestReady: boolean;
  error?: string;
};

function ymdOffset(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export function formatDayLabel(dateYmd: string): string {
  const [y, m, day] = dateYmd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  return dt.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export function buildFigmaFeedDateList(daysCount: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < daysCount; i++) dates.push(ymdOffset(i));
  return dates;
}

async function fetchOneDigest(
  base: string,
  date: string,
  lang: "en" | "hi",
  ensureDigest: boolean
): Promise<FigmaDailyFeedDayRow> {
  const url = `${base}/api/figma-daily-digest?date=${encodeURIComponent(date)}&lang=${lang}&ensureDigest=${ensureDigest ? "1" : "0"}`;
  try {
    const res = await fetch(url, {
      next: { revalidate: FIGMA_DAILY_DIGEST_REVALIDATE_SEC },
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      return {
        date,
        dayLabel: formatDayLabel(date),
        error: typeof data.error === "string" ? data.error : "Feed error",
        day_summary: null,
        sections: [],
        digestReady: false,
      };
    }
    const sections = Array.isArray(data.sections) ? data.sections : [];
    return {
      date,
      dayLabel: formatDayLabel(date),
      day_summary: data.day_summary ?? null,
      sections,
      digestReady: Boolean(data.digestReady),
    };
  } catch {
    return {
      date,
      dayLabel: formatDayLabel(date),
      error: "Network error",
      day_summary: null,
      sections: [],
      digestReady: false,
    };
  }
}

export async function fetchFigmaDailyFeedDays(options: {
  base: string;
  daysCount: number;
  lang: "en" | "hi";
  ensureDigest: boolean;
}): Promise<{ lang: "en" | "hi"; days: FigmaDailyFeedDayRow[] }> {
  const { base, daysCount, lang, ensureDigest } = options;
  const dates = buildFigmaFeedDateList(daysCount);
  const days = await Promise.all(
    dates.map((date) => fetchOneDigest(base, date, lang, ensureDigest))
  );
  return { lang, days };
}
