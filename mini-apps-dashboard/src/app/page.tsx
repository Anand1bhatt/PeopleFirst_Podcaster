import { AiNewsBriefingJourneyShell } from "@/components/figma-home/AiNewsBriefingJourneyShell";
import type { DayBlock } from "@/components/figma-home/figma-news-day-card";
import { getBriefingApiOriginFromHeaders } from "@/lib/briefing-api-base";
import { getBriefingAppUrl } from "@/lib/briefing-public-url";
import {
  DEFAULT_FIGMA_FEED_DAYS,
  fetchFigmaDailyFeedDays,
} from "@/lib/figma-daily-feed-data";

export const metadata = {
  title: "Home | Mini Apps",
  description:
    "Employee home with AI News Podcast; open the full app anytime.",
};

/** Prefetch uses live briefing API; avoid static generation at build when API is unavailable. */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const briefingUrl = getBriefingAppUrl();
  const base = await getBriefingApiOriginFromHeaders();
  const { days } = await fetchFigmaDailyFeedDays({
    base,
    daysCount: DEFAULT_FIGMA_FEED_DAYS,
    lang: "en",
    ensureDigest: false,
  });

  const initialFeed = { days: days as DayBlock[] };

  return (
    <div className="min-h-dvh bg-[#f0f4f8]">
      <AiNewsBriefingJourneyShell
        briefingUrl={briefingUrl}
        initialFeed={initialFeed}
      />
    </div>
  );
}
