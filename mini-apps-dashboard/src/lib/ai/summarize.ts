import OpenAI from "openai";
import type { DialogueTurn, OutputLanguage, SummaryOutput } from "@/types";
import type { ExtractedArticle } from "@/lib/scraper/extract";
import {
  normalizeDialogueSpeaker,
  dialogueSpeakerLabel,
} from "@/lib/dialogue-speakers";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 120_000,
      maxRetries: 1,
    })
  : null;

const SUMMARIZE_MS = Math.min(
  Math.max(Number(process.env.OPENAI_SUMMARIZE_TIMEOUT_MS ?? "120000") || 120000, 30000),
  240000
);

export type DialogueBudget = {
  n: number;
  wordMin: number;
  wordMax: number;
  minTurns: number;
  maxTurns: number;
  estMinutesMax: number;
};

/** Scale length with source count; cap ~3 minutes spoken (~420 words upper bound). */
export function dialogueBudgetForArticleCount(count: number): DialogueBudget {
  const n = Math.max(1, count);
  const targetWords = Math.min(420, Math.max(120, 95 + 78 * n));
  const wordMin = Math.max(100, Math.floor(targetWords * 0.82));
  const wordMax = Math.min(440, Math.ceil(targetWords * 1.05));
  const minTurns = Math.max(6, Math.min(28, 5 + 2 * n));
  const maxTurns = Math.min(50, Math.max(14, 12 + 4 * n));
  const estMinutesMax = Math.min(3, Math.max(1, 0.35 + 0.22 * n));
  return { n, wordMin, wordMax, minTurns, maxTurns, estMinutesMax };
}

function coverageBlockEn(b: DialogueBudget): string {
  if (b.n <= 1) {
    return `- **Total words** in dialogue_turns: **${b.wordMin}–${b.wordMax}** (about ${b.estMinutesMax.toFixed(1)} min spoken).`;
  }
  const turnsPerSource = Math.max(3, Math.ceil(b.minTurns / Math.max(1, b.n)));
  return `CRITICAL — **ALL ${b.n} SOURCES** (this is a multi-URL roundup, not a single-article summary):
- Sources are **Source 1 … Source ${b.n}**. Give **real coverage to every one**—never narrate only the first.
- **Airtime rule**: Before leaving a source, spend at least **${turnsPerSource}** dialogue turns on that source (then transition: "Next…", "Separately…", "Another headline…").
- **summary_points**: **at least one bullet per source** with distinct facts. Duplicates: one bullet can cover two URLs only if clearly the same story.
- **Partial excerpts** (marked in body): still discuss that source from title/URL context; do not skip.
- **Total words** in dialogue_turns: **${b.wordMin}–${b.wordMax}** (use the full budget so each story gets airtime).`;
}

/** Same strength as English CRITICAL block — fixes multi-URL briefings only covering the first story. */
function coverageBlockHi(b: DialogueBudget): string {
  if (b.n <= 1) {
    return `- dialogue_turns में कुल **${b.wordMin}–${b.wordMax}** शब्द (~${b.estMinutesMax.toFixed(1)} मिनट)।`;
  }
  return `अनिवार्य — **सभी ${b.n} स्रोत**:
- नीचे लेख **स्रोत 1 … स्रोत ${b.n}** के रूप में हैं। **हर स्रोत** पर ठोस चर्चा करें—केवल पहले पर न रुकें।
- कहानियों के बीच स्पष्ट संक्रमण ("अगली खबर…", "अलग तरफ…", "एक और मुद्दा…")।
- **summary_points**: **प्रति स्रोत कम से कम एक बिंदु**। समान लेख पर एक बिंदु चलेगा।
- dialogue_turns में **${b.wordMin}–${b.wordMax}** शब्द—कई स्रोतों पर पूरी सीमा का उपयोग करें।`;
}

