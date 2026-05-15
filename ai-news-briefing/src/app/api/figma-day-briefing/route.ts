import { NextRequest, NextResponse } from "next/server";
import { absoluteBriefingAudioUrl, getBriefingApiOrigin } from "@/lib/briefing-api-base";
import { getNewsApiKey } from "@/lib/news/news-key";
import { NewsApiError } from "@/lib/news/newsapi";
import { fetchFigmaDayArticles, pickBriefingUrlsFromDay } from "@/lib/figma-digest/fetch-day-articles";
import { createBriefing, findFigmaDigestBriefingForReuse } from "@/lib/db/briefings";
import { briefingQueue, isQueueAvailable } from "@/lib/queue/client";
import { runPipeline } from "@/lib/pipeline/run";
import {
  figmaLangToOutputAndTts,
  parseFigmaWidgetLang,
  type FigmaWidgetLang,
} from "@/lib/figma-widget-lang";
import type { TtsProvider } from "@/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Read-only: returns cached audio URL for a date if a completed figma digest briefing exists.
 * Does not create jobs or call NewsAPI.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = (searchParams.get("date")?.trim() || todayYmd()).slice(0, 10);
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: "Invalid date (use YYYY-MM-DD)" }, { status: 400 });
  }
  const widgetLang = parseFigmaWidgetLang(searchParams.get("lang")) as FigmaWidgetLang;
  const requestedTts: TtsProvider | undefined =
    searchParams.get("ttsProvider") === "microsoft" ? "microsoft" : undefined;
  const { outputLanguage, ttsProvider } = figmaLangToOutputAndTts(
    widgetLang,
    requestedTts
  );
  const reuse = await findFigmaDigestBriefingForReuse(date, ttsProvider, outputLanguage);
  if (reuse?.kind !== "completed") {
    return NextResponse.json(
      { error: "No completed briefing for this date" },
      { status: 404 }
    );
  }
  const base = getBriefingApiOrigin(request);
  const audio_url = absoluteBriefingAudioUrl(base, reuse.audio_url);
  if (!audio_url) {
    return NextResponse.json(
      { error: "No completed briefing for this date" },
      { status: 404 }
    );
  }
  return NextResponse.json({
    briefingId: reuse.id,
    date,
    lang: widgetLang,
    cached: true,
    audio_url,
  });
}

export async function POST(request: NextRequest) {
  let body: { date?: string; ttsProvider?: string; lang?: string };
  try {
    body = (await request.json()) as { date?: string; ttsProvider?: string; lang?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const date = (body.date?.trim() || todayYmd()).slice(0, 10);
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: "Invalid date (use YYYY-MM-DD)" }, { status: 400 });
  }

  const widgetLang = parseFigmaWidgetLang(body.lang) as FigmaWidgetLang;
  const requestedTts: TtsProvider | undefined =
    body.ttsProvider === "microsoft" ? "microsoft" : undefined;
  const { outputLanguage, ttsProvider } = figmaLangToOutputAndTts(
    widgetLang,
    requestedTts
  );

  const reuse = await findFigmaDigestBriefingForReuse(date, ttsProvider, outputLanguage);
  const base = getBriefingApiOrigin(request);

  if (reuse?.kind === "completed") {
    const audio_url = absoluteBriefingAudioUrl(base, reuse.audio_url);
    return NextResponse.json({
      briefingId: reuse.id,
      date,
      lang: widgetLang,
      cached: true,
      queued: false,
      ...(audio_url ? { audio_url } : {}),
    });
  }

  if (reuse?.kind === "in_progress") {
    return NextResponse.json({
      briefingId: reuse.id,
      date,
      lang: widgetLang,
      inProgress: true,
      queued: false,
    });
  }

  const apiKey = getNewsApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "NEWS_API_KEY not set" }, { status: 503 });
  }

  let sections: Awaited<ReturnType<typeof fetchFigmaDayArticles>>;
  try {
    sections = await fetchFigmaDayArticles(apiKey, date);
  } catch (e) {
    if (e instanceof NewsApiError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    throw e;
  }

  const picked = pickBriefingUrlsFromDay(sections, 12);
  if (picked.length === 0) {
    return NextResponse.json(
      { error: "No article URLs for this date — try another day or check NewsAPI." },
      { status: 400 }
    );
  }

  const sources = picked.map((p) => ({
    type: "url" as const,
    value: p.url,
    briefing_section: p.sectionTitle,
  }));

  const briefingId = await createBriefing(sources, ttsProvider, outputLanguage, {
    figmaDigestDate: date,
  });
  if (!briefingId) {
    return NextResponse.json({ error: "Failed to create briefing" }, { status: 500 });
  }

  const useQueue =
    process.env.BRIEFING_FIGMA_DAY_USE_QUEUE === "1" ||
    process.env.BRIEFING_FIGMA_DAY_USE_QUEUE === "true";
  if (useQueue && isQueueAvailable() && briefingQueue) {
    await briefingQueue.add("process", { briefingId });
    return NextResponse.json({ briefingId, queued: true, date, lang: widgetLang });
  }

  void runPipeline(briefingId).catch((err) => {
    console.error("[figma-day-briefing pipeline]", briefingId, err);
  });
  return NextResponse.json({ briefingId, queued: false, date, lang: widgetLang });
}
