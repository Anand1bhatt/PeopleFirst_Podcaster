import OpenAI from "openai";
import type { DialogueTurn, DialogueSpeaker, OutputLanguage, SummaryOutput } from "@/types";
import type { ExtractedArticle } from "@/lib/scraper/extract";

/** Fixed host introduction prepended to every English briefing. */
const INTRO_TURNS: DialogueTurn[] = [
  {
    speaker: "kriti",
    text: "Hey Reliance family, welcome back to the AI News Briefing Podcast — your quick catch-up on everything happening today. I'm Kriti.",
  },
  {
    speaker: "akshay",
    text: "And I'm Akshay.",
  },
];
import {
  normalizeDialogueSpeaker,
  dialogueSpeakerLabel,
} from "@/lib/dialogue-speakers";
import { coalesceSplitWelcomeTurn } from "@/lib/ai/coalesce-welcome-turn";

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
- **Keep each turn short** (roughly 8–35 spoken words). Prefer many quick exchanges over long monologues.
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
- **Keep each turn short** (roughly 8–35 spoken words). Prefer many quick exchanges over long monologues.
- **section_break** (optional boolean): set **true** only on the **first** turn that begins each NEW SECTION after the first section (user message labels each source with SECTION: …). That turn should sound like a **podcast chapter pivot**—e.g. "Okay wait—tech twitter is spiraling about this next one." Vary phrasing. Do not set section_break on turn 1.
- speaker must be exactly lowercase "akshay" or "kriti".
- Inside JSON strings, avoid raw double-quotes or use \\".
- No stage directions, no asterisks.`;
}

function sectionBridgeRulesEn(): string {
  return `
MULTI-SECTION EPISODE: Sources are tagged **SECTION: &lt;name&gt;** (e.g. Trending world, Reliance Jio, Sports). Cover every source. When you pivot sections, the first line must feel like **two friends changing the subject on a podcast**—curious, casual, not a news desk transition.`;
}

/** Strip anchor-style clichés from model output (post-parse). */
const NEWS_ANCHOR_PHRASES: RegExp[] = [
  /\bIn today'?s news\b/gi,
  /\bBreaking news\b/gi,
  /\bThis is AI News\b/gi,
  /\bLet'?s dive into the headlines\b/gi,
  /\bStay tuned\b/gi,
  /\bComing up next\b/gi,
  /\bGood (evening|morning|afternoon), (viewers|listeners)\b/gi,
  /\bFrom the news desk\b/gi,
];

function deAnchorDialogueText(text: string): string {
  let s = text.trim();
  for (const re of NEWS_ANCHOR_PHRASES) {
    s = s.replace(re, "").replace(/\s{2,}/g, " ").trim();
  }
  return s;
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
    return `You are writing a **Spotify-style two-host podcast script** for "AI News Briefing Podcast."

---

## THE GOLDEN RULE: This Is a REAL Conversation, Not a Presentation

**FIRST: Look at this CORRECT example of dialogue_turns JSON output. Every main turn is 40-80 words. Copy this exact pattern:**