function coverageBlockHaryanvi(b: DialogueBudget): string {
  if (b.n <= 1) {
    return `- कुल **${b.wordMin}–${b.wordMax}** शब्द dialogue_turns में।`;
  }
  return `जरूरी — **सारे ${b.n} स्रोत**:
- हर स्रोत (स्रोत 1 तै स्रोत ${b.n}) पर **गहरी चर्चा**—किसे एक-दो पर ही मत रह जा।
- कहानियां बीच में साफ जोड़ ("अगली खबर…", "इब दूसरी तरफ…")।
- **summary_points**: हर स्रोत तै कम तै कम एक बिंदु।
- **${b.wordMin}–${b.wordMax}** शब्द dialogue_turns में—सब कहानियां न्यायो मिले।`;
}

function coverageBlockMr(b: DialogueBudget): string {
  if (b.n <= 1) {
    return `- एकूण **${b.wordMin}–${b.wordMax}** शब्द dialogue_turns मध्ये.`;
  }
  return `अत्यावश्यक — **सर्व ${b.n} स्रोत**:
- खालील लेख **स्रोत 1 … स्रोत ${b.n}** म्हणून आहेत. **प्रत्येक स्रोताचा** सखोल समावेश करा—फक्त पहिल्यावर थांबू नका.
- बातम्यांमध्ये स्पष्ट संक्रमण ("पुढची बातमी…", "दुसरीकडे…").
- **summary_points**: **प्रति स्रोत किमान एक बिंदू**. समान बातमीवर एक बिंदू पुरेसे.
- dialogue_turns मध्ये **${b.wordMin}–${b.wordMax}** शब्द.`;
}

function coverageBlockPa(b: DialogueBudget): string {
  if (b.n <= 1) {
    return `- dialogue_turns ਵਿੱਚ ਕੁੱਲ **${b.wordMin}–${b.wordMax}** ਸ਼ਬਦ।`;
  }
  return `ਲਾਜ਼ਮੀ — **ਸਾਰੇ ${b.n} ਸਰੋਤ**:
- ਹੇਠ ਲੇਖ **ਸਰੋਤ 1 … ਸਰੋਤ ${b.n}** ਵਜੋਂ ਹਨ। **ਹਰ ਸਰੋਤ** ਬਾਰੇ ਠੋਸ ਗੱਲ ਕਰੋ—ਸਿਰਫ ਪਹਿਲੇ ਉੱਤੇ ਨਾ ਰਹੋ।
- ਕਹਾਣੀਆਂ ਵਿਚਕਾਰ ਸਾਫ਼ ਜੋੜ ("ਅਗਲੀ ਖਬਰ…", "ਹੋਰ ਪਾਸੇ…", "ਇਕ ਹੋਰ ਮੁੱਦਾ…")।
- **summary_points**: **ਹਰ ਸਰੋਤ ਲਈ ਘੱਟੋ-ਘੱਟ ਇੱਕ ਬੁਲਟ**। ਇੱਕੋ ਜਿਹੇ ਲੇਖ ਲਈ ਇੱਕ ਬੁਲਟ ਠੀਕ ਹੈ।
- dialogue_turns ਵਿੱਚ **${b.wordMin}–${b.wordMax}** ਸ਼ਬਦ—ਸਾਰਿਆਂ ਨੂੰ ਸਮਾਂ ਦਿਓ।`;
}

function coverageBlockBn(b: DialogueBudget): string {
  if (b.n <= 1) {
    return `- dialogue_turns-এ মোট **${b.wordMin}–${b.wordMax}** শব্দ।`;
  }
  return `অত্যাবশ্যক — **সমস্ত ${b.n}টি উৎস**:
- নিচের নিবন্ধগুলো **উৎস 1 … উৎস ${b.n}** হিসেবে চিহ্নিত। **প্রতিটি উৎসে** গভীর আলোচনা করুন—শুধু প্রথমটিতে থেমে যাবেন না।
- গল্পের মাঝে স্পষ্ট সংযোগ ("পরের খবর…", "অন্য দিকে…")।
- **summary_points**: **প্রতি উৎসে কমপক্ষে একটি বুলেট**। একই বিষয়ে একটি বুলেট যথেষ্ট।
- dialogue_turns-এ **${b.wordMin}–${b.wordMax}** শব্দ।`;
}

