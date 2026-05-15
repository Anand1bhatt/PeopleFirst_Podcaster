"use strict";

const Mercury = require("@postlight/mercury-parser");

const url = process.argv[2] || "";
const ua =
  process.argv[3] ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

Mercury.parse(url, {
  contentType: "text",
  headers: { "User-Agent": ua },
})
  .then((result) => {
    if (!result?.content) {
      process.stdout.write(JSON.stringify({ ok: false }));
      process.exit(0);
      return;
    }
    const text = result.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text.length < 80) {
      process.stdout.write(JSON.stringify({ ok: false }));
      process.exit(0);
      return;
    }
    process.stdout.write(
      JSON.stringify({
        ok: true,
        title: result.title || "Untitled",
        text: text.slice(0, 50000),
        url,
      })
    );
    process.exit(0);
  })
  .catch(() => {
    process.stdout.write(JSON.stringify({ ok: false }));
    process.exit(0);
  });
