# Mini Apps Dashboard

Single Next.js app: **Figma home** at `/`, **AI News Briefing** at `/briefing` (same origin, port **3000**).

`npm run dev` listens on all interfaces (default), so **http://localhost:3000** works. If a rare Node crash mentions `networkInterfaces`, use **`npm run dev:127`** (127.0.0.1 only).

## Run locally

```bash
npm install
cp .env.example .env.local   # add NEWS_API_KEY, TTS keys, etc. (see ai-news-briefing/.env.example)
npm run dev
```

- Home: http://localhost:3000  
- Briefing: http://localhost:3000/briefing  

Optional **Redis worker** for queued briefings: `npm run dev:queue` (dashboard + worker).

## Deploy (e.g. Render)

One service is enough. Set env vars from `.env.example` / `ai-news-briefing/.env.example`.  
Only set `NEXT_PUBLIC_AI_NEWS_BRIEFING_URL` if the briefing UI is hosted on another origin.

The folder `ai-news-briefing/` remains as a reference copy; the live code paths are under this app.