function baseStructure(b: DialogueBudget): string {
  return `Output ONE valid JSON object (UTF-8). No markdown fences.
{
  "headline": "short title reflecting the combined briefing",
  "summary_points": ["at least one per source when multiple sources"],
  "dialogue_turns": [
    { "speaker": "akshay", "text": "one spoken line" },
    { "speaker": "kriti", "text": "..." }
  ]
}

Rules:
- **dialogue_turns**: alternate akshay/kriti. **Minimum ${b.minTurns} turns, maximum ${b.maxTurns} turns.**
- speaker must be exactly lowercase "akshay" or "kriti" (not display names or other labels).
- Inside JSON strings, avoid raw double-quotes or use \\" — broken JSON will fail parsing.
- No stage directions, no asterisks, no sound effects.`;
}

function baseStructureSectioned(b: DialogueBudget): string {
  return `Output ONE valid JSON object (UTF-8). No markdown fences.
{
  "headline": "short title reflecting the combined briefing",
  "summary_points": ["at least one per source when multiple sources"],
  "dialogue_turns": [
    { "speaker": "akshay", "text": "one spoken line" },
    { "speaker": "kriti", "text": "first line of a NEW topic section", "section_break": true }
  ]
}

Rules:
- **dialogue_turns**: alternate akshay/kriti. **Minimum ${b.minTurns} turns, maximum ${b.maxTurns} turns.**
- **section_break** (optional boolean): set **true** only on the **first** turn that begins each NEW SECTION after the first section (user message labels each source with SECTION: …). That turn should start with a clear verbal handoff, e.g. "Alright—shifting to business in India now." Vary phrasing per boundary. Do not set section_break on turn 1.
- speaker must be exactly lowercase "akshay" or "kriti".
- Inside JSON strings, avoid raw double-quotes or use \\".
- No stage directions, no asterisks.`;
}

function sectionBridgeRulesEn(): string {
  return `
MULTI-SECTION BRIEFING: Sources are tagged **SECTION: &lt;name&gt;** in the user message (e.g. Trending world, Reliance Jio, Sports). Cover every source. When you move from one SECTION to another, the opening line for that new section must sound like a natural podcast handoff so listeners notice the topic change—then continue the conversational flow.`;
}

function sectionBridgeRulesHi(): string {
  return `
बहु-अनुभाग: उपयोगकर्ता संदेश में प्रत्येक स्रोत **SECTION:** से चिह्नित है। नए अनुभाग पर जाते समय पहली पंक्ति स्पष्ट संक्रमण हो (जैसे "अब भारत में व्यापार की बात करें तो…")—फिर बातचीत जारी रखें।`;
}

function hasBriefingSections(articles: ExtractedArticle[]): boolean {
  return articles.some((a) => (a.briefing_section?.trim()?.length ?? 0) > 0);
}

