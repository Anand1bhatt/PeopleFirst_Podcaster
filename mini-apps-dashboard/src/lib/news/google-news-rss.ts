/**
 * Fallback when NewsAPI rate-limits (429). Google News RSS has no API key;
 * results are best-effort and may include news.google.com redirect URLs.
 */

export type RssArticleRef = {
  url: string;
  title: string;
  source: string;
};

function rssFallbackDisabled(): boolean {
  const v = process.env.NEWS_RSS_FALLBACK?.trim().toLowerCase();
  return v === "0" || v === "false" || v === "off";
}

function decodeXmlText(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .trim();
}

/** Strip NewsAPI-style boolean query for Google News search (space-separated keywords). */
export function simplifyQueryForGoogleNewsRss(q: string): string {
  const s = q
    .replace(/\bOR\b/gi, " ")
    .replace(/\bAND\b/gi, " ")
    .replace(/[()"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.slice(0, 220) || "world news";
}

function parseRssItems(xml: string, maxItems: number): RssArticleRef[] {
  const items = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) ?? [];
  const out: RssArticleRef[] = [];
  for (const block of items) {
    if (out.length >= maxItems) break;
    const titleRaw =
      block.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i)?.[1] ?? "";
    const linkRaw = block.match(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i)?.[1]?.trim() ?? "";
    const sourceRaw =
      block.match(/<source(?:\s[^>]*)?>([\s\S]*?)<\/source>/i)?.[1] ?? "";
    const title = decodeXmlText(titleRaw.replace(/<[^>]+>/g, ""));
    const url = decodeXmlText(linkRaw.replace(/<[^>]+>/g, ""));
    const source = decodeXmlText(sourceRaw.replace(/<[^>]+>/g, "")) || "Google News";
    if (!url || !/^https?:\/\//i.test(url)) continue;
    if (!title) continue;
    out.push({ url, title, source });
  }
  return out;
}

/**
 * Fetch headlines via Google News RSS search (no API key).
 */
export async function fetchGoogleNewsRssSearch(
  searchQuery: string,
  maxItems: number
): Promise<RssArticleRef[]> {
  if (rssFallbackDisabled()) return [];
  const q = searchQuery.trim() || "world news";
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", q);
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", "US");
  url.searchParams.set("ceid", "US:en");

  const cap = Math.min(Math.max(maxItems, 1), 100);
  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; MiniAppsNewsBriefing/1.0; +https://github.com/) AppleWebKit/537.36",
      Accept: "application/rss+xml, application/xml, text/xml, */*",
    },
    next: { revalidate: 300 },
  });
  if (!res.ok) return [];
  const xml = await res.text();
  return parseRssItems(xml, cap);
}
