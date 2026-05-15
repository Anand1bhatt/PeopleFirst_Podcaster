import {
  fetchEverythingOrRss,
  fetchTopHeadlinesCategory,
  type NewsArticleRef,
} from "@/lib/news/newsapi";
import { FIGMA_NEWS_SECTIONS } from "@/lib/news/figma-sections";

export type FigmaDaySectionArticles = {
  key: string;
  title: string;
  articles: NewsArticleRef[];
};

/** Title keywords → section (rough match for single-query fan-out). */
const SECTION_MATCH: Record<string, string[]> = {
  trending_world: [
    "world",
    "international",
    "global",
    "politics",
    "president",
    "minister",
    "summit",
    "diplomat",
    "nato",
    "europe",
    "china",
    "russia",
    "ukraine",
    "middle east",
  ],
  reliance: ["reliance", "ambani", "ril", "reliance industries", "reliance retail"],
  jio: ["jio", "jiophone", "jio 5g", "jio platforms"],
  ai_tech: [
    "ai",
    "artificial intelligence",
    "machine learning",
    "openai",
    "nvidia",
    "chip",
    "software",
    "tech ",
    "technology",
    "google",
    "microsoft",
    "startup",
  ],
  business_india: [
    "india",
    "indian",
    "rbi",
    "sensex",
    "nifty",
    "rupee",
    "mumbai",
    "delhi",
    "bangalore",
    "startup",
    "gdp",
    "economy",
  ],
  sports: [
    "sport",
    "cricket",
    "ipl",
    "football",
    "tennis",
    "olympic",
    "nba",
    "match",
    "championship",
    "world cup",
  ],
};

function scoreArticleForSection(title: string, key: string): number {
  const t = title.toLowerCase();
  const words = SECTION_MATCH[key] ?? [];
  let n = 0;
  for (const w of words) {
    if (t.includes(w)) n++;
  }
  return n;
}

/**
 * One /everything call per day, split across sections. Saves ~6× NewsAPI calls
 * vs per-section queries (critical for free tier ~100 req/day).
 */
async function fetchFigmaDayArticlesConsolidated(
  apiKey: string,
  dateYmd: string
): Promise<FigmaDaySectionArticles[]> {
  const broad =
    "(India OR Indian OR business OR technology OR sports OR cricket OR IPL OR world OR politics OR AI OR Reliance OR Jio OR economy)";
  let skipHeadlineFallback = false;
  const first = await fetchEverythingOrRss(apiKey, broad, {
    pageSize: 100,
    language: "en",
    from: dateYmd,
    to: dateYmd,
  });
  let pool = first.articles;
  skipHeadlineFallback = skipHeadlineFallback || first.usedRssFallback;

  if (pool.length === 0) {
    try {
      const second = await fetchEverythingOrRss(apiKey, broad, {
        pageSize: 60,
        language: "en",
      });
      pool = second.articles;
      skipHeadlineFallback = skipHeadlineFallback || second.usedRssFallback;
    } catch {
      pool = [];
    }
  }

  const byKey = new Map<string, NewsArticleRef[]>();
  for (const def of FIGMA_NEWS_SECTIONS) {
    byKey.set(def.key, []);
  }
  const used = new Set<string>();

  const keysByScoreFor = (a: NewsArticleRef) =>
    [...FIGMA_NEWS_SECTIONS]
      .map((d) => ({
        k: d.key,
        s: scoreArticleForSection(a.title, d.key),
      }))
      .sort((x, y) => y.s - x.s)
      .map((x) => x.k);

  const scored = [...pool].sort(
    (a, b) =>
      Math.max(
        ...FIGMA_NEWS_SECTIONS.map((d) => scoreArticleForSection(b.title, d.key))
      ) -
      Math.max(
        ...FIGMA_NEWS_SECTIONS.map((d) => scoreArticleForSection(a.title, d.key))
      )
  );

  for (const a of scored) {
    if (used.has(a.url)) continue;
    for (const k of keysByScoreFor(a)) {
      const def = FIGMA_NEWS_SECTIONS.find((d) => d.key === k)!;
      const list = byKey.get(k)!;
      if (list.length < def.pageSize) {
        list.push(a);
        used.add(a.url);
        break;
      }
    }
  }

  for (const def of FIGMA_NEWS_SECTIONS) {
    const list = byKey.get(def.key)!;
    for (const a of pool) {
      if (list.length >= def.pageSize) break;
      if (used.has(a.url)) continue;
      list.push(a);
      used.add(a.url);
    }
  }

  const out: FigmaDaySectionArticles[] = [];
  for (const def of FIGMA_NEWS_SECTIONS) {
    let articles = (byKey.get(def.key) ?? []).slice(0, def.pageSize);
    if (articles.length === 0 && def.fallback && !skipHeadlineFallback) {
      try {
        articles = await fetchTopHeadlinesCategory(
          apiKey,
          def.fallback.country,
          def.fallback.category,
          def.pageSize
        );
      } catch {
        articles = [];
      }
    }
    out.push({
      key: def.key,
      title: def.title,
      articles,
    });
  }
  return out;
}

/** Legacy: 6× /everything per day — only if NEWS_API_FIGMA_PER_SECTION=1 */
async function fetchFigmaDayArticlesPerSection(
  apiKey: string,
  dateYmd: string
): Promise<FigmaDaySectionArticles[]> {
  const out: FigmaDaySectionArticles[] = [];
  for (const def of FIGMA_NEWS_SECTIONS) {
    const r = await fetchEverythingOrRss(apiKey, def.q, {
      pageSize: def.pageSize,
      language: def.language,
      from: dateYmd,
      to: dateYmd,
    });
    let articles = r.articles;
    const usedRss = r.usedRssFallback;
    if (articles.length === 0 && def.fallback && !usedRss) {
      try {
        articles = await fetchTopHeadlinesCategory(
          apiKey,
          def.fallback.country,
          def.fallback.category,
          def.pageSize
        );
      } catch {
        articles = [];
      }
    }
    out.push({
      key: def.key,
      title: def.title,
      articles: articles.slice(0, def.pageSize),
    });
  }
  return out;
}

/**
 * Pull articles per feed day. Default: one consolidated NewsAPI query per day.
 * Set NEWS_API_FIGMA_PER_SECTION=1 for the old 6-query-per-section behavior.
 */
export async function fetchFigmaDayArticles(
  apiKey: string,
  dateYmd: string
): Promise<FigmaDaySectionArticles[]> {
  const perSection =
    process.env.NEWS_API_FIGMA_PER_SECTION === "1" ||
    process.env.NEWS_API_FIGMA_PER_SECTION === "true";
  if (perSection) {
    return fetchFigmaDayArticlesPerSection(apiKey, dateYmd);
  }
  return fetchFigmaDayArticlesConsolidated(apiKey, dateYmd);
}

/** URLs for Figma auto-briefing: spread across sections, max total. */
export function pickBriefingUrlsFromDay(
  sections: FigmaDaySectionArticles[],
  maxTotal: number
): { url: string; sectionTitle: string }[] {
  const perSection = Math.max(1, Math.ceil(maxTotal / sections.length));
  const seen = new Set<string>();
  const list: { url: string; sectionTitle: string }[] = [];

  for (const s of sections) {
    let n = 0;
    for (const a of s.articles) {
      if (seen.has(a.url)) continue;
      seen.add(a.url);
      list.push({ url: a.url, sectionTitle: s.title });
      n++;
      if (n >= perSection || list.length >= maxTotal) break;
    }
  }

  return list.slice(0, maxTotal);
}
