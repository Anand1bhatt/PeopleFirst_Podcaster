import { NextRequest, NextResponse } from "next/server";
import { getNewsApiKey } from "@/lib/news/news-key";
import { fetchEverythingOrRss, NewsApiError } from "@/lib/news/newsapi";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 10;
const DEFAULT_LIMIT = 8;

export async function GET(request: NextRequest) {
  const apiKey = getNewsApiKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "NEWS_API_KEY is not set. Add it to ai-news-briefing/.env.local or mini-apps-dashboard/.env.local, then restart dev.",
        articles: [],
      },
      { status: 503 }
    );
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ error: "Query parameter q is required." }, { status: 400 });
  }

  let limit = Number(request.nextUrl.searchParams.get("limit") ?? DEFAULT_LIMIT);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  limit = Math.min(Math.floor(limit), MAX_LIMIT);

  const language = request.nextUrl.searchParams.get("language")?.trim() || undefined;

  try {
    const { articles } = await fetchEverythingOrRss(apiKey, q, { pageSize: limit, language });
    return NextResponse.json({ articles });
  } catch (e) {
    if (e instanceof NewsApiError) {
      return NextResponse.json(
        { error: e.message, articles: [] },
        { status: e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 502 }
      );
    }
    throw e;
  }
}