\`\`\`json
[
  {"speaker":"kriti","text":"So Reliance Jio just crossed a massive milestone — 100 million 5G subscribers. And what's remarkable is how fast they got here: just 18 months. That's the fastest 5G rollout anywhere in the world. They've now deployed True 5G across 10,000 cities and towns, and their Q4 revenue came in at ₹26,478 crore — up 13% year-on-year. Those aren't just big numbers, they're a signal that the bet on 5G infrastructure is actually paying off."},
  {"speaker":"akshay","text":"And that's the key — Jio isn't just building a faster phone network. With JioAirFiber launching at ₹599 a month and crossing 5 million connections, they're going after the home broadband market that's been dominated by cable for decades. When you can offer 5G-backed home internet at that price, you're not just competing with Airtel or BSNL, you're bringing in entirely new users who never had broadband before."},
  {"speaker":"kriti","text":"So it's less about telecom and more about digital access."},
  {"speaker":"akshay","text":"Exactly."}
]
\`\`\`

**WRONG example (DO NOT output this — turns are too short):**
\`\`\`json
[
  {"speaker":"kriti","text":"Jio crossed 100 million subscribers."},
  {"speaker":"akshay","text":"That's impressive!"},
  {"speaker":"kriti","text":"Revenue hit 26,478 crore."},
  {"speaker":"akshay","text":"Up 13%?"}
]
\`\`\`

Now study this Spotify transcript excerpt for the natural conversation rhythm:

> Speaker 1: "Imagine a government so intensely concerned with security that it literally deploys the Air Force to fly medical exam papers across the country. But then imagine that same government completely missing a basic weather alert which results in multi million dollar passenger jets getting smashed to pieces on a tarmac."
> Speaker 2: "It's quite the contrast."
> Speaker 1: "It really is. Welcome to today's deep dive. We are looking at a massive stack of incredibly fast moving updates."
> Speaker 2: "Yeah, and the sheer volume of these sources is wild. We've got everything from extreme global events to historic domestic milestones."
> Speaker 1: "Exactly. Our mission today is to synthesize these developments into a cohesive picture."
>
> [Later, mid-story:]
> Speaker 2: "So this happened on June 8th. The oil tanker was operating off the coast of Oman when it was struck."
> Speaker 1: "Wait, a precision missile strike?"
> Speaker 2: "Yes, exactly. The crew started receiving harrowing distress calls. Reports of massive engine room fires, lifeboats on one side being completely obliterated by the blast."
> Speaker 1: "Oh wow, that is terrifying."
> Speaker 2: "The remaining escape routes were blocked by flames, so the crew had to huddle at the bow of the sinking tanker."
> Speaker 1: "All made it out, right?"
> Speaker 2: "Thankfully, a helicopter evacuation managed to get all 24 sailors off safely."

**THIS is the target.** Natural, fluid, one host speaks 2-4 sentences, the other jumps in with a short reaction or question, then the first continues. It feels like two people genuinely discovering and discussing news together.

---

## Host Personalities

**Kriti** ("kriti") — curious, warm, asks "wait, why does that matter?", connects news to everyday life, occasionally surprised by facts.

**Akshay** ("akshay") — analytical, provides context, sees the bigger picture, explains WHY something is significant, occasionally skeptical.

Both are EQUAL CO-HOSTS. Both introduce stories. Both explain. Both react. Neither is the permanent host or permanent expert.

---

## NEWS ORDER (MANDATORY — always in this sequence)

1. **Reliance / Jio** → Kriti leads
2. **Local / State (Maharashtra, Gujarat, etc.)** → Akshay leads
3. **Pan India** → Kriti leads
4. **World / Global** → Akshay leads

If a section is missing, skip it and move to the next.

---

## Conversation Patterns — Rotate Across Stories

**Pattern A (Story 1 — Kriti opens with narrative):**
Kriti: 3-4 sentences setting the scene with facts and color
Akshay: 1-2 word reaction OR short question (3-8 words)
Kriti: 2-3 more sentences of deeper context
Akshay: 2-3 sentences of analysis / why it matters
Kriti: 1 sentence connecting it to the listener

**Pattern B (Story 2 — Akshay opens with a striking observation):**
Akshay: 3-4 sentences — opens with a surprising angle or fact
Kriti: Short question or reaction (5-10 words)
Akshay: 2-3 sentences answering with full context
Kriti: 2-3 sentences — wider implications or connection
Akshay: 1-2 sentences closing the thought

**Pattern C (Story 3 — Kriti opens with a surprising fact, Akshay expands):**
Kriti: 2-3 sentences — opens with a stat or unexpected detail
Akshay: 3-4 sentences — full expansion and analysis
Kriti: 2-3 sentences — everyday impact or connection
Akshay: 1 sentence — brief takeaway

**Pattern D (Story 4 — Akshay connects globally, Kriti explores local impact):**
Akshay: 3-4 sentences — global context and significance
Kriti: Short reaction (3-6 words), then 2-3 sentences exploring India angle
Akshay: 2-3 sentences — industry or strategic perspective
Kriti: 1-2 sentences — why Reliance employees should care

**Pattern F (Any story — both co-discuss, nobody "presents"):**
Host A: 1-2 sentences — brief opener
Host B: 2-3 sentences — immediately builds on it
Host A: 3-4 sentences — deeper explanation
Host B: 2-3 sentences — analysis
Host A: 1 sentence — natural close

---

## Turn Length Rules (THE MOST IMPORTANT RULE — read this carefully)

**BEFORE you write any turn, count how many words it will have. If it's a main speaking turn and it's under 40 words, you MUST expand it before outputting.**

MAIN speaking turns (any turn that is NOT a short reaction):
→ **HARD MINIMUM: 40 words. TARGET: 50-80 words.**
→ Must be 2-4 complete sentences. ONE host finishes their FULL thought before switching.
→ If you want to say "Revenue hit 868 crore" — that's 4 words. EXPAND it: explain what it means, add context, connect it to something else. Never output a single-sentence main turn.

REACTION / INTERRUPTION turns (use sparingly):
→ These are the ONLY turns allowed to be short: 3-10 words.
→ Examples: "Wait — seriously?", "Oh wow.", "That's wild.", "Right, exactly.", "And that's the key part."
→ MAXIMUM 2-3 reaction turns per story. The REST must be full-length turns.

**SELF-CHECK BEFORE OUTPUTTING:** Count each story's turns. If most turns are under 20 words, you have failed. Rewrite until each main turn is 40-80 words.

❌ WRONG (sounds robotic — DO NOT do this):
Kriti: "Jio posted growth in Kerala."
Akshay: "How much growth?"
Kriti: "Revenue hit 868 crore."
Akshay: "That's impressive."
Kriti: "Market share is 32 percent."

✅ CORRECT (Spotify style — DO THIS):
Kriti: "So Reliance Jio just dropped their Q4 numbers for Kerala, and the growth is genuinely impressive. Revenue hit ₹868 crore — that's up from ₹796 crore the year before. They've now crossed 32% market share in the state, and added over 5 lakh new customers in a single quarter. For a market that's already quite saturated, that's not easy to pull off."
Akshay: "And that tells you something about how they're competing. Most operators are fighting over the same pie — Jio seems to be actively growing the pie itself, especially in broadband. When you have 5G home broadband rolling out at ₹599 a month, you're not just taking subscribers from Airtel, you're bringing in people who never had home internet."
Kriti: "So it's less about telecom and more about digital access."
Akshay: "Exactly."

---

## Natural Interruptions (USE THEM — they make it sound real)

Mid-story, the non-speaking host can interrupt with:
- "Wait — seriously?"
- "Oh wow."
- "That's wild."
- "Hold on, how?"
- "All of them?"
- "Right, exactly."
- "And that's the key part."

These SHORT interruptions (3-8 words) make it sound like a real conversation. Use 1-2 per story maximum.

---

## Language Rules

- Simple words. Grade 8 reading level.
- Contractions always: it's, that's, they're, we're, isn't, didn't
- Explain any technical term immediately: "EBITDA — basically their operating profit"
- NO corporate jargon: no "leverage", "synergy", "ecosystem", "paradigm"
- Write EXACTLY how people speak. Not how journalists write.

---

## Closing (MANDATORY — last 4 turns exactly)
Akshay: "And those were the stories shaping the day."
Kriti: "Thanks for spending a few minutes with us."
Akshay: "We'll be back tomorrow with another quick briefing."
Kriti: "Until then, stay curious, stay informed, and have a great day ahead. See you tomorrow."

---

## Facts Rule
Every claim must come from the source excerpts. Names, numbers, dates, places. If extraction failed, say "we only have the headline on this one" — never fabricate.

Opening: The host introduction is already handled separately. **Jump straight into the first story** — do NOT start with greetings or "I'm Kriti/Akshay".
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

  const headEn = `Write a **podcast episode script** (two hosts, conversational—not news narration). There are **exactly ${n} sources** below—each must get airtime. Target **${b.wordMin}–${b.wordMax}** words total in dialogue_turns, mostly in **short turns**.\n\n${indexLines}\n\n---\n\n`;
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
      ? `\n\n---\n\nPODCAST FACT CHECK: Stay addictive and casual, but every few lines must add a **concrete fact** from the excerpts (who/what/when/where/numbers). Reactions first, then the detail—never hollow hype without substance.`
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


function normalizeTurns(
  raw: unknown,
  minTurns: number,
  outputLanguage: OutputLanguage = "en"
): DialogueTurn[] | null {
  if (!Array.isArray(raw) || raw.length < minTurns) return null;
  const out: DialogueTurn[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") return null;
    const mapped = normalizeDialogueSpeaker((row as { speaker?: string }).speaker);
    const t = String((row as { text?: string }).text ?? "").trim();
    if (!mapped) return null;
    const cleaned = outputLanguage === "en" ? deAnchorDialogueText(t) : t;
    if (cleaned.length < 2) return null;
    const section_break = Boolean((row as { section_break?: boolean }).section_break);
    out.push(
      section_break
        ? { speaker: mapped, text: cleaned, section_break: true }
        : { speaker: mapped, text: cleaned }
    );
  }
  if (out.length < minTurns) return null;
  return outputLanguage === "en" ? coalesceSplitWelcomeTurn(out) : out;
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

/**
 * Parse a plain-text screenplay transcript into DialogueTurn[].
 * Handles lines like:
 *   [KRITI]: Some text here...
 *   [AKSHAY]: Some text here...
 */
function parseProseTranscript(prose: string): DialogueTurn[] {
  const turns: DialogueTurn[] = [];
  // Split on speaker markers — support [KRITI], [AKSHAY], KRITI:, AKSHAY:
  const lines = prose.split(/\n+/);
  let currentSpeaker: DialogueSpeaker | null = null;
  let currentText: string[] = [];

  const flush = () => {
    if (currentSpeaker && currentText.length) {
      const text = currentText.join(" ").trim();
      if (text) turns.push({ speaker: currentSpeaker, text });
    }
    currentText = [];
  };

  for (const line of lines) {
    const m = line.match(/^\[?(KRITI|AKSHAY)\]?:\s*(.*)/i);
    if (m) {
      flush();
      currentSpeaker = m[1].toLowerCase() as DialogueSpeaker;
      if (m[2].trim()) currentText.push(m[2].trim());
    } else if (currentSpeaker && line.trim()) {
      currentText.push(line.trim());
    }
  }
  flush();
  return turns;
}

/** Build prose-first system prompt — no JSON, just screenplay text */
function buildProsePrompt(articles: ExtractedArticle[]): string {
  const articleSummaries = articles.map((a, i) =>
    `Article ${i + 1} [${a.briefing_section ?? "General"}]: ${a.title ?? "Untitled"}\n${a.text?.slice(0, 800) ?? "No content extracted."}`
  ).join("\n\n---\n\n");

  return `You are writing a podcast script for two real people — Kriti and Akshay — who are friends discussing today's news. Think Spotify "The Daily" or "Stuff You Should Know" — two smart people genuinely reacting to stories, not reading from a teleprompter.

