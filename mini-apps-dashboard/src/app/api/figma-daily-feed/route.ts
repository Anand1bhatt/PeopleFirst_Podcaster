import { NextRequest, NextResponse } from "next/server";
import { getBriefingApiOrigin } from "@/lib/briefing-api-base";
import { fetchFigmaDailyFeedDays } from "@/lib/figma-daily-feed-data";

export async function GET(request: NextRequest) {
  const days = Math.min(
    14,
    Math.max(1, Number(request.nextUrl.searchParams.get("days")) || 5)
  );
  const lang = request.nextUrl.searchParams.get("lang") === "hi" ? "hi" : "en";
  const ensureDigest = request.nextUrl.searchParams.get("fill") === "1";

  const base = getBriefingApiOrigin(request);

  try {
    const { lang: outLang, days: results } = await fetchFigmaDailyFeedDays({
      base,
      daysCount: days,
      lang,
      ensureDigest,
    });
    return NextResponse.json({ lang: outLang, days: results });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const unreachable =
      /fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(raw) ||
      raw === "Failed to fetch";
    const error = unreachable
      ? `Briefing API unreachable (${base}). Check NEWS_API_KEY and logs.`
      : raw;
    return NextResponse.json(
      {
        error,
        hint: "AI News Podcast runs in this app; see .env.example.",
        days: [],
      },
      { status: 502 }
    );
  }
}
