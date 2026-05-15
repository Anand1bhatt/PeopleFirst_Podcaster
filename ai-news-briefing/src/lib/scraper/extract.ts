import { spawn } from "child_process";
import { randomBytes } from "crypto";
import { existsSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import type { Source } from "@/types";

export type ExtractedArticle = {
  title: string;
  text: string;
  url: string;
  briefing_section?: string;
};

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** JSDOM + Readability on multi‑MB HTML blocks the Node event loop → timers never run → “stuck at 9%”. */
const MAX_HTML_FOR_FETCH = Math.min(
  Math.max(Number(process.env.EXTRACT_MAX_HTML_CHARS ?? "450000") || 450000, 120000),
  1_500_000
);
const MAX_HTML_FOR_PARSE = Math.min(MAX_HTML_FOR_FETCH, 450_000);

/** Any JSDOM on the main thread uses at most this many chars (avoids event-loop freeze). */
const MAIN_THREAD_HTML_CAP = Math.min(
  Math.max(Number(process.env.EXTRACT_MAIN_THREAD_HTML ?? "52000") || 52000, 24_000),
  120_000
);

let warnedMissingWorkers = false;

function resolveWorkerScript(file: string): string | null {
  const envDir = process.env.EXTRACT_SCRAPER_DIR?.trim();
  const candidates = [
    envDir ? path.join(envDir, file) : "",
    path.join(process.cwd(), "src", "lib", "scraper", file),
    path.join(process.cwd(), "ai-news-briefing", "src", "lib", "scraper", file),
    path.join(process.cwd(), "..", "ai-news-briefing", "src", "lib", "scraper", file),
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  if (!warnedMissingWorkers && file === "html-extract-worker.cjs") {
    warnedMissingWorkers = true;
    console.warn(
      "[extract] Worker scripts not found (checked cwd, ai-news-briefing/, ../ai-news-briefing). Set EXTRACT_SCRAPER_DIR to src/lib/scraper or run the app from the ai-news-briefing folder."
    );
  }
  return null;
}

/** Subprocess parse so the main thread keeps serving progress timers (fixes stuck 9%). */
const USE_PARSE_SUBPROCESS =
  process.env.EXTRACT_SYNC_PARSE !== "true" && process.env.EXTRACT_DISABLE_SUBPROCESS !== "true";

function runHtmlExtractWorker(
  pageUrl: string,
  html: string,
  timeoutMs: number
): Promise<ExtractedArticle | null> {
  const script = resolveWorkerScript("html-extract-worker.cjs");
  if (!script) return Promise.resolve(null);
  const tmpFile = path.join(
    tmpdir(),
    `brief-ext-${randomBytes(12).toString("hex")}.html`
  );
  try {
    writeFileSync(tmpFile, html.slice(0, 300_000), "utf8");
  } catch (e) {
    console.warn("[extract] html worker temp file", e);
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, [script, pageUrl, tmpFile], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        EXTRACT_WORKER_HTML_MAX: String(Math.min(html.length, 220000)),
      },
      windowsHide: true,
    });
    let out = "";
    proc.stdout?.on("data", (d: Buffer) => {
      out += d.toString();
    });
    const killer = setTimeout(() => {
      proc.kill("SIGKILL");
      console.warn("[extract] html worker timeout", timeoutMs, "ms", pageUrl.slice(0, 60));
      try {
        unlinkSync(tmpFile);
      } catch {
        /* ignore */
      }
      resolve(null);
    }, timeoutMs);
    proc.on("error", (err) => {
      clearTimeout(killer);
      console.warn("[extract] html worker spawn", err.message);
      try {
        unlinkSync(tmpFile);
      } catch {
        /* ignore */
      }
      resolve(null);
    });
    proc.on("close", () => {
      clearTimeout(killer);
      try {
        unlinkSync(tmpFile);
      } catch {
        /* ignore */
      }
      try {
        const j = JSON.parse(out.trim()) as {
          ok?: boolean;
          title?: string;
          text?: string;
          url?: string;
        };
        if (j?.ok && j.text && j.text.length >= 80) {
          resolve({
            title: (j.title ?? "Untitled").trim() || "Untitled",
            text: j.text.slice(0, 50000),
            url: j.url ?? pageUrl,
          });
        } else {
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    });
  });
}