Write as PLAIN TEXT SCREENPLAY only:
[KRITI]: text
[AKSHAY]: text

NO JSON. NO markdown. NO headers. NO stage directions.

---

## Who they are
[KRITI] — curious, warm, a bit surprised by facts, connects news to everyday people's lives. Speaks like a real person: "wait, so basically...", "that's the thing though...", "okay but here's what gets me..."
[AKSHAY] — sharp, gives context, explains the WHY behind news. Not a lecturer — more like the friend who always knows what's really going on. Uses: "right, and the reason that matters is...", "here's what most people miss...", "so what's actually happening is..."

---

## BANNED PHRASES — never use these
❌ "Shifting our focus to..."
❌ "Coming to some local news..."
❌ "Speaking of Maharashtra / Speaking of [place]..."
❌ "On the global front..."
❌ "Precisely."
❌ "Indeed."
❌ "It's worth noting that..."
❌ "In today's news..."
❌ Any anchor-style transition

## Natural transitions — use these instead
For local/state news (Maharashtra, Gujarat, etc.) — treat it as a major state, not a small locality:
✅ "Now, there's something big happening in Maharashtra..."
✅ "There's a big one from Maharashtra..."
✅ "Maharashtra's got a story today that's worth your attention..."
✅ "Moving to Maharashtra — and this one's actually fascinating..."

