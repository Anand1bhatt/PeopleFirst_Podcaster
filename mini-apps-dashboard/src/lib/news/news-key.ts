import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Walk from cwd up to filesystem root; return first path `.../<subdir>/.env.local` that exists.
 * e.g. cwd = ai-news-briefing → finds sibling mini-apps-dashboard/.env.local in parent folder.
 */
function findMonorepoEnvLocalPath(subdir: string): string | undefined {
  let dir = process.cwd();
  for (let i = 0; i < 14; i++) {
    const p = join(dir, subdir, ".env.local");
    if (existsSync(p)) return p;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}

/**
 * Parse NEWS_API_KEY from a .env file. If the file has multiple assignments, the **last**
 * non-comment `NEWS_API_KEY=` wins (typical: comment old key, append new line below).
 */
function parseNewsApiKeyFromEnvFile(filePath: string): string | undefined {
  if (!existsSync(filePath)) return undefined;
  const text = stripBom(readFileSync(filePath, "utf8"));
  let last: string | undefined;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^NEWS_API_KEY\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[1].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    v = v.replace(/\s+#.*$/, "").trim();
    if (v) last = v;
  }
  return last;
}

let memo: string | undefined | null = null;

/** In production, cache the resolved key once. In development, resolve fresh each call. */
function shouldMemoizeKey(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Order matters for dev:all — most people only edit `mini-apps-dashboard/.env.local`, but the
 * briefing app’s cwd may be `ai-news-briefing`, which would otherwise read its own `.env.local`
 * first (often stale or missing).
 */
function envFileCandidatesOrdered(): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  const add = (p: string | undefined) => {
    if (!p || seen.has(p)) return;
    seen.add(p);
    paths.push(p);
  };
  add(findMonorepoEnvLocalPath("mini-apps-dashboard"));
  add(findMonorepoEnvLocalPath("ai-news-briefing"));
  add(join(process.cwd(), ".env.local"));
  return paths;
}

function keyFromEnvFiles(): string | undefined {
  for (const p of envFileCandidatesOrdered()) {
    const k = parseNewsApiKeyFromEnvFile(p);
    if (k) {
      if (process.env.NEWS_API_DEBUG === "1") {
        console.warn("[NEWS_API_KEY] loaded from", p, "(suffix …" + k.slice(-4) + ")");
      }
      return k;
    }
  }
  return undefined;
}

export function getNewsApiKey(): string | undefined {
  const memoize = shouldMemoizeKey();
  if (memoize && memo !== null) return memo || undefined;

  if (!memoize) {
    const fromFile = keyFromEnvFiles();
    if (fromFile) return fromFile;
    const direct = process.env.NEWS_API_KEY?.trim();
    if (direct) {
      if (process.env.NEWS_API_DEBUG === "1") {
        console.warn("[NEWS_API_KEY] from process.env (suffix …" + direct.slice(-4) + ")");
      }
      return direct;
    }
    return undefined;
  }

  const direct = process.env.NEWS_API_KEY?.trim();
  if (direct) {
    memo = direct;
    return direct;
  }
  const fromFile = keyFromEnvFiles();
  if (fromFile) {
    memo = fromFile;
    return fromFile;
  }
  memo = undefined;
  return undefined;
}
