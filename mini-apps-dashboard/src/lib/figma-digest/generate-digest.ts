import OpenAI from "openai";
import type { FigmaDaySectionArticles } from "./fetch-day-articles";
import type { FigmaDigestSectionStored } from "@/lib/db/figma-digest";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 90_000, maxRetries: 1 })
  : null;

type LlmSection = { key: string; blurb: string };

function buildPrompt(
  dateYmd: string,
  lang: "en" | "hi",
  sections: FigmaDaySectionArticles[]
): string {
  const payload = sections.map((s) => ({
    key: s.key,
    title: s.title,
    headlines: s.articles.map((a) => ({ title: a.title, source: a.source })),
  }));

  if (lang === "hi") {
    return `तारीख: ${dateYmd}
नीचे समाचार अनुभाग और शीर्षक हैं। UTF-8 JSON लौटाएँ (कोई markdown नहीं):
{
  "day_summary": "उस दिन की समाचार झलक — 3-5 वाक्य देवनागरी हिंदी में",
  "sections": [ { "key": "...", "blurb": "इस अनुभाग पर 2-4 वाक्य देवनागरी में" } ]
}
हर sections[].key नीचे दिए गए key से मिलान करे। अनुभाग जिनमें कोई शीर्षक नहीं, उनके लिए संक्षिप्त सामान्य पंक्ति।

डेटा:
${JSON.stringify(payload, null, 2)}`;
  }

  return `Date: ${dateYmd}
Below are news sections and headline lists. Return ONE JSON object (UTF-8, no markdown):
{
  "day_summary": "A cohesive 3-5 sentence overview of the day's themes in English",
  "sections": [ { "key": "<same as input>", "blurb": "2-4 sentences summarizing this section's headlines" } ]
}
Match each sections[].key to the input keys. For sections with no headlines, write one short line that we had limited coverage.

Data:
${JSON.stringify(payload, null, 2)}`;
}

export async function generateDigestFromArticles(
  dateYmd: string,
  lang: "en" | "hi",
  sections: FigmaDaySectionArticles[]
): Promise<{ day_summary: string; sections_json: FigmaDigestSectionStored[] }> {
  if (!openai) {
    const sections_json: FigmaDigestSectionStored[] = sections.map((s) => ({
      key: s.key,
      title: s.title,
      blurb:
        lang === "hi"
          ? s.articles.length
            ? `${s.articles.length} समाचार शीर्षक उपलब्ध।`
            : "इस दिन के लिए सीमित कवरेज।"
          : s.articles.length
            ? `${s.articles.length} headlines available (set OPENAI_API_KEY for AI summary).`
            : "Limited coverage for this day.",
      articles: s.articles.map((a) => ({
        url: a.url,
        title: a.title,
        source: a.source,
      })),
    }));
    const day_summary =
      lang === "hi"
        ? "सारांश उत्पन्न करने के लिए OpenAI कुंजी सेट करें।"
        : "Set OPENAI_API_KEY to generate AI day summaries.";
    return { day_summary, sections_json };
  }

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_DIGEST_MODEL ?? "gpt-4o-mini",
    temperature: 0.4,
    max_tokens: 2500,
    messages: [
      { role: "user", content: buildPrompt(dateYmd, lang, sections) },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? "";
  let parsed: { day_summary?: string; sections?: LlmSection[] };
  try {
    parsed = JSON.parse(text.replace(/^```\w*\n?|\n?```$/g, "").trim()) as typeof parsed;
  } catch {
    const sections_json: FigmaDigestSectionStored[] = sections.map((s) => ({
      key: s.key,
      title: s.title,
      blurb: lang === "hi" ? "सारांश पार्स नहीं हो सका।" : "Could not parse summary.",
      articles: s.articles.map((a) => ({
        url: a.url,
        title: a.title,
        source: a.source,
      })),
    }));
    return {
      day_summary: lang === "hi" ? "सारांश त्रुटि।" : "Summary generation parse error.",
      sections_json,
    };
  }

  const blurbByKey = new Map<string, string>();
  for (const row of parsed.sections ?? []) {
    if (row.key && typeof row.blurb === "string") blurbByKey.set(row.key, row.blurb);
  }

  const sections_json: FigmaDigestSectionStored[] = sections.map((s) => ({
    key: s.key,
    title: s.title,
    blurb:
      blurbByKey.get(s.key) ??
      (lang === "hi" ? "कोई विवरण नहीं।" : "No blurb generated."),
    articles: s.articles.map((a) => ({
      url: a.url,
      title: a.title,
      source: a.source,
    })),
  }));

  return {
    day_summary:
      typeof parsed.day_summary === "string" && parsed.day_summary.trim()
        ? parsed.day_summary.trim()
        : lang === "hi"
          ? "दिन का सारांश।"
          : "Day in review.",
    sections_json,
  };
}