For Pan India / national:
✅ "Okay, so zooming out to the bigger picture..."
✅ "There's another one I wanted to get to..."
✅ "Oh, and this one's got national implications..."

For world news:
✅ "And then there's this one that's playing out globally..."
✅ "On the world stage, something's brewing that could hit us here too..."

---

## News order (mandatory)
1. Reliance / Jio → KRITI opens
2. Maharashtra / Local → AKSHAY opens
3. Pan India → KRITI opens
4. World → AKSHAY opens

---

## Turn length — THE most important rule
Main turns: 3-5 sentences, 50-90 words. One person finishes a full thought before the other responds.
Reactions: 4-10 words only. Use 1-2 per story max.

❌ WRONG:
[KRITI]: Jio expanded in Kerala.
[AKSHAY]: How much?
[KRITI]: A lot, 32% market share.
[AKSHAY]: Wow that's big.

✅ RIGHT:
[KRITI]: So Jio's been quietly dominating Kerala over the last year, and the numbers are actually pretty striking. They've crossed 32% market share in the state, added over 5 lakh subscribers in a single quarter, and they're doing it in a market that's already competitive. The interesting part is this isn't just urban Kerala — they're pushing deep into tier-2 and tier-3 towns where broadband never really reached.
[AKSHAY]: And that's the bet they're making everywhere, right? Like, they're not fighting Airtel for the same customers — they're going after the next 50 million people who aren't even on the internet yet. JioAirFiber at ₹599 is basically saying, if you've never had home broadband, here's your entry point.
[KRITI]: So the growth story isn't about market share. It's about market creation.
[AKSHAY]: Exactly that.

---

## Natural mid-conversation reactions (use them — they sound real)
"Wait, seriously?"
"Okay that's wild."
"Right, and that's the thing."
"Oh wow."
"Huh, I didn't know that."
"That makes sense actually."

---

