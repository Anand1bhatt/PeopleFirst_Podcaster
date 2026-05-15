# Mini Apps

| App | Folder | Description |
|-----|--------|-------------|
| **Mini Apps** (dashboard + AI News Briefing) | [`mini-apps-dashboard/`](mini-apps-dashboard/) | Figma home `/`, briefing `/briefing`, APIs under `/api/*` |
| **AI News Briefing** (reference) | [`ai-news-briefing/`](ai-news-briefing/) | Legacy standalone app; logic merged into dashboard |

## Quick start

```bash
cd mini-apps-dashboard
npm install
cp .env.example .env.local
# Copy env ideas from ai-news-briefing/.env.example (NEWS_API_KEY, OpenAI, etc.)
npm run dev
```

Open http://127.0.0.1:3000 — home and briefing share **one** dev server.

## Repo

<https://github.com/sharmarohit184511/miniapps>
