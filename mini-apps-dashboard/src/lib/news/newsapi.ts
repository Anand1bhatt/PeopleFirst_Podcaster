import {
  fetchGoogleNewsRssSearch,
  simplifyQueryForGoogleNewsRss,
} from "@/lib/news/google-news-rss";

const NEWS_API_BASE = "https://newsapi.org/v2";

export type NewsArticleRef = {
  url: string;
  title: string;
  source: string;
};

/** In-memory cache for identical /everything requests (reduces repeat refreshes). Set NEWS_API_CACHE_MS=0 to disable. */
const everythingCache = new Map<string, { expires: number; articles: NewsArticleRef[] }>();
const rssEverythingCache = new Map<string, { expires: number; articles: NewsArticleRef[] }>();

/**
 * After a 429, skip NewsAPI briefly for **that same key** only. If you swap to a new API key,
 * we must not keep skipping NewsAPI — otherwise a “fresh” key never gets used.
 */
type NewsApiRateCooldown = { until: number; keyId: string };
let newsApiRateLimitCooldown: NewsApiRateCooldown | null = null;

function newsApiKeyId(apiKey: string): string {
  if (!apiKey) return "";
  return apiKey.length >= 12 ? apiKey.slice(-12) : apiKey;
}

function isCooldownActiveForKey(apiKey: string): boolean {
  const cd = newsApiCooldownMs();
  if (cd <= 0 || !newsApiRateLimitCooldown) return false;
  if (Date.now() >= newsApiRateLimitCooldown.until) {
    newsApiRateLimitCooldown = null;
    return false;
  }
  return newsApiKeyId(apiKey) === newsApiRateLimitCooldown.keyId;
}

function armCooldownForKey(apiKey: string): void {
  const cd = newsApiCooldownMs();
  if (cd <= 0) return;
  newsApiRateLimitCooldown = { until: Date.now() + cd, keyId: newsApiKeyId(apiKey) };
}

function newsApiCooldownMs(): number {
  const raw = process.env.NEWS_API_COOLDOWN_MS?.trim();
  if (raw === "0" || raw === "false") return 0;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0) return n;
  return 20 * 60 * 1000;
}

function everythingCacheTtlMs(): number {
  const raw = process.env.NEWS_API_CACHE_MS?.trim();
  if (raw === "0" || raw === "false") return 0;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0) return n;
  return 10 * 60 * 1000;
}

function rssFallbackCacheTtlMs(): number {
  return 5 * 60 * 1000;
}

function everythingCacheKey(
  apiKey: string,
  q: string,
  options: { pageSize: number; language?: string; from?: string; to?: string }
): string {
  const keyHint = apiKey.length >= 6 ? apiKey.slice(-6) : apiKey;
  return [
    keyHint,
    q,
    options.pageSize,
    options.language ?? "",
    options.from ?? "",
    options.to ?? "",
  ].join("|");
}

type NewsApiArticle = {
  title?: string | null;
  url?: string | null;
  source?: { name?: string | null };
};

type NewsApiJson = {
  status: string;
  code?: string;
  message?: string;
  articles?: NewsApiArticle[];
};

export class NewsApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "NewsApiError";
  }
}

function mapArticle(a: NewsApiArticle): NewsArticleRef | null {
  const url = typeof a.url === "string" ? a.url.trim() : "";
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const title = (a.title && String(a.title).trim()) || "Untitled";
  const source = (a.source?.name && String(a.source.name).trim()) || "News";
  return { url, title, source };
}

async function parseNewsApiResponse(res: Response): Promise<NewsApiJson> {
  let body: NewsApiJson;
  try {
    body = (await res.json()) as NewsApiJson;
  } catch {
    throw new NewsApiError("NewsAPI returned invalid JSON", res.status || 502);
  }
  if (body.status === "error") {
    const msg = body.message || body.code || "NewsAPI error";
    const lower = msg.toLowerCase();
    if (lower.includes("rate limit") || res.status === 429) {
      throw new NewsApiError(
        `NewsAPI rate limit exceeded (free tier is ~100 requests/day). Wait until tomorrow, upgrade at newsapi.org/pricing, or avoid refreshing the feed repeatedly — cached digests no longer call NewsAPI. [NewsAPI: ${msg}]`,
        429
      );
    }
    if (lower.includes("apikey") || lower.includes("api key") || res.status === 401) {
      throw new NewsApiError(
        msg.match(/api\s*key|invalid|incorrect|missing/i)
          ? msg
          : `Invalid NewsAPI key. ${msg} — use the 32-character key from https://newsapi.org/account (not a UUID).`,
        401
      );
    }
    throw new NewsApiError(msg, res.status === 200 ? 502 : res.status);
  }
  if (!res.ok) {
    throw new NewsApiError(body.message || `NewsAPI HTTP ${res.status}`, res.status);
  }
  return body;
}

