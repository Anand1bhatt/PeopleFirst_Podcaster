import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getNewsApiKey } from "@/lib/news/news-key";
import {
  fetchTopHeadlinesPool,
  NewsApiError,
  topicsFromTitlesFallback,
} from "@/lib/news/newsapi";

export const dynamic = "force-dynamic";

const MAX_TOPICS = 8;
const MIN_TOPICS = 4;

export async function GET() {
  const apiKey = getNewsApiKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "NEWS_API_KEY is not set. Add it to ai-news-briefing/.env.local or mini-apps-dashboard/.env.local, then restart dev.",
        topics: [] as string[],
      },
      { status: 503 }
    );
  }

  let pool;
  try {
    pool = await fetchTopHeadlinesPool(apiKey, { perCategory: 5 });
  } catch (e) {
    if (e instanceof NewsApiError) {
      return NextResponse.json(
        { error: e.message, topics: [] as string[] },
        { status: e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 502 }
      );
    }
    throw e;
  }

  if (pool.length === 0) {
    return NextResponse.json({ topics: [] as string[] });
  }

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    const openai = new OpenAI({ apiKey: openaiKey, timeout: 25_000, maxRetries: 0 });
    const snippets = pool.slice(0, 12).map((a, i) => ({
      i: i + 1,
      title: a.title.slice(0, 200),
      source: a.source,
    }));

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You output ONLY valid JSON: {"topics":["..."]}. topics: ${MIN_TOPICS}-${MAX_TOPICS} short search phrases (2-5 words each) users can use to find related news. Diverse subjects; no duplicates; no quotes inside strings; English.`,
          },
          {
            role: "user",
            content: JSON.stringify(snippets),
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 400,
      });
      const raw = completion.choices[0]?.message?.content;
      if (raw) {
        const parsed = JSON.parse(raw) as { topics?: unknown };
        const topics = Array.isArray(parsed.topics)
          ? parsed.topics
              .map((t) => (typeof t === "string" ? t.trim().slice(0, 80) : ""))
              .filter(Boolean)
          : [];
        const unique = [...new Set(topics.map((t) => t.replace(/\s+/g, " ")))];
        if (unique.length >= MIN_TOPICS) {
          return NextResponse.json({ topics: unique.slice(0, MAX_TOPICS) });
        }
      }
    } catch {
      /* fall through to fallback */
    }
  }

  const topics = topicsFromTitlesFallback(pool, MAX_TOPICS);
  return NextResponse.json({ topics });
}
