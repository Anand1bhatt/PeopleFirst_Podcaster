# AI News Briefing Podcast — Meeting Context
_Last updated: 2026-06-14 | Demo meeting tomorrow_

## Project
- **Repo:** https://github.com/Anand1bhatt/PeopleFirst_Podcaster
- **Local path:** `/Users/anand1.bhatt/Documents/AI - Experiment/PeopleFirst_Podcaster/mini-apps-dashboard`
- **Dev server:** `npm run dev` → http://localhost:3000
- **Dashboard:** http://localhost:3000/dashboard/ai-news-briefing

## Hosts
| Host | Speaker key | Voice | TTS |
|------|-------------|-------|-----|
| Kriti | `kriti` | `simran` (female) | Sarvam AI bulbul:v3 |
| Akshay | `akshay` | `shubh` (male) | Sarvam AI bulbul:v3 |

## TTS Stack
- **Primary:** Sarvam AI (bulbul:v3) — `SARVAM_API_KEY` in .env.local
- **Fallback:** OpenAI TTS → ElevenLabs → Microsoft Azure
- **ElevenLabs:** Free plan = API blocked (402). Need paid plan.
- **Sarvam returns WAV** → converted to MP3 via ffmpeg before pipeline merge

## News Section Order (MANDATORY)
1. **Reliance / Jio** → Kriti leads
2. **Local / State (Maharashtra)** → Akshay leads
3. **Pan India** → Kriti leads
4. **World** → Akshay leads

## Conversation Patterns A–F
- **A:** Kriti introduces → Akshay explains (Story 1 default)
- **B:** Akshay introduces → Kriti reacts (Story 2 default)
- **C:** Akshay observation → Kriti question (Story 2 variation)
- **D:** Kriti surprising fact → Akshay expands (Story 3)
- **E:** Akshay connects stories → Kriti explores (Story 4)
- **F:** Both co-discuss before explaining (any story variation)

## Host Rules
- BOTH hosts lead stories (strict alternation — no female domination)
- Lead host: 40-60 word intro in ONE turn
- Supporting host: reacts, asks, builds (8-15 words)
- NO rapid Q&A ping-pong
- NO anchor clichés

## Fixed Intro (prepended to every English briefing)
> **KRITI:** "Hey Reliance family, welcome back to the AI News Briefing Podcast — your quick catch-up on everything happening today. I'm Kriti."
> **AKSHAY:** "And I'm Akshay."

## Script Validation Flow
1. POST `/api/briefings` or `/api/auto-briefing` → pipeline runs extraction + summarization
2. Status becomes `awaiting_approval` — script is shown for review
3. Approve → POST `/api/briefings/{id}/approve` → TTS generation starts
4. Status becomes `completed` → audio at `/api/briefings/{id}/audio`

## Generate Briefing (auto, correct categories)
```bash
curl -X POST http://localhost:3000/api/auto-briefing
```

## Key Files
| File | Purpose |
|------|---------|
| `src/lib/ai/summarize.ts` | AI prompt — news order, patterns A-F, host rotation |
| `src/lib/tts/sarvam-speech.ts` | Sarvam TTS (bulbul:v3, simran/shubh) |
| `src/lib/tts/dialogue-tts.ts` | TTS orchestration + fallbacks |
| `src/lib/pipeline/run.ts` | Pipeline — pauses at awaiting_approval |
| `src/app/api/briefings/[id]/approve/route.ts` | Approve script → triggers TTS |
| `src/app/api/auto-briefing/route.ts` | Fetches news by category |
| `src/lib/db/briefings.ts` | DB — tts_provider routing fixed |
| `.env.local` | API keys (SARVAM, OPENAI, ELEVENLABS) |
| `PIPELINE_BREAKDOWN.md` | Full pipeline documentation |
| `.cursor/skills/ai-podcast-system/SKILL.md` | Full system skill |

## Known Issues / Watch Out
- ElevenLabs: free plan = 402 error, use Sarvam or OpenAI
- NewsAPI sometimes returns irrelevant articles — auto-briefing has validation
- Sarvam returns WAV (not MP3) — ffmpeg conversion required
- DB layer was hardcoded to "elevenlabs" — now fixed to support sarvam/openai
- Turn lengths still trending short — ongoing prompt tuning needed
