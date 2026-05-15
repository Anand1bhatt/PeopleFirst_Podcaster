/**
 * Diagnose ElevenLabs API key: user, voices, and a minimal TTS call.
 * Run from ai-news-briefing: npx tsx scripts/elevenlabs-smoke.ts
 */
import { config } from "dotenv";
import path from "path";

config({ path: path.join(process.cwd(), ".env.local") });

function normKey(s: string | undefined) {
  if (!s) return "";
  return s.trim().replace(/^\uFEFF/, "").replace(/^["']|["']$/g, "");
}

async function main() {
  const key = normKey(process.env.ELEVENLABS_API_KEY);
  const base = (
    process.env.ELEVENLABS_API_BASE_URL ?? "https://api.elevenlabs.io"
  )
    .trim()
    .replace(/\/$/, "");
  const v1 = `${base}/v1`;

  if (!key) {
    console.error("No ELEVENLABS_API_KEY in .env.local (ai-news-briefing folder).");
    process.exit(1);
  }

  console.log("API base:", v1);
  console.log("Key length:", key.length, "(no key printed)\n");

  const h = { "xi-api-key": key };

  const user = await fetch(`${v1}/user`, { headers: h });
  const userText = await user.text();
  console.log("GET /v1/user →", user.status);
  console.log(userText.slice(0, 400) + (userText.length > 400 ? "…" : ""));
  console.log("");

  const voices = await fetch(`${v1}/voices`, { headers: h });
  const voicesText = await voices.text();
  console.log("GET /v1/voices →", voices.status);
  let voiceId = normKey(process.env.ELEVENLABS_VOICE_ID) || "21m00Tcm4TlvDq8ikWAM";
  if (voices.ok) {
    try {
      const j = JSON.parse(voicesText) as {
        voices?: Array<{ voice_id: string; name?: string }>;
      };
      const first = j.voices?.[0];
      if (first?.voice_id) {
        voiceId = first.voice_id;
        console.log("Using first voice:", first.name ?? "?", voiceId);
      }
    } catch {
      /* ignore */
    }
  } else {
    console.log(voicesText.slice(0, 300));
  }
  console.log("");

  const ttsUrl = `${v1}/text-to-speech/${voiceId}?output_format=mp3_22050_32`;
  const tts = await fetch(ttsUrl, {
    method: "POST",
    headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: "This is a one second test.",
      model_id: "eleven_multilingual_v2",
    }),
  });
  const buf = await tts.arrayBuffer();
  const ct = tts.headers.get("content-type") ?? "";
  console.log("POST /v1/text-to-speech →", tts.status, ct, "bytes:", buf.byteLength);
  if (!tts.ok) {
    console.log(new TextDecoder().decode(buf).slice(0, 800));
    console.log("\n---");
    console.log(
      "If you see missing_permissions / text_to_speech: edit the key at https://elevenlabs.io/app/settings/api-keys and enable Text to speech on the key (not only account settings)."
    );
    console.log(
      "If your workspace uses EU residency, try ELEVENLABS_API_BASE_URL=https://api.eu.residency.elevenlabs.io"
    );
    process.exit(1);
  }
  console.log("TTS OK — ElevenLabs is working with this key and base URL.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