/**
 * Search articles by keyword/topic (NewsAPI /v2/everything).
 */
export async function fetchEverything(
  apiKey: string,
  query: string,
  options: {
    pageSize: number;
    language?: string;
    /** YYYY-MM-DD inclusive (NewsAPI everything) */
    from?: string;
    to?: string;
  }
): Promise<NewsArticleRef[]> {
  const q = query.trim();
  if (!q) return [];

  const ttl = everythingCacheTtlMs();
  const ck = everythingCacheKey(apiKey, q, options);
  if (ttl > 0) {
    const hit = everythingCache.get(ck);
    if (hit && hit.expires > Date.now()) return hit.articles;
  }

  const url = new URL(`${NEWS_API_BASE}/everything`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("q", q);
  url.searchParams.set("sortBy", "publishedAt");
  url.searchParams.set("pageSize", String(Math.min(Math.max(options.pageSize, 1), 100)));
  if (options.language) {
    url.searchParams.set("language", options.language);
  }
  if (options.from) url.searchParams.set("from", options.from);
  if (options.to) url.searchParams.set("to", options.to);

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  const data = await parseNewsApiResponse(res);
  const raw = data.articles ?? [];
  const mapped = raw.map(mapArticle).filter(Boolean) as NewsArticleRef[];
  const out = dedupeArticles(mapped, options.pageSize);
  if (ttl > 0 && out.length > 0) {
    everythingCache.set(ck, { expires: Date.now() + ttl, articles: out });
  }
  return out;
}

/**
 * Like {@link fetchEverything}, but on NewsAPI 429 uses Google News RSS (no key) so POC keeps working.
 */
export async function fetchEverythingOrRss(
  apiKey: string,
  query: string,
  options: {
    pageSize: number;
    language?: string;
    from?: string;
    to?: string;
  }
): Promise<{ articles: NewsArticleRef[]; usedRssFallback: boolean }> {
  const tryRss = async (e429?: NewsApiError): Promise<{ articles: NewsArticleRef[]; usedRssFallback: true }> => {
    const sq = simplifyQueryForGoogleNewsRss(query);
    const rck = `rss|${sq}|${options.pageSize}|${options.from ?? ""}|${options.to ?? ""}`;
    const rssTtl = rssFallbackCacheTtlMs();
    const hit = rssEverythingCache.get(rck);
    if (hit && hit.expires > Date.now()) {
      return { articles: hit.articles, usedRssFallback: true };
    }
    let raw = await fetchGoogleNewsRssSearch(sq, Math.min(100, Math.max(options.pageSize * 2, 20)));
    let articles = dedupeArticles(raw, options.pageSize);
    if (articles.length === 0) {
      const broad = "India world business technology sports news politics";
      raw = await fetchGoogleNewsRssSearch(broad, Math.min(100, Math.max(options.pageSize * 2, 24)));
      articles = dedupeArticles(raw, options.pageSize);
    }
    if (articles.length === 0) {
      if (e429) throw e429;
      throw new NewsApiError("NewsAPI is in cooldown and Google News RSS returned no articles.", 503);
    }
    if (rssTtl > 0) {
      rssEverythingCache.set(rck, { expires: Date.now() + rssTtl, articles });
    }
    return { articles, usedRssFallback: true };
  };

  const cd = newsApiCooldownMs();
  if (cd > 0 && isCooldownActiveForKey(apiKey)) {
    return tryRss();
  }

  try {
    const articles = await fetchEverything(apiKey, query, options);
    return { articles, usedRssFallback: false };
  } catch (e) {
    if (e instanceof NewsApiError && e.statusCode === 429) {
      armCooldownForKey(apiKey);
      return tryRss(e);
    }
    throw e;
  }
}

/**
 * Pool headlines from several categories for suggestion seeds.
 */
export async function fetchTopHeadlinesPool(
  apiKey: string,
  options: { country?: string; perCategory?: number } = {}
): Promise<NewsArticleRef[]> {
  const country = options.country ?? "us";
  const per = Math.min(options.perCategory ?? 5, 10);
  const categories = ["general", "business", "sports", "technology"] as const;

  const cd = newsApiCooldownMs();
  if (cd > 0 && isCooldownActiveForKey(apiKey)) {
    const raw = await fetchGoogleNewsRssSearch(
      "world news business technology sports",
      Math.min(48, per * categories.length * 3)
    );
    const pooled = dedupeArticles(raw, Math.min(40, per * categories.length));
    if (pooled.length > 0) return pooled;
  }

  const seen = new Set<string>();
  const out: NewsArticleRef[] = [];

  for (const category of categories) {
    const url = new URL(`${NEWS_API_BASE}/top-headlines`);
    url.searchParams.set("apiKey", apiKey);
    url.searchParams.set("country", country);
    url.searchParams.set("category", category);
    url.searchParams.set("pageSize", String(per));

    try {
      const res = await fetch(url.toString(), { next: { revalidate: 60 } });
      const data = await parseNewsApiResponse(res);
      for (const a of data.articles ?? []) {
        const m = mapArticle(a);
        if (!m || seen.has(m.url)) continue;
        seen.add(m.url);
        out.push(m);
      }
    } catch (e) {
      if (e instanceof NewsApiError && e.statusCode === 429) {
        armCooldownForKey(apiKey);
        const raw = await fetchGoogleNewsRssSearch(
          "world news business technology sports",
          Math.min(48, per * categories.length * 3)
        );
        const pooled = dedupeArticles(raw, Math.min(40, per * categories.length));
        if (pooled.length === 0) throw e;
        return pooled;
      }
      // Skip category if e.g. no articles for region
    }
  }

  return out;
}

/** Top headlines for one category (no date filter; useful when /everything is empty on dev tier). */
export async function fetchTopHeadlinesCategory(
  apiKey: string,
  country: string,
  category: "general" | "business" | "sports" | "technology",
  pageSize: number
): Promise<NewsArticleRef[]> {
  const url = new URL(`${NEWS_API_BASE}/top-headlines`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("country", country);
  url.searchParams.set("category", category);
  url.searchParams.set("pageSize", String(Math.min(Math.max(pageSize, 1), 100)));

  const res = await fetch(url.toString(), { next: { revalidate: 120 } });
  const data = await parseNewsApiResponse(res);
  const raw = data.articles ?? [];
  return raw.map(mapArticle).filter(Boolean) as NewsArticleRef[];
}

function hostname(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Dedupe by URL; cap articles per domain for diversity. */
export function dedupeArticles(articles: NewsArticleRef[], maxTotal: number, maxPerDomain = 2): NewsArticleRef[] {
  const byUrl = new Map<string, NewsArticleRef>();
  for (const a of articles) {
    if (!byUrl.has(a.url)) byUrl.set(a.url, a);
  }
  const unique = [...byUrl.values()];
  const domainCount = new Map<string, number>();
  const result: NewsArticleRef[] = [];
  for (const a of unique) {
    const h = hostname(a.url);
    const n = domainCount.get(h) ?? 0;
    if (n >= maxPerDomain) continue;
    domainCount.set(h, n + 1);
    result.push(a);
    if (result.length >= maxTotal) break;
  }
  return result;
}

/**
 * Fallback topic chips from titles (first ~4 words, de-duplicated).
 */
export function topicsFromTitlesFallback(articles: NewsArticleRef[], maxTopics: number): string[] {
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const a of articles) {
    const words = a.title
      .replace(/[^\w\s'-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1)
      .slice(0, 5);
    if (words.length < 2) continue;
    const t = words.join(" ").slice(0, 48).trim();
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    topics.push(t);
    if (topics.length >= maxTopics) break;
  }
  return topics;
}