function runMercuryWorker(pageUrl: string, timeoutMs: number): Promise<ExtractedArticle | null> {
  const script = resolveWorkerScript("mercury-worker.cjs");
  if (!script) return Promise.resolve(null);
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, [script, pageUrl, CHROME_UA], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
      windowsHide: true,
    });
    let out = "";
    proc.stdout?.on("data", (d: Buffer) => {
      out += d.toString();
    });
    const killer = setTimeout(() => {
      proc.kill("SIGKILL");
      console.warn("[extract] mercury worker timeout", timeoutMs, "ms", pageUrl.slice(0, 60));
      resolve(null);
    }, timeoutMs);
    proc.on("error", (err) => {
      clearTimeout(killer);
      console.warn("[extract] mercury worker spawn", err.message);
      resolve(null);
    });
    proc.on("close", () => {
      clearTimeout(killer);
      try {
        const j = JSON.parse(out.trim()) as { ok?: boolean; title?: string; text?: string; url?: string };
        if (j?.ok && j.text && j.text.length >= 80) {
          resolve({
            title: j.title ?? "Untitled",
            text: j.text.slice(0, 50000),
            url: j.url ?? pageUrl,
          });
        } else {
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    });
  });
}

/** Entire URL extract in a child process; parent stays responsive (belt-and-suspenders). */
function runExtractUrlSubprocess(rawUrl: string, wallMs: number): Promise<ExtractedArticle | null> {
  const script = resolveWorkerScript("extract-url-worker.cjs");
  if (!script) return Promise.resolve(null);
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, [script, rawUrl.trim()], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
      windowsHide: true,
    });
    let out = "";
    proc.stdout?.on("data", (d: Buffer) => {
      out += d.toString();
    });
    const killer = setTimeout(() => {
      proc.kill("SIGKILL");
      console.warn("[extract] extract-url-worker wall timeout", wallMs, "ms", rawUrl.slice(0, 70));
      resolve(null);
    }, wallMs);
    proc.on("error", (err) => {
      clearTimeout(killer);
      console.warn("[extract] extract-url-worker spawn", err.message);
      resolve(null);
    });
    proc.on("close", () => {
      clearTimeout(killer);
      try {
        const j = JSON.parse(out.trim()) as {
          ok?: boolean;
          title?: string;
          text?: string;
          url?: string;
        };
        if (j?.ok && j.text && String(j.text).length >= 80) {
          resolve({
            title: String(j.title ?? "Untitled").trim() || "Untitled",
            text: String(j.text).slice(0, 50000),
            url: String(j.url ?? normalizeUrl(rawUrl)),
          });
        } else {
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    });
  });
}

function normalizeUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (!/^https?:\/\//i.test(t)) return `https://${t}`;
  return t;
}

