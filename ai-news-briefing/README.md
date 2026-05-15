# AI News Audio Briefing

Generate a two-host (Akshay / Kriti) dialogue audio briefing from **multiple news sources** (URLs or raw text). Length scales with how many sources you add (**about 1–3 minutes** spoken). Built with Next.js, Tailwind, shadcn/ui, OpenAI, and ElevenLabs / Azure Speech.

## Features

- **Input**: Add multiple sources as article URLs or pasted text, or **search by topic** (NewsAPI): suggested topic chips, preview articles, add URLs to sources, then Generate as usual
- **Extraction**: Mercury → Readability + DOM → **[Jina Reader](https://jina.ai/reader)** (when sites block direct fetches) → meta tags. Set `EXTRACT_DISABLE_JINA=true` if you don’t want URLs sent to `r.jina.ai`.
- **Summarization**: OpenAI returns JSON covering **every source**; dialogue word count scales up to ~3 minutes for several URLs. If dialogue JSON is invalid, a single-voice script is built from bullets.
- **TTS**: With valid dialogue, each line is synthesized with a **male/female voice pair** (Azure: `AZURE_SPEECH_VOICE_MALE` / `FEMALE`; ElevenLabs: `ELEVENLABS_VOICE_AKSHAY` / `KRITI` (legacy ALEX/JAMIE)), then MP3s are concatenated. On any failure, **single-voice** TTS runs on the flat script (same provider order as before).
- **Player**: Skip ±10s, speed (0.75–1.5×), transcript modal (headline, bullets, dialogue).
- **Storage**: Supabase (Postgres + Storage) for briefings and audio
- **Queue**: Optional BullMQ + Redis for background processing
- **Languages (UI)**: **English** and **Hindi** in the briefing form; older locales still accepted via API/DB.
- **Figma embed** (`?figma_demo=1`): Auto-pulls **today’s headlines** across fixed sections (world → Reliance → Jio → AI/tech → India business → sports), builds a **multi-section dialogue** with verbal handoffs and optional **Azure pause** between sections. Falls back to a demo text story if NewsAPI returns no URLs.
- **Figma daily digest API**: `GET/POST /api/figma-daily-digest` — per-day cached summaries for the mini-apps-dashboard feed. Requires migrations **`005_figma_daily_digest.sql`** and **`006_briefing_source_section.sql`** (or updated [`schema.sql`](src/lib/db/schema.sql)). Without Supabase, digests persist under `.briefing-dev-store/digests/`.
- **NewsAPI**: Free tier is **~100 requests/day** (often **50 per 12 hours**). The Figma feed uses **one combined `/everything` query per day** (not six per section). After you run **AI summaries**, saved digests are served **without extra NewsAPI calls** on reload. On **429 / rate limit**, the app **falls back to Google News RSS** (no API key) so the POC keeps working; optional **`NEWS_RSS_FALLBACK=0`** disables that. Identical `/everything` responses are **cached ~10 minutes** (`NEWS_API_CACHE_MS`). After a 429, NewsAPI is skipped for **~20 minutes** (`NEWS_API_COOLDOWN_MS`) while RSS serves traffic. Set **`NEWS_API_FIGMA_PER_SECTION=1`** for the old 6-query-per-section mode (paid tiers). **`NEWS_API_KEY`** in `ai-news-briefing/.env.local` or dashboard’s; in dev, `.env.local` is re-read from disk when the process env doesn’t override.
- **UI**: Minimal dashboard with source input, progress, audio player, and history

## Setup

### 1. Clone and install

```bash
cd ai-news-briefing
npm install
```

**Mini Apps dashboard:** This app’s dev server listens on **http://localhost:3001** (`npm run dev`). The dashboard on **:3000** proxies the News feed here—run both via `npm run dev:all` from `mini-apps-dashboard`, or run this repo’s `npm run dev` in a second terminal. If **:3001** refused connection, the briefing process wasn’t started (or was still on **:3000** before the dev script pinned **3001**).

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `NEWS_API_KEY` | No | NewsAPI for **topic search** and **Figma feed / embed**. Same path fallback as above. Developer tier: same-day `everything` queries are often empty — headlines fallback is used. |
| `OPENAI_DIGEST_MODEL` | No | Model for Figma daily digest blurbs (default `gpt-4o-mini`). |
| `OPENAI_API_KEY` | Yes | Summarization + **fallback TTS** (`tts-1`) if ElevenLabs fails or is omitted; also improves **suggested topic chips** when `NEWS_API_KEY` is set |
| `ELEVENLABS_API_KEY` | No | Optional; needs Text to Speech permission, or audio uses OpenAI only |
| `ELEVENLABS_VOICE_ID` | No | ElevenLabs voice ID (optional; uses first premade from your account if unset) |
| `ELEVENLABS_API_BASE_URL` | No | Default `https://api.elevenlabs.io`. Use `https://api.eu.residency.elevenlabs.io` if your workspace uses EU residency. |
| `AZURE_SPEECH_KEY` | No | **Microsoft Azure Speech** — key from Azure Portal (Speech resource). Used when user picks Azure TTS or as fallback after ElevenLabs. |
| `AZURE_SPEECH_REGION` | No | Azure region for Speech (e.g. `eastus`). Must match your resource. |
| `AZURE_SPEECH_VOICE` | No | Default neural voice for single-voice TTS (default `en-US-JennyNeural`) |
| `AZURE_SPEECH_VOICE_MALE` / `AZURE_SPEECH_VOICE_FEMALE` | No | Akshay / Kriti on Azure dialogue (defaults `en-US-GuyNeural` / `en-US-JennyNeural`) |
| `ELEVENLABS_VOICE_AKSHAY` / `ELEVENLABS_VOICE_KRITI` | No | Per-host ElevenLabs IDs; fall back to `ELEVENLABS_VOICE_ID` |
| `OPENAI_TTS_VOICE` | No | OpenAI single-voice default (`nova`) |
| `OPENAI_TTS_VOICE_AKSHAY` / `OPENAI_TTS_VOICE_KRITI` | No | Dialogue fallback on OpenAI (`onyx` / `nova`) |
| `REDIS_URL` | No | Redis for BullMQ; if omitted, pipeline runs inline |

**ElevenLabs still says “missing_permissions” / text_to_speech?** That almost always means the **API key** is restricted. In [API keys](https://elevenlabs.io/app/settings/api-keys), open your key → **Restrictions** → either turn off restrictions or explicitly enable **Text to speech** (speech generation). Enabling TTS on the account alone does not update restricted keys.

Diagnose from the project folder:

```bash
cd ai-news-briefing && npm run elevenlabs:smoke
```

**Indic languages:** Use **Microsoft Azure** as primary for best neural voices (`hi-IN`, `mr-IN`, `pa-IN`, `bn-IN`). Haryanvi has no separate Azure locale—dialogue is Haryanvi-flavored text read by Hindi voices. ElevenLabs may work for multilingual voices but quality varies.

**Topic search:** Set `NEWS_API_KEY`, open the home page, use **Search by topic** (suggested chips or your own query), preview articles, **Add selected to sources**, then **Generate briefing**. Same extraction → dialogue → audio pipeline as manual URLs.

**TTS order:** On the home page, users choose **ElevenLabs** or **Microsoft Azure Speech** as the primary engine. The pipeline then tries the **other** provider second, then **OpenAI TTS** last. Configure `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION` for Microsoft. At minimum, `OPENAI_API_KEY` can cover audio if both cloud TTS options fail.

**Existing Supabase DB:** Run migrations through `004_output_language.sql` (or align with `schema.sql`).

**Local dev without Supabase:** Briefings and MP3s are stored under `.briefing-dev-store/` so `GET /api/briefings/:id` works across Next.js dev workers and the BullMQ worker. If `GET` still 404s with Supabase, check **Row Level Security** — the server logs will show `Supabase read failed`; add policies so the anon key can `SELECT` (and `INSERT`) on `briefings` and `briefing_sources`.

### 3. Database (Supabase)

In the Supabase SQL editor, run the schema in `src/lib/db/schema.sql` (create `briefings` and `briefing_sources` tables).

Create a storage bucket named `briefing-audio` with public read access so generated audio URLs work.

### 4. Run the app

```bash
npm run dev
```

Open the app (see `package.json` dev port). Add one or more sources and generate—longer briefings when you add more URLs.

### 5. Optional: background worker (with Redis)

If `REDIS_URL` is set, new briefings are queued. Run the worker in a separate process:

```bash
npm run worker
```

Requires `tsx`: `npm install -D tsx`. The worker processes jobs from the queue so the API returns quickly and generation runs in the background.

## Project structure

```
src/
  app/           # Routes: /, /history, /api/briefings
  components/    # UI: source input, audio player, briefing form, history list
  lib/
    ai/           # OpenAI summarization
    db/           # Supabase client, briefings, storage
    pipeline/     # Extract → summarize → TTS → upload
    queue/        # BullMQ client (optional)
    scraper/      # Mercury Parser extraction
    tts/           # ElevenLabs TTS
    utils.ts
  store/          # Zustand briefing state
  types/          # Shared types
  workers/        # BullMQ worker entry
```

## Troubleshooting: stuck on ~9% (scanning first URL)

1. **`REDIS_URL` without worker** — Jobs stay queued forever. From **mini-apps-dashboard**, run **`npm run dev:all:queue`** (starts dashboard + briefing + worker), **or** run `npm run worker` in `ai-news-briefing`, **or** set **`BRIEFING_USE_QUEUE=false`** so the pipeline runs inline after each POST.
   **Figma “today” feed play** (`POST /api/figma-day-briefing`) **runs the pipeline inline by default** (no queue), so the mini-apps dashboard doesn’t need a worker for that flow. Set **`BRIEFING_FIGMA_DAY_USE_QUEUE=1`** only if workers must handle those jobs.
2. **Wrong working directory** — Set **`EXTRACT_SCRAPER_DIR`** to the full path of `ai-news-briefing/src/lib/scraper` if worker scripts aren’t found.
3. **Still stuck** — Set **`EXTRACT_URL_SUBPROCESS=true`** so each URL is extracted in an isolated Node child (heavier but avoids blocking the API server).
4. **Jina** — News sites often need Jina; don’t set `EXTRACT_DISABLE_JINA=true` unless you must.

## API

- `POST /api/briefings` — Body: `{ sources: [{ type, value, briefing_section? }] }`. Returns `{ briefingId }`.
- `GET /api/figma-daily-digest` — `?date=`, `?list=1`, `?briefing_sources=1`, `ensureDigest=1`. `POST` regenerates digest for a date.
- `GET /api/briefings/[id]` — Returns briefing with status, summary, `audio_url` when completed.
- `GET /api/briefings/list` — Returns `{ briefings }` for history.

## Typography (JioType)

The app uses **JioType** as the sole UI font. Place your licensed `JioType.woff2` (or variable font) in `public/fonts/jiotype/` — see `public/fonts/jiotype/README.md`. The repo may ship a placeholder file so layout works until you add official JioType files.

## Multilingual testing (manual)

| Language | Check |
|----------|-------|
| English | Dialogue + audio; Figma section handoffs |
| Hindi | Devanagari; `hi-IN` Azure voices |

## License

MIT