function buildSummarizePrompt(
  lang: OutputLanguage,
  b: DialogueBudget,
  sectioned: boolean
): string {
  const struct = sectioned ? baseStructureSectioned(b) : baseStructure(b);
  const secEn = sectioned ? sectionBridgeRulesEn() : "";
  const secHi = sectioned ? sectionBridgeRulesHi() : "";

  if (lang === "en") {
    return `You write engaging podcast dialogue for two co-hosts covering **multiple news stories**.

Hosts:
- **Akshay** (male-presenting voice): curious, asks questions, reacts warmly.
- **Kriti** (female-presenting voice): insightful, explains context, keeps energy up.

Opening (mandatory): The **first** spoken line must welcome the **Reliance family** to **AI News Podcast**—same meaning as *"Hey Reliance family, welcome to AI News Podcast"* (you may paraphrase slightly so it sounds natural day to day). If using **dialogue_turns**, the **first turn must be speaker kriti** and must contain this welcome before any news content.

**Factual density (critical):** After the welcome, **every** few lines must introduce **new, concrete information** from the article excerpts below—**companies, people, numbers, dates, places, or reported events**. Do **not** pad with vague English filler ("lots going on", "interesting times", "big story" without saying **what** happened), long mutual agreement, or hosts echoing each other without adding facts. If you catch yourself being generic, **insert the next specific fact** from the sources. **summary_points** bullets must each contain **at least one checkable fact** from the text (not opinion).

Tone: **Simple, friendly, conversational**—plain language, not preachy or agenda-driven. Sound like friends sharing **actual headlines and details**, not lecturing.

Neutrality: Stick to what the **sources report**. **No political bias, slant, or agenda**; do not tell listeners what to think, how to vote, or which side is "right." **Never invent** quotes, stats, or events not supported by the excerpts; if a source body contains **EXTRACTION FAILED** or headline-level-only markers, say on-air that you only have the link/topic and stay cautious—do not fabricate detail.

Closing (mandatory): End with a **brief, warm sign-off aimed at the Reliance family**—thanks for listening, wishing them well, stay informed—so it clearly feels like a Reliance-family send-off. Either host may deliver it. **Do not** say "see you tomorrow," "until tomorrow," "same time tomorrow," or any fixed "next episode" / scheduled goodbye.
${secEn}

${struct}

${coverageBlockEn(b)}`;
  }
  if (lang === "hi") {
    return `You write engaging Hindi podcast dialogue (Devanagari) for two co-hosts.

**All** output strings in Hindi (Devanagari) only.
सामग्री स्रोतों पर आधारित रखें—राजनीतिक पक्षपात या एजेंडा नहीं; श्रोताओं को निर्देशित न करें। अंत में "कल मिलते हैं" जैसा निश्चित समय वाला विदा न कहें।
${secHi}

${struct}

${coverageBlockHi(b)}`;
  }
  if (lang === "hi-haryanvi") {
    return `Haryanvi-style dialogue (Devanagari), दो होस्ट, बातचीत जैसे दोस्त न्यूज़ पर चर्चा कर रहे हों।

${struct}

${coverageBlockHaryanvi(b)}`;
  }
  if (lang === "mr") {
    return `मराठी संवाद (देवनागरी), दोन होस्ट, बातम्या स्पष्टपणे सांगा.

${struct}

${coverageBlockMr(b)}`;
  }
  if (lang === "pa") {
    return `You write Punjabi podcast dialogue in **Gurmukhi script** only (ਪੰਜਾਬੀ ਗੁਰਮੁਖੀ).

Hosts map to: akshay = ਪੁਛਗਿੱਛ/ਪ੍ਰਤੀਕਰਮ, kriti = ਵਿਆਖਿਆ/ਉਤਸ਼ਾਹ.
**Valid JSON is mandatory** — any unescaped " inside a string breaks the output; use single quotes in speech or rephrase.

${struct}

${coverageBlockPa(b)}`;
  }
  if (lang === "bn") {
    return `বাংলা সংলাপ, দুই উপস্থাপক—আলোচনামূলক ও জীবন্ত।

${struct}

${coverageBlockBn(b)}`;
  }
  return buildSummarizePrompt("en", b, sectioned);
}

