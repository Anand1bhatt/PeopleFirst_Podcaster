import { NextRequest, NextResponse } from "next/server";
import { getNewsApiKey } from "@/lib/news/news-key";
import { NewsApiError } from "@/lib/news/newsapi";
import { figmaDigestRead, figmaDigestUpsert, figmaDigestList } from "@/lib/db/figma-digest";
import { fetchFigmaDayArticles, pickBriefingUrlsFromDay } from "@/lib/figma-digest/fetch-day-articles";
import { generateDigestFromArticles } from "@/lib/figma-digest/generate-digest";
import { FIGMA_NEWS_SECTIONS } from "@/lib/news/figma-sections";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function mergeSections(
  articles: Awaited<ReturnType<typeof fetchFigmaDayArticles>>,
  stored: Awaited<ReturnType<typeof figmaDigestRead>>
) {
  const blurbByKey = new Map<string, string>();
  if (stored?.sections_json) {
    for (const s of stored.sections_json) {
      blurbByKey.set(s.key, s.blurb);
    }
  }
  return articles.map((s) => ({
    key: s.key,
    title: s.title,
    articles: s.articles.map((a) => ({
      url: a.url,
      title: a.title,
      source: a.source,
    })),
    blurb: blurbByKey.get(s.key) ?? null,
  }));
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  if (searchParams.get("list") === "1") {
    const lang = searchParams.get("lang") === "hi" ? "hi" : "en";
    const limit = Math.min(60, Math.max(1, Number(searchParams.get("limit")) || 30));
    const rows = await figmaDigestList(lang, limit);
    return NextResponse.json({
      items: rows.map((r) => ({
        date: r.digest_date,
        lang: r.lang,
        day_summary: r.day_summary,
        sections: r.sections_json,
      })),
    });
  }

  if (searchParams.get("briefing_sources") === "1") {
    const apiKey = getNewsApiKey();
    if (!apiKey) {
      return NextResponse.json({ error: "NEWS_API_KEY not set", sources: [] }, { status: 503 });
    }
    const date = searchParams.get("date")?.trim() || todayYmd();
    if (!DATE_RE.test(date)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }
    try {
      const sections = await fetchFigmaDayArticles(apiKey, date);
      const picked = pickBriefingUrlsFromDay(sections, 12);
      return NextResponse.json({
        date,
        sources: picked.map((p) => ({
          type: "url" as const,
          value: p.url,
          sectionTitle: p.sectionTitle,
        })),
      });
    } catch (e) {
      if (e instanceof NewsApiError) {
        return NextResponse.json({ error: e.message, sources: [] }, { status: e.statusCode });
      }
      throw e;
    }
  }

  const date = searchParams.get("date")?.trim() || todayYmd();
  const lang = searchParams.get("lang") === "hi" ? "hi" : "en";
  const ensureDigest = searchParams.get("ensureDigest") === "1";

  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: "Invalid date (use YYYY-MM-DD)" }, { status: 400 });
  }

  const apiKey = getNewsApiKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "NEWS_API_KEY is not set. Add to ai-news-briefing/.env.local or mini-apps-dashboard/.env.local.",
        date,
        lang,
        day_summary: null,
        sections: FIGMA_NEWS_SECTIONS.map((d) => ({
          key: d.key,
          title: d.title,
          articles: [] as { url: string; title: string; source: string }[],
          blurb: null,
        })),
      },
      { status: 503 }
    );
  }

  let stored = await figmaDigestRead(date, lang);

  /** Skip NewsAPI when we already have a saved digest (huge savings on free tier). */
  if (
    !ensureDigest &&
    stored?.sections_json?.length &&
    stored.sections_json.some(
      (s) => Array.isArray(s.articles) && s.articles.length > 0
    )
  ) {
    const articlesFromDisk = stored.sections_json.map((s) => ({
      key: s.key,
      title: s.title,
      articles: (s.articles ?? []).map((a) => ({
        url: a.url,
        title: a.title?.trim() || "Untitled",
        source: a.source?.trim() || "News",
      })),
    }));
    const sections = mergeSections(articlesFromDisk, stored);
    return NextResponse.json({
      date,
      lang,
      day_summary: stored.day_summary ?? null,
      sections,
      digestReady: Boolean(stored.day_summary?.trim()),
    });
  }

  let articles: Awaited<ReturnType<typeof fetchFigmaDayArticles>>;
  try {
    articles = await fetchFigmaDayArticles(apiKey, date);
  } catch (e) {
    if (e instanceof NewsApiError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    throw e;
  }

  stored = await figmaDigestRead(date, lang);

  if (ensureDigest) {
    const gen = await generateDigestFromArticles(date, lang, articles);
    stored = {
      digest_date: date,
      lang,
      day_summary: gen.day_summary,
      sections_json: gen.sections_json,
    };
    await figmaDigestUpsert(stored);
  }

  const sections = mergeSections(articles, stored);

  return NextResponse.json({
    date,
    lang,
    day_summary: stored?.day_summary ?? null,
    sections,
    digestReady: Boolean(stored?.day_summary),
  });
}

export async function POST(request: NextRequest) {
  let body: { date?: string; lang?: string };
  try {
    body = (await request.json()) as { date?: string; lang?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const date = (body.date?.trim() || todayYmd()).slice(0, 10);
  const lang = body.lang === "hi" ? "hi" : "en";
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  const apiKey = getNewsApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "NEWS_API_KEY not set" }, { status: 503 });
  }
  try {
    const articles = await fetchFigmaDayArticles(apiKey, date);
    const gen = await generateDigestFromArticles(date, lang, articles);
    await figmaDigestUpsert({
      digest_date: date,
      lang,
      day_summary: gen.day_summary,
      sections_json: gen.sections_json,
    });
    return NextResponse.json({
      ok: true,
      date,
      lang,
      day_summary: gen.day_summary,
      sections: gen.sections_json.map((s) => ({
        key: s.key,
        title: s.title,
        articles: s.articles,
        blurb: s.blurb,
      })),
    });
  } catch (e) {
    if (e instanceof NewsApiError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    const msg = e instanceof Error ? e.message : "Digest failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