async function fetchPageHtml(url: string): Promise<string | null> {
  let origin = "";
  try {
    origin = new URL(url).origin;
  } catch {
    /* ignore */
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": CHROME_UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        ...(origin ? { Referer: origin + "/" } : {}),
      },
    });
    if (!res.ok) {
      console.warn("[extract] fetch HTTP", res.status, url.slice(0, 80));
      return null;
    }
    const BODY_MS = Math.min(
      Math.max(Number(process.env.EXTRACT_FETCH_BODY_TIMEOUT_MS ?? "22000") || 22000, 8000),
      60000
    );
    const html = await Promise.race([
      res.text(),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("FETCH_BODY_TIMEOUT")), BODY_MS)
      ),
    ]).catch((e) => {
      console.warn("[extract] fetch body slow/hung", url.slice(0, 70), e);
      return null;
    });
    if (html == null || typeof html !== "string") return null;
    const trimmed = html.length > MAX_HTML_FOR_FETCH ? html.slice(0, MAX_HTML_FOR_FETCH) : html;
    return trimmed.length > 100 ? trimmed : null;
  } catch (e) {
    console.warn("[extract] fetch failed", url.slice(0, 80), e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function extractWithMercury(url: string): Promise<ExtractedArticle | null> {
  const ms = Math.min(
    Math.max(Number(process.env.EXTRACT_MERCURY_TIMEOUT_MS ?? "24000") || 24000, 8000),
    120000
  );
  if (USE_PARSE_SUBPROCESS && resolveWorkerScript("mercury-worker.cjs")) {
    return runMercuryWorker(url, ms);
  }
  if (USE_PARSE_SUBPROCESS) {
    return null;
  }
  try {
    const Mercury = (await import("@postlight/mercury-parser")).default;
    const result = await Promise.race([
      Mercury.parse(url, {
        contentType: "text",
        headers: { "User-Agent": CHROME_UA },
      }),
      new Promise<null>((_, rej) => setTimeout(() => rej(new Error("MERCURY_TIMEOUT")), ms)),
    ]);
    if (!result?.content) return null;
    const text = result.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text.length < 80) return null;
    return { title: result.title ?? "Untitled", text: text.slice(0, 50000), url };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg !== "MERCURY_TIMEOUT") console.warn("[extract] Mercury failed", url.slice(0, 60), e);
    return null;
  }
}

function extractWithReadability(url: string, html: string): ExtractedArticle | null {
  try {
    const h = html.length > MAIN_THREAD_HTML_CAP ? html.slice(0, MAIN_THREAD_HTML_CAP) : html;
    const dom = new JSDOM(h, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    const text = article?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (text.length < 80) return null;
    return {
      title: (article?.title ?? "Untitled").trim() || "Untitled",
      text: text.slice(0, 50000),
      url,
    };
  } catch (e) {
    console.warn("[extract] Readability failed", e);
    return null;
  }
}

function extractDomHeuristic(url: string, html: string): ExtractedArticle | null {
  try {
    const h = html.length > MAIN_THREAD_HTML_CAP ? html.slice(0, MAIN_THREAD_HTML_CAP) : html;
    const dom = new JSDOM(h, { url });
    const doc = dom.window.document;
    doc
      .querySelectorAll(
        "script,style,noscript,iframe,svg,nav,footer,header,aside,[role=navigation],[role=banner],[role=contentinfo]"
      )
      .forEach((el) => el.remove());
    const root =
      doc.querySelector("article") ??
      doc.querySelector('[role="main"]') ??
      doc.querySelector("main") ??
      doc.body;
    if (!root) return null;
    const text = root.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (text.length < 120) return null;
    const h1 = doc.querySelector("h1")?.textContent?.trim();
    return {
      title: h1 && h1.length < 200 ? h1 : "Article",
      text: text.slice(0, 50000),
      url,
    };
  } catch {
    return null;
  }
}

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/gi, " ");
}