function buildUserMessage(
  articles: ExtractedArticle[],
  lang: OutputLanguage,
  b: DialogueBudget
): string {
  const n = articles.length;
  const indexLines = articles
    .map((a, i) => {
      const sec = a.briefing_section?.trim();
      return sec
        ? `**Source ${i + 1} of ${n} (SECTION: ${sec}):** ${a.title}`
        : `**Source ${i + 1} of ${n}:** ${a.title}`;
    })
    .join("\n");

  const cap = Math.min(9500, Math.max(2000, Math.floor(44000 / Math.max(n, 1))));
  const combined = articles
    .map((a, i) => {
      const sec = a.briefing_section?.trim();
      const head = sec
        ? `## Source ${i + 1} of ${n} — SECTION: ${sec} — ${a.title}`
        : `## Source ${i + 1} of ${n}: ${a.title}`;
      return `${head}\n\n${a.text.slice(0, cap)}`;
    })
    .join("\n\n---\n\n");

  const headEn = `Write the two-host briefing. There are **exactly ${n} sources** below—each must appear in the dialogue. Target **${b.wordMin}–${b.wordMax}** words in dialogue_turns.\n\n${indexLines}\n\n---\n\n`;
  const headHi = `संवाद लिखें। **सभी ${n} स्रोत** कवर करें। लक्ष्य: **${b.wordMin}–${b.wordMax}** शब्द।\n\n${indexLines}\n\n---\n\n`;
  const headMr = `संवाद तयार करा. **सर्व ${n} स्रोत**. **${b.wordMin}–${b.wordMax}** शब्द.\n\n${indexLines}\n\n---\n\n`;
  const headPa = `ਸੰਵਾਦ ਲਿਖੋ। **ਸਾਰੇ ${n} ਸਰੋਤ**। **${b.wordMin}–${b.wordMax}** ਸ਼ਬਦ।\n\n${indexLines}\n\n---\n\n`;
  const headBn = `সংলাপ লিখুন। **সমস্ত ${n} উৎস**। **${b.wordMin}–${b.wordMax}** শব্দ।\n\n${indexLines}\n\n---\n\n`;
  const headHry = `संवाद बणाओ। **सारे ${n} स्रोत**। **${b.wordMin}–${b.wordMax}** शब्द।\n\n${indexLines}\n\n---\n\n`;

  const head =
    lang === "hi"
      ? headHi
      : lang === "mr"
        ? headMr
        : lang === "pa"
          ? headPa
          : lang === "bn"
            ? headBn
            : lang === "hi-haryanvi"
              ? headHry
              : headEn;

  const tail =
    n >= 2
      ? `\n\n---\n\nFINAL_CHECK: Your dialogue will be read aloud. Listeners added **${n} separate news links**. They must hear **${n} distinct stories** (or clearly linked pairs), not one long recap of a single site.`
      : "";
  const factual =
    lang === "en"
      ? `\n\n---\n\nANCHOR: Ground the podcast in the excerpts above. Prioritize **who did what, when, where, and any numbers** from the text. Minimize meta banter; maximize **new facts per turn** after the intro.`
      : "";
  return head + combined + tail + factual;
}

function fallbackMonologuePrefix(lang: OutputLanguage): string {
  switch (lang) {
    case "hi":
    case "hi-haryanvi":
      return "आपकी ब्रीफिंग। ";
    case "mr":
      return "तुमची ब्रीफिंग. ";
    case "pa":
      return "ਤੁਹਾਡੀ ਬ੍ਰੀਫਿੰਗ। ";
    case "bn":
      return "আপনার ব্রিফিং। ";
    default:
      return "Here's your briefing. ";
  }
}

export class SummarizeTimeoutError extends Error {
  constructor() {
    super(
      `Summarization timed out after ${Math.round(SUMMARIZE_MS / 1000)}s. Check OPENAI_API_KEY, network, or VPN/firewall blocking api.openai.com.`
    );
    this.name = "SummarizeTimeoutError";
  }
}


function normalizeTurns(raw: unknown, minTurns: number): DialogueTurn[] | null {
  if (!Array.isArray(raw) || raw.length < minTurns) return null;
  const out: DialogueTurn[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") return null;
    const mapped = normalizeDialogueSpeaker((row as { speaker?: string }).speaker);
    const t = String((row as { text?: string }).text ?? "").trim();
    if (!mapped) return null;
    if (t.length < 2) return null;
    const section_break = Boolean((row as { section_break?: boolean }).section_break);
    out.push(
      section_break ? { speaker: mapped, text: t, section_break: true } : { speaker: mapped, text: t }
    );
  }
  return out.length >= minTurns ? out : null;
}