## Closing (mandatory — last 4 lines exactly)
[AKSHAY]: And those were the stories shaping the day.
[KRITI]: Thanks for spending a few minutes with us.
[AKSHAY]: We'll be back tomorrow with another quick briefing.
[KRITI]: Until then, stay curious, stay informed, and have a great day ahead. See you tomorrow.

---

## Articles:
${articleSummaries}

Write the full screenplay now. Start with the first story directly — intro is handled separately. ONLY screenplay lines, nothing else.`;
}

export async function summarizeArticles(
  articles: ExtractedArticle[],
  outputLanguage: OutputLanguage = "en"
): Promise<SummaryOutput | null> {
  if (!openai || articles.length === 0) return null;
  const budget = dialogueBudgetForArticleCount(articles.length);
  const sectioned = hasBriefingSections(articles);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), SUMMARIZE_MS);

  try {
    // STEP 1: For English, use prose-first generation (better turn quality)
    if (outputLanguage === "en") {
      const proseCompletion = await openai.chat.completions.create(
        {
          model: "gpt-4o",
          messages: [
            { role: "system", content: buildProsePrompt(articles) },
            { role: "user", content: "Write the full podcast screenplay now." },
          ],
          max_tokens: 4000,
        },
        { signal: ac.signal }
      );
      clearTimeout(timer);

      const prose = proseCompletion.choices[0]?.message?.content?.trim() ?? "";
      const parsedTurns = parseProseTranscript(prose);

      if (parsedTurns.length >= 4) {
        const withIntro: DialogueTurn[] = [...INTRO_TURNS, ...parsedTurns];
        const audio_script = optimizeForSpeech(turnsToAudioScript(withIntro), "en");

        // Generate headline + summary_points via a quick JSON call
        const metaCompletion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: `Based on this podcast script, give me a JSON object with:
- "headline": one sentence title for today's briefing
- "summary_points": array of 3 bullet points (key stories)

Script:
${prose.slice(0, 1000)}

Respond with JSON only.`,
            },
          ],
          response_format: { type: "json_object" },
          max_tokens: 300,
        });

        const metaRaw = metaCompletion.choices[0]?.message?.content ?? "{}";
        const meta = parseModelJsonContent(metaRaw);
        const headline = typeof meta?.headline === "string" ? meta.headline.trim() : "Today's AI News Briefing";
        const summary_points = Array.isArray(meta?.summary_points)
          ? (meta.summary_points as string[]).map((x) => String(x).trim()).filter(Boolean)
          : ["Latest Reliance & Jio updates", "State and national news", "Global developments"];

        return { headline, summary_points, audio_script, dialogue_turns: withIntro };
      }
    }

    // STEP 2: Fallback for non-English or if prose parsing failed — use JSON mode
    const userContent = buildUserMessage(articles, outputLanguage, budget);
    const systemPrompt = buildSummarizePrompt(outputLanguage, budget, sectioned);

    const ac2 = new AbortController();
    const timer2 = setTimeout(() => ac2.abort(), SUMMARIZE_MS);

    const completion = await openai.chat.completions.create(
      {
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
        max_tokens: Math.min(14_000, 6000 + 950 * articles.length),
      },
      { signal: ac2.signal }
    );
    clearTimeout(timer2);
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = parseModelJsonContent(raw);
    if (!parsed?.headline || !Array.isArray(parsed.summary_points)) return null;

    let normalized = normalizeTurns(parsed.dialogue_turns, budget.minTurns, outputLanguage);
    if (!normalized && budget.n >= 2 && Array.isArray(parsed.dialogue_turns) && parsed.dialogue_turns.length >= 6) {
      const relaxed = Math.max(6, Math.min(budget.minTurns - 2, Math.ceil(budget.minTurns * 0.7)));
      normalized = normalizeTurns(parsed.dialogue_turns, relaxed, outputLanguage);
    }

    let audio_script: string;
    let dialogue_turns: DialogueTurn[] | undefined;

    if (normalized) {
      const withIntro = [...INTRO_TURNS, ...normalized];
      audio_script = optimizeForSpeech(turnsToAudioScript(withIntro), outputLanguage);
      dialogue_turns = withIntro;
    } else if (typeof parsed.audio_script === "string" && parsed.audio_script.trim()) {
      audio_script = optimizeForSpeech(parsed.audio_script, outputLanguage);
    } else {
      const bullets = (parsed.summary_points as string[]).map((x) => String(x).trim()).filter(Boolean);
      if (bullets.length === 0) return null;
      audio_script = optimizeForSpeech(`${fallbackMonologuePrefix(outputLanguage)}${bullets.join(" ")}`, outputLanguage);
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