/** Regex-only — no JSDOM on main thread (meta parse was still freezing some pages). */
function extractFromMetaRegex(pageUrl: string, html: string): ExtractedArticle | null {
  const head = html.slice(0, 150_000);
  const metaContent = (prop: string): string | undefined => {
    const a = head.match(
      new RegExp(`property=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i")
    );
    const b = head.match(
      new RegExp(`content=["']([^"']*)["'][^>]*property=["']${prop}["']`, "i")
    );
    return (a?.[1] ?? b?.[1])?.trim();
  };
  const nameContent = (n: string): string | undefined => {
    const a = head.match(new RegExp(`name=["']${n}["'][^>]*content=["']([^"']*)["']`, "i"));
    const b = head.match(new RegExp(`content=["']([^"']*)["'][^>]*name=["']${n}["']`, "i"));
    return (a?.[1] ?? b?.[1])?.trim();
  };
  let title =
    decodeBasicEntities(metaContent("og:title") ?? nameContent("twitter:title") ?? "").trim() ||
    decodeBasicEntities(head.match(/<title[^>]*>([^<]{1,300})<\/title>/i)?.[1]?.trim() ?? "") ||
    "Article";
  title = title.replace(/\s+/g, " ").trim().slice(0, 200);
  const desc = decodeBasicEntities(
    metaContent("og:description") ??
      nameContent("twitter:description") ??
      nameContent("description") ??
      ""
  )
    .replace(/\s+/g, " ")
    .trim();
  const text = `${title}. ${desc}`.replace(/\s+/g, " ").trim();
  if (text.length < 100) return null;
  return {
    title: title || "Article",
    text: text.slice(0, 50000),
    url: pageUrl,
  };
}

/**
 * Jina Reader fetches the page from their edge — works when the origin blocks datacenter IPs.
 * Set EXTRACT_DISABLE_JINA=true to skip (URLs are sent to r.jina.ai).
 */
async function extractWithJina(url: string): Promise<ExtractedArticle | null> {
  if (process.env.EXTRACT_DISABLE_JINA === "true") return null;
  const jinaTarget = `https://r.jina.ai/${encodeURIComponent(url)}`;
  const controller = new AbortController();
  const jinaFetchMs = Math.min(
    Math.max(Number(process.env.EXTRACT_JINA_FETCH_MS ?? "32000") || 32000, 12000),
    60000
  );
  const timer = setTimeout(() => controller.abort(), jinaFetchMs);
  try {
    const res = await fetch(jinaTarget, {
      signal: controller.signal,
      headers: {
        Accept: "text/plain",
        "X-Return-Format": "markdown",
        "X-Timeout": "40",
        "User-Agent": CHROME_UA,
      },
    });
    if (!res.ok) {
      console.warn("[extract] Jina HTTP", res.status);
      return null;
    }
    const BODY_MS = Math.min(
      Math.max(Number(process.env.EXTRACT_JINA_BODY_TIMEOUT_MS ?? "28000") || 28000, 12000),
      90000
    );
    const raw = await Promise.race([
      res.text(),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("JINA_BODY_TIMEOUT")), BODY_MS)
      ),
    ]).catch((e) => {
      if (e instanceof Error && e.message === "JINA_BODY_TIMEOUT") {
        console.warn("[extract] Jina body read timed out", BODY_MS, "ms", url.slice(0, 60));
      }
      return null;
    });
    if (raw == null || typeof raw !== "string") return null;
    if (!raw || raw.length < 80) return null;

    let title = "Article";
    const titleM = raw.match(/^Title:\s*(.+)$/m);
    if (titleM) title = titleM[1].trim().slice(0, 200);

    let body = raw;
    const mdIdx = raw.indexOf("Markdown Content:");
    if (mdIdx !== -1) {
      body = raw.slice(mdIdx + "Markdown Content:".length).trim();
    } else {
      body = raw.replace(/^Title:\s*.+\n?/m, "")
        .replace(/^URL Source:\s*.+\n?/gm, "")
        .replace(/^Published Time:\s*.+\n?/gm, "")
        .trim();
    }

    const text = body
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/#{1,6}\s+/g, "")
      .replace(/[*_`|]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (text.length < 100) return null;
    const h1 = body.match(/^#\s+(.+)$/m);
    if (h1 && title === "Article") title = h1[1].trim().slice(0, 200);

    return {
      title,
      text: text.slice(0, 50000),
      url,
    };
  } catch (e) {
    console.warn("[extract] Jina failed", url.slice(0, 60), e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function extractFromUrl(rawUrl: string): Promise<ExtractedArticle | null> {
  const url = normalizeUrl(rawUrl);
  if (!url.startsWith("http")) return null;

  try {
    const jinaOff = process.env.EXTRACT_DISABLE_JINA === "true";

    // Run Jina Reader and direct fetch in parallel. Sites like republicworld.com block datacenter
    // fetch; waiting 25s for HTML then Jina often exceeded per-URL caps. Parallel fixes that.
    let jina: ExtractedArticle | null = null;
    let html: string | null = null;
    if (!jinaOff) {
      [jina, html] = await Promise.all([extractWithJina(url), fetchPageHtml(url)]);
    } else {
      html = await fetchPageHtml(url);
    }

    if (jina) return jina;

    if (html && html.length > MAX_HTML_FOR_PARSE) {
      html = html.slice(0, MAX_HTML_FOR_PARSE);
    }

    if (html) {
      const workerMs = Math.min(
        Math.max(Number(process.env.EXTRACT_HTML_WORKER_MS ?? "22000") || 22000, 10000),
        45000
      );
      if (USE_PARSE_SUBPROCESS && resolveWorkerScript("html-extract-worker.cjs")) {
        const w = await runHtmlExtractWorker(url, html, workerMs);
        if (w) return w;
      }
      const small = html.slice(0, MAIN_THREAD_HTML_CAP);
      const readable = extractWithReadability(url, small);
      if (readable) return readable;
      const dom = extractDomHeuristic(url, small);
      if (dom) return dom;
    }

    const mercury = await extractWithMercury(url);
    if (mercury) return mercury;

    if (html) {
      const meta = extractFromMetaRegex(url, html);
      if (meta) return meta;
    }

    return null;
  } catch (e) {
    console.warn("[extract] extractFromUrl error", url.slice(0, 70), e);
    return null;
  }
}

export function extractFromText(raw: string, title?: string): ExtractedArticle {
  const text = raw.replace(/\s+/g, " ").trim().slice(0, 50000);
  return {
    title: title ?? "Pasted content",
    text,
    url: "",
  };
}

export type ExtractSourceTickInfo = {
  index: number;
  total: number;
  source: Source;
  /** Seconds since this URL started */
  elapsedSec: number;
};

/** Fast fetch + meta/title only so failed full extracts still become a briefing source. */
async function extractUrlLiteMeta(rawUrl: string): Promise<ExtractedArticle | null> {
  const url = normalizeUrl(rawUrl);
  if (!url.startsWith("http")) return null;
  let origin = "";
  try {
    origin = new URL(url).origin;
  } catch {
    return null;
  }
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 14000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": CHROME_UA,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        ...(origin ? { Referer: origin + "/" } : {}),
      },
    });
    if (!res.ok) return null;
    const html = await Promise.race([
      res.text(),
      new Promise<null>((_, rej) => setTimeout(() => rej(new Error("t")), 11000)),
    ]).catch(() => null);
    if (!html || typeof html !== "string" || html.length < 80) return null;
    const slice = html.length > 130_000 ? html.slice(0, 130_000) : html;
    const meta = extractFromMetaRegex(url, slice);
    if (meta && meta.text.length >= 60) {
      return {
        title: meta.title,
        text: `${meta.text}\n\n[PARTIAL: full article body unavailable; still cover this as its own item alongside other sources.]`,
        url,
      };
    }
    const h1 = slice.match(/<h1[^>]*>([^<]{5,400})<\/h1>/i);
    if (h1?.[1]) {
      const title = decodeBasicEntities(h1[1].replace(/\s+/g, " ").trim()).slice(0, 200);
      return {
        title: title || "Article",
        text: `[PARTIAL] Headline only. URL: ${url}. Expand with general knowledge of this outlet/topic and discuss alongside other sources.`,
        url,
      };
    }
  } catch {
    /* ignore */
  } finally {
    clearTimeout(t);
  }
  return null;
}

function stubArticleForFailedUrl(rawUrl: string): ExtractedArticle {
  const url = normalizeUrl(rawUrl);
  let host = "news site";
  try {
    host = new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    /* ignore */
  }
  return {
    title: `Story from ${host}`,
    text: `The user listed this URL as one of several news sources: ${url}. Full text could not be retrieved. The hosts MUST still discuss this as a separate item—infer likely topic from the URL path and domain—and connect it to the other stories. Do not merge into a single story.`,
    url,
  };
}

export async function extractSources(
  sources: Source[],
  options?: {
    onSourceStart?: (info: {
      index: number;
      total: number;
      source: Source;
    }) => void | Promise<void>;
    /** Fired every ~8s while a URL is fetching so UI doesn’t look frozen at ~9%. */
    onSourceTick?: (info: ExtractSourceTickInfo) => void | Promise<void>;
  }
): Promise<ExtractedArticle[]> {
  const results: ExtractedArticle[] = [];
  const total = sources.length;
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    // Don’t await: slow/hung Supabase progress writes must not block extraction (fixes stuck 5%).
    const cb = options?.onSourceStart?.({ index: i, total, source: src });
    if (cb != null && typeof (cb as Promise<void>).then === "function") {
      void (cb as Promise<void>).catch(() => {});
    }
    if (src.type === "url") {
      const perUrlMs = Math.min(
        Math.max(Number(process.env.EXTRACT_PER_URL_TIMEOUT_MS ?? "85000") || 85000, 35000),
        180000
      );
      const useUrlSubprocess =
        process.env.EXTRACT_URL_SUBPROCESS === "true" &&
        resolveWorkerScript("extract-url-worker.cjs") != null;
      let host = "";
      try {
        const u = new URL(/^https?:\/\//i.test(src.value.trim()) ? src.value.trim() : `https://${src.value.trim()}`);
        host = u.hostname;
      } catch {
        /* ignore */
      }
      const t0 = Date.now();
      console.log(
        "[extract] url start",
        host || src.value.slice(0, 64),
        useUrlSubprocess ? "subprocess" : "inline"
      );
      const started = Date.now();
      const tickMs = 6000;
      const tick = setInterval(() => {
        const elapsedSec = Math.floor((Date.now() - started) / 1000);
        const t = options?.onSourceTick?.({ index: i, total, source: src, elapsedSec });
        if (t != null && typeof (t as Promise<void>).then === "function") {
          void (t as Promise<void>).catch(() => {});
        }
      }, tickMs);
      try {
        const article = await Promise.race([
          useUrlSubprocess
            ? runExtractUrlSubprocess(src.value, perUrlMs)
            : extractFromUrl(src.value),
          new Promise<null>((resolve) =>
            setTimeout(() => {
              console.warn("[extract] per-URL cap", perUrlMs, "ms", src.value.slice(0, 80));
              resolve(null);
            }, perUrlMs)
          ),
        ]);
        let finalArticle = article;
        if (!finalArticle) {
          finalArticle = await extractUrlLiteMeta(src.value);
        }
        if (!finalArticle) {
          finalArticle = stubArticleForFailedUrl(src.value);
          console.warn("[extract] url stub (no extract)", host || src.value.slice(0, 50));
        } else if (!article) {
          console.log("[extract] url lite-meta fallback", host || "?");
        }
        console.log(
          "[extract] url done",
          host || "?",
          Date.now() - t0,
          "ms",
          article ? "ok" : finalArticle ? "fallback" : "stub"
        );
        const withSection =
          src.briefing_section?.trim() && finalArticle
            ? { ...finalArticle, briefing_section: src.briefing_section.trim() }
            : finalArticle;
        results.push(withSection!);
      } finally {
        clearInterval(tick);
      }
    } else {
      results.push(extractFromText(src.value, src.title));
    }
  }
  return results;
}