/** Strip ```json fences; trim. */
function parseModelJsonContent(content: string): Record<string, unknown> | null {
  let s = content.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/im.exec(s);
  if (fence) s = fence[1].trim();
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    const i = s.indexOf("{");
    const j = s.lastIndexOf("}");
    if (i >= 0 && j > i) {
      try {
        return JSON.parse(s.slice(i, j + 1)) as Record<string, unknown>;
      } catch {
        /* ignore */
      }
    }
    return null;
  }
}

function turnsToAudioScript(turns: DialogueTurn[]): string {
  return turns
    .map((t) => `${dialogueSpeakerLabel(t.speaker)}: ${t.text}`)
    .join("\n\n");
}

export async function summarizeArticles(
  articles: ExtractedArticle[],
  outputLanguage: OutputLanguage = "en"
): Promise<SummaryOutput | null> {
  if (!openai || articles.length === 0) return null;
  const budget = dialogueBudgetForArticleCount(articles.length);
  const sectioned = hasBriefingSections(articles);
  const userContent = buildUserMessage(articles, outputLanguage, budget);
  const systemPrompt = buildSummarizePrompt(outputLanguage, budget, sectioned);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), SUMMARIZE_MS);

  try {
    const completion = await openai.chat.completions.create(
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
        max_tokens: Math.min(14_000, 6000 + 950 * articles.length),
      },
      { signal: ac.signal }
    );
    clearTimeout(timer);
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = parseModelJsonContent(raw);
    if (!parsed?.headline || !Array.isArray(parsed.summary_points)) return null;

    let normalized = normalizeTurns(parsed.dialogue_turns, budget.minTurns);
    if (
      !normalized &&
      budget.n >= 2 &&
      Array.isArray(parsed.dialogue_turns) &&
      parsed.dialogue_turns.length >= 6
    ) {
      const relaxed = Math.max(6, Math.min(budget.minTurns - 2, Math.ceil(budget.minTurns * 0.7)));
      normalized = normalizeTurns(parsed.dialogue_turns, relaxed);
    }
    let audio_script: string;
    let dialogue_turns: DialogueTurn[] | undefined;

    if (normalized) {
      audio_script = optimizeForSpeech(turnsToAudioScript(normalized), outputLanguage);
      dialogue_turns = normalized;
    } else if (typeof parsed.audio_script === "string" && parsed.audio_script.trim()) {
      audio_script = optimizeForSpeech(parsed.audio_script, outputLanguage);
    } else {
      const bullets = (parsed.summary_points as string[])
        .map((x) => String(x).trim())
        .filter(Boolean);
      if (bullets.length === 0) return null;
      audio_script = optimizeForSpeech(
        `${fallbackMonologuePrefix(outputLanguage)}${bullets.join(" ")}`,
        outputLanguage
      );
    }

    return {
      headline: String(parsed.headline).trim(),
      summary_points: (parsed.summary_points as string[]).map((x) => String(x).trim()).filter(Boolean),
      audio_script,
      ...(dialogue_turns ? { dialogue_turns } : {}),
    };
  } catch (e) {
    clearTimeout(timer);
    const err = e as { name?: string; message?: string };
    if (err.name === "AbortError" || ac.signal.aborted) {
      console.error("[summarize] Aborted (timeout)", SUMMARIZE_MS, "ms");
      throw new SummarizeTimeoutError();
    }
    console.error("[summarize] OpenAI error:", err.message ?? e);
    return null;
  }
}

function optimizeForSpeech(script: string, lang: OutputLanguage): string {
  let s = script.replace(/\s+/g, " ").trim();
  if (lang === "en") {
    s = s.replace(/\s+([.,!?])/g, "$1");
  }
  return s;
}
