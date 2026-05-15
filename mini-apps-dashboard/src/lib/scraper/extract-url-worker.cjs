/**
 * Full per-URL extraction in an isolated process (parent never blocks on parse/fetch).
 * Usage: node extract-url-worker.cjs <url>
 * Prints one JSON line: { ok:true, title, text, url } | { ok:false }
 */
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { randomBytes } = require("crypto");
const { spawnSync } = require("child_process");

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SCRAPER_DIR = __dirname;
const MAX_FETCH = Math.min(
  Math.max(parseInt(process.env.EXTRACT_MAX_HTML_CHARS || "450000", 10) || 450000, 120000),
  1500000
);

function normalizeUrl(raw) {
  const t = String(raw || "").trim();
  if (!t) return t;
  if (!/^https?:\/\//i.test(t)) return `https://${t}`;
  return t;
}

function decodeBasicEntities(s) {
  return String(s || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/gi, " ");
}

function extractFromMetaRegex(pageUrl, html) {
  const head = html.slice(0, 150000);
  const metaContent = (prop) => {
    const a = head.match(new RegExp(`property=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i"));
    const b = head.match(new RegExp(`content=["']([^"']*)["'][^>]*property=["']${prop}["']`, "i"));
    return (a?.[1] ?? b?.[1])?.trim();
  };
  const nameContent = (n) => {
    const a = head.match(new RegExp(`name=["']${n}["'][^>]*content=["']([^"']*)["']`, "i"));
    const b = head.match(new RegExp(`content=["']([^"']*)["'][^>]*name=["']${n}["']`, "i"));
    return (a?.[1] ?? b?.[1])?.trim();
  };
  let title =
    decodeBasicEntities(metaContent("og:title") || nameContent("twitter:title") || "").trim() ||
    decodeBasicEntities(head.match(/<title[^>]*>([^<]{1,300})<\/title>/i)?.[1]?.trim() || "") ||
    "Article";
  title = title.replace(/\s+/g, " ").trim().slice(0, 200);
  const desc = decodeBasicEntities(
    metaContent("og:description") || nameContent("twitter:description") || nameContent("description") || ""
  )
    .replace(/\s+/g, " ")
    .trim();
  const text = `${title}. ${desc}`.replace(/\s+/g, " ").trim();
  if (text.length < 100) return null;
  return { title: title || "Article", text: text.slice(0, 50000), url: pageUrl };
}

async function fetchPageHtml(url) {
  let origin = "";
  try {
    origin = new URL(url).origin;
  } catch {}
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": CHROME_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        ...(origin ? { Referer: origin + "/" } : {}),
      },
    });
    if (!res.ok) return null;
    const BODY_MS = Math.min(Math.max(parseInt(process.env.EXTRACT_FETCH_BODY_TIMEOUT_MS || "22000", 10) || 22000, 8000), 60000);
    const html = await Promise.race([
      res.text(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), BODY_MS)),
    ]).catch(() => null);
    if (!html || typeof html !== "string") return null;
    const trimmed = html.length > MAX_FETCH ? html.slice(0, MAX_FETCH) : html;
    return trimmed.length > 100 ? trimmed : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function extractWithJina(url) {
  if (process.env.EXTRACT_DISABLE_JINA === "true") return null;
  const jinaTarget = `https://r.jina.ai/${encodeURIComponent(url)}`;
  const controller = new AbortController();
  const ms = Math.min(Math.max(parseInt(process.env.EXTRACT_JINA_FETCH_MS || "32000", 10) || 32000, 12000), 60000);
  const timer = setTimeout(() => controller.abort(), ms);
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
    if (!res.ok) return null;
    const BODY_MS = Math.min(Math.max(parseInt(process.env.EXTRACT_JINA_BODY_TIMEOUT_MS || "28000", 10) || 28000, 12000), 90000);
    const raw = await Promise.race([
      res.text(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("t")), BODY_MS)),
    ]).catch(() => null);
    if (!raw || raw.length < 80) return null;
    let title = "Article";
    const titleM = raw.match(/^Title:\s*(.+)$/m);
    if (titleM) title = titleM[1].trim().slice(0, 200);
    let body = raw;
    const mdIdx = raw.indexOf("Markdown Content:");
    if (mdIdx !== -1) body = raw.slice(mdIdx + "Markdown Content:".length).trim();
    else {
      body = raw
        .replace(/^Title:\s*.+\n?/m, "")
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
    return { title, text: text.slice(0, 50000), url };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function runHtmlWorker(pageUrl, html) {
  const hw = path.join(SCRAPER_DIR, "html-extract-worker.cjs");
  if (!fs.existsSync(hw)) return null;
  const tmp = path.join(os.tmpdir(), `euw-${randomBytes(10).toString("hex")}.html`);
  try {
    fs.writeFileSync(tmp, html.slice(0, 300000), "utf8");
  } catch {
    return null;
  }
  const workerMs = Math.min(Math.max(parseInt(process.env.EXTRACT_HTML_WORKER_MS || "22000", 10) || 22000, 10000), 45000);
  const r = spawnSync(process.execPath, [hw, pageUrl, tmp], {
    encoding: "utf8",
    maxBuffer: 2_000_000,
    timeout: workerMs,
    windowsHide: true,
    env: { ...process.env, EXTRACT_WORKER_HTML_MAX: String(Math.min(html.length, 220000)) },
  });
  try {
    fs.unlinkSync(tmp);
  } catch {}
  if (!r.stdout) return null;
  try {
    const j = JSON.parse(r.stdout.trim());
    if (j.ok && j.text && j.text.length >= 80) {
      return { title: (j.title || "Untitled").trim(), text: j.text.slice(0, 50000), url: pageUrl };
    }
  } catch {}
  return null;
}

function runMercuryWorker(pageUrl) {
  const mw = path.join(SCRAPER_DIR, "mercury-worker.cjs");
  if (!fs.existsSync(mw)) return null;
  const ms = Math.min(Math.max(parseInt(process.env.EXTRACT_MERCURY_TIMEOUT_MS || "24000", 10) || 24000, 8000), 120000);
  const r = spawnSync(process.execPath, [mw, pageUrl, CHROME_UA], {
    encoding: "utf8",
    maxBuffer: 2_000_000,
    timeout: ms,
    windowsHide: true,
    env: { ...process.env },
  });
  if (!r.stdout) return null;
  try {
    const j = JSON.parse(r.stdout.trim());
    if (j.ok && j.text && j.text.length >= 80) {
      return { title: j.title || "Untitled", text: j.text.slice(0, 50000), url: pageUrl };
    }
  } catch {}
  return null;
}

async function main() {
  const rawUrl = process.argv[2];
  const url = normalizeUrl(rawUrl || "");
  if (!url.startsWith("http")) {
    process.stdout.write(JSON.stringify({ ok: false }));
    return;
  }
  const jinaOff = process.env.EXTRACT_DISABLE_JINA === "true";
  let jina = null;
  let html = null;
  if (!jinaOff) {
    [jina, html] = await Promise.all([extractWithJina(url), fetchPageHtml(url)]);
  } else {
    html = await fetchPageHtml(url);
  }
  if (jina) {
    process.stdout.write(JSON.stringify({ ok: true, ...jina }));
    return;
  }
  if (html && html.length > 450000) html = html.slice(0, 450000);
  if (html) {
    const w = runHtmlWorker(url, html);
    if (w) {
      process.stdout.write(JSON.stringify({ ok: true, ...w }));
      return;
    }
  }
  const m = runMercuryWorker(url);
  if (m) {
    process.stdout.write(JSON.stringify({ ok: true, ...m }));
    return;
  }
  if (html) {
    const meta = extractFromMetaRegex(url, html);
    if (meta) {
      process.stdout.write(JSON.stringify({ ok: true, ...meta }));
      return;
    }
  }
  process.stdout.write(JSON.stringify({ ok: false }));
}

main().catch(() => process.stdout.write(JSON.stringify({ ok: false })));
