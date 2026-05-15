import type { NextRequest } from "next/server";
import { headers } from "next/headers";

function trimSlash(u: string): string {
  return u.replace(/\/$/, "");
}

/**
 * `NEXT_PUBLIC_AI_NEWS_BRIEFING_URL` is for **browser** iframes (e.g. dev: briefing on :3001).
 * Server-side routes like `/api/figma-daily-feed` must call **this deployment** — using
 * localhost here breaks on Render (nothing listening on :3001 inside the container).
 */
function isLoopbackOrigin(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname === "::1"
    );
  } catch {
    return false;
  }
}

/**
 * Public base URL for server-side `fetch()` to this app’s own API routes (or split backend).
 *
 * Behind Render/Vercel/other proxies, `request.nextUrl.origin` is often wrong (e.g.
 * `https://localhost:10000` — internal bind port). Prefer env + `X-Forwarded-*`.
 */
export function getBriefingApiOrigin(request: NextRequest): string {
  const serverOnly = process.env.AI_NEWS_BRIEFING_URL?.trim();
  if (serverOnly && !isLoopbackOrigin(serverOnly)) {
    return trimSlash(serverOnly);
  }

  const render = process.env.RENDER_EXTERNAL_URL?.trim();
  if (render) return trimSlash(render);

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return trimSlash(`https://${vercel}`);

  const publicApp = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (publicApp) return trimSlash(publicApp);

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwardedHost) {
    const proto =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    return `${proto}://${forwardedHost}`;
  }

  const publicBriefing = process.env.NEXT_PUBLIC_AI_NEWS_BRIEFING_URL?.trim();
  if (publicBriefing && !isLoopbackOrigin(publicBriefing)) {
    return trimSlash(publicBriefing);
  }

  return request.nextUrl.origin;
}

/**
 * Same origin resolution as {@link getBriefingApiOrigin} for Server Components / when
 * only `headers()` is available (no `NextRequest`).
 */
export async function getBriefingApiOriginFromHeaders(): Promise<string> {
  const h = await headers();

  const serverOnly = process.env.AI_NEWS_BRIEFING_URL?.trim();
  if (serverOnly && !isLoopbackOrigin(serverOnly)) {
    return trimSlash(serverOnly);
  }

  const render = process.env.RENDER_EXTERNAL_URL?.trim();
  if (render) return trimSlash(render);

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return trimSlash(`https://${vercel}`);

  const publicApp = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (publicApp) return trimSlash(publicApp);

  const forwardedHost = h.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwardedHost) {
    const proto =
      h.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    return `${proto}://${forwardedHost}`;
  }

  const publicBriefing = process.env.NEXT_PUBLIC_AI_NEWS_BRIEFING_URL?.trim();
  if (publicBriefing && !isLoopbackOrigin(publicBriefing)) {
    return trimSlash(publicBriefing);
  }

  return getBriefingApiBase();
}

/** Fallback when no Request (workers / scripts). */
export function getBriefingApiBase(): string {
  const serverOnly = process.env.AI_NEWS_BRIEFING_URL?.trim();
  if (serverOnly && !isLoopbackOrigin(serverOnly)) return trimSlash(serverOnly);
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL)
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  const pub = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (pub) return pub.replace(/\/$/, "");
  const publicBriefing = process.env.NEXT_PUBLIC_AI_NEWS_BRIEFING_URL?.trim();
  if (publicBriefing && !isLoopbackOrigin(publicBriefing)) {
    return trimSlash(publicBriefing);
  }
  return "http://127.0.0.1:3000";
}

/** Make stored briefing audio paths usable from the browser (same logic as briefing-status API). */
export function absoluteBriefingAudioUrl(
  base: string,
  audioUrl: string | null | undefined
): string | null {
  if (!audioUrl || typeof audioUrl !== "string") return null;
  const trimmed = base.replace(/\/$/, "");
  if (/^https?:\/\//i.test(audioUrl)) return audioUrl;
  return `${trimmed}${audioUrl.startsWith("/") ? "" : "/"}${audioUrl}`;
}
