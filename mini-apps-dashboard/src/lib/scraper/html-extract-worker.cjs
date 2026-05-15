/**
 * Runs in a separate Node process so JSDOM/Readability cannot block the main event loop.
 * Usage: node html-extract-worker.cjs <pageUrl> <path-to-html-file>
 * HTML is read from disk (avoids stdin pipe backpressure blocking the parent).
 */
"use strict";

const fs = require("fs");
const { JSDOM } = require("jsdom");
const { Readability } = require("@mozilla/readability");

const url = process.argv[2] || "";
const htmlPath = process.argv[3] || "";
const max = Math.min(
  Math.max(parseInt(process.env.EXTRACT_WORKER_HTML_MAX || "200000", 10) || 200000, 50000),
  350000
);

function send(obj) {
  process.stdout.write(JSON.stringify(obj));
  process.exit(0);
}

if (!htmlPath || !fs.existsSync(htmlPath)) {
  send({ ok: false, err: "missing_html_file" });
}

let html;
try {
  html = fs.readFileSync(htmlPath, "utf8");
} catch {
  send({ ok: false, err: "read_failed" });
}

try {
  const h = html.slice(0, max);

  const dom1 = new JSDOM(h, { url });
  const reader = new Readability(dom1.window.document);
  const article = reader.parse();
  let text = article?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  if (text.length >= 80) {
    return send({
      ok: true,
      title: (article?.title || "Untitled").trim() || "Untitled",
      text: text.slice(0, 50000),
      url,
    });
  }

  const dom2 = new JSDOM(h, { url });
  const doc = dom2.window.document;
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
  if (!root) return send({ ok: false });
  text = root.textContent?.replace(/\s+/g, " ").trim() ?? "";
  if (text.length < 120) return send({ ok: false });
  const h1 = doc.querySelector("h1")?.textContent?.trim();
  send({
    ok: true,
    title: h1 && h1.length < 200 ? h1 : "Article",
    text: text.slice(0, 50000),
    url,
  });
} catch {
  send({ ok: false });
}
