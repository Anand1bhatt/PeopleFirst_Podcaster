/** Default US API; set ELEVENLABS_API_BASE_URL if your workspace uses another region (e.g. EU residency). */
function elevenLabsV1Base(): string {
  const raw = (process.env.ELEVENLABS_API_BASE_URL ?? "https://api.elevenlabs.io")
    .trim()
    .replace(/\/$/, "");
  return `${raw}/v1`;
}

const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";

export type TtsResult = { buffer: Buffer | null; error?: string };

function normalizeApiKey(raw: string | undefined): string {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/^["']|["']$/g, "");
}

type ModelInfo = {
  model_id: string;
  can_do_text_to_speech?: boolean;
};

async function pickTtsModelIds(apiKey: string, base: string): Promise<string[]> {
  const preferred = [
    "eleven_multilingual_v2",
    "eleven_turbo_v2_5",
    "eleven_flash_v2_5",
    "eleven_turbo_v2",
    "eleven_monolingual_v1",
  ];
  const authHeaders: Record<string, string>[] = [
    { "xi-api-key": apiKey },
    { Authorization: `Bearer ${apiKey}` },
  ];
  for (const headers of authHeaders) {
    try {
      const res = await fetch(`${base}/models`, { headers });
      if (!res.ok) continue;
      const models = (await res.json()) as ModelInfo[];
      if (!Array.isArray(models)) return preferred;
      const tts = models.filter((m) => m.can_do_text_to_speech);
      const ids = new Set(tts.map((m) => m.model_id));
      const ordered: string[] = [];
      for (const p of preferred) {
        if (ids.has(p)) ordered.push(p);
      }
      for (const m of tts) {
        if (!ordered.includes(m.model_id)) ordered.push(m.model_id);
      }
      return ordered.length ? ordered : preferred;
    } catch {
      /* try next auth */
    }
  }
  return preferred;
}

async function resolveVoiceId(apiKey: string, base: string): Promise<string> {
  const envId = normalizeApiKey(process.env.ELEVENLABS_VOICE_ID);
  if (envId) return envId;

  const authHeaders: Record<string, string>[] = [
    { "xi-api-key": apiKey },
    { Authorization: `Bearer ${apiKey}` },
  ];
  for (const headers of authHeaders) {
    try {
      const res = await fetch(`${base}/voices`, { headers });
      if (!res.ok) continue;
      const j = (await res.json()) as {
        voices?: Array<{ voice_id: string; category?: string; name?: string }>;
      };
      const voices = j.voices ?? [];
      const premade =
        voices.find((v) => v.category === "premade") ??
        voices.find((v) => /rachel/i.test(v.name ?? "")) ??
        voices[0];
      if (premade?.voice_id) return premade.voice_id;
    } catch {
      /* ignore */
    }
  }
  return DEFAULT_VOICE;
}

const KEY_RESTRICTION_HINT =
  "Your API key may be **restricted**: open https://elevenlabs.io/app/settings/api-keys → select the key → under **Restrictions** / **Permissions**, either disable restrictions OR enable **Text to speech** (speech generation). Account-level TTS is not enough if the key blocks that scope.";

const REGION_HINT =
  "If your org uses **EU/IN data residency**, set ELEVENLABS_API_BASE_URL=https://api.eu.residency.elevenlabs.io (or the URL ElevenLabs gave you) in ai-news-briefing/.env.local.";

function parseErrorDetail(errText: string): string {
  try {
    const j = JSON.parse(errText) as { detail?: unknown };
    if (typeof j.detail === "string") return j.detail;
    if (
      j.detail &&
      typeof j.detail === "object" &&
      !Array.isArray(j.detail) &&
      "message" in j.detail
    ) {
      const d = j.detail as { status?: string; message?: string };
      if (d.status === "missing_permissions" || d.message?.includes("text_to_speech")) {
        return `${d.message ?? "Missing TTS permission on this API key."} ${KEY_RESTRICTION_HINT}`;
      }
      if (d.message) return d.message;
    }
    if (Array.isArray(j.detail)) {
      return j.detail
        .map((x: { msg?: string }) => x?.msg)
        .filter(Boolean)
        .join("; ");
    }
  } catch {
    /* ignore */
  }
  if (errText.includes("text_to_speech") || errText.includes("missing_permissions")) {
    return `${errText.slice(0, 200)} ${KEY_RESTRICTION_HINT}`;
  }
  return errText.slice(0, 400);
}

type PostTtsOk = { ok: true; res: Response };
type PostTtsFail = { ok: false; xiRes: Response; bearerBody?: string };

async function postTts(
  url: string,
  body: string,
  apiKey: string
): Promise<PostTtsOk | PostTtsFail> {
  const resXi = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg,audio/*,*/*",
    },
    body,
  });
  if (resXi.ok) return { ok: true, res: resXi };
  const resBearer = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "audio/mpeg,audio/*,*/*",
    },
    body,
  });
  if (resBearer.ok) return { ok: true, res: resBearer };
  let bearerBody: string | undefined;
  try {
    bearerBody = (await resBearer.text()).slice(0, 500);
  } catch {
    /* ignore */
  }
  return { ok: false, xiRes: resXi, bearerBody };
}

/** TTS with a specific voice ID (dialogue: Akshay vs Kriti). */
export async function textToSpeechWithVoiceId(
  text: string,
  voiceId: string
): Promise<TtsResult> {
  const apiKey = normalizeApiKey(process.env.ELEVENLABS_API_KEY);
  if (!apiKey) {
    return { buffer: null, error: "ELEVENLABS_API_KEY is missing." };
  }
  const id = voiceId.trim();
  if (!id) {
    return { buffer: null, error: "ElevenLabs voice ID is empty." };
  }

  const base = elevenLabsV1Base();
  const trimmed = text.slice(0, 2500).trim();
  if (!trimmed) {
    return { buffer: null, error: "No text to speak." };
  }

  const modelIds = await pickTtsModelIds(apiKey, base);
  const formats = ["", "mp3_22050_32", "mp3_44100_32"];

  let lastStatus = 0;
  let lastMsg = "";

  for (const modelId of modelIds) {
    for (const fmt of formats) {
      const url = new URL(`${base}/text-to-speech/${id}`);
      if (fmt) url.searchParams.set("output_format", fmt);

      try {
        const body = JSON.stringify({
          text: trimmed,
          model_id: modelId,
        });
        const out = await postTts(url.toString(), body, apiKey);

        if (out.ok) {
          const res = out.res;
          lastStatus = res.status;
          const arrayBuffer = await res.arrayBuffer();
          const ct = (res.headers.get("content-type") ?? "").toLowerCase();
          if (ct.includes("json") || arrayBuffer.byteLength < 64) {
            lastMsg = "API returned non-audio body.";
            continue;
          }
          return { buffer: Buffer.from(arrayBuffer) };
        }

        const xiRes = out.xiRes;
        lastStatus = xiRes.status;
        const errText = await xiRes.text();
        lastMsg = parseErrorDetail(errText);
        if (out.bearerBody && !out.bearerBody.includes(errText.slice(0, 80))) {
          lastMsg += ` [Bearer: ${parseErrorDetail(out.bearerBody).slice(0, 180)}]`;
        }
        console.error("[ElevenLabs TTS]", base, modelId, fmt || "default", lastStatus, lastMsg);
      } catch (e) {
        lastMsg = e instanceof Error ? e.message : String(e);
        console.error("[ElevenLabs TTS]", e);
      }
    }
  }

  const hints: string[] = [];
  if (lastStatus === 401) hints.push("Invalid or expired ELEVENLABS_API_KEY.");
  if (lastStatus === 403 && !lastMsg.includes("restriction")) hints.push(KEY_RESTRICTION_HINT);
  if (lastStatus === 429) hints.push("ElevenLabs character quota exceeded.");
  if ((lastStatus === 400 || lastStatus === 422) && !lastMsg.toLowerCase().includes("permission")) {
    hints.push(
      "Set ELEVENLABS_VOICE_ID to a voice from Voices (copy ID). Tried voice: " + id.slice(0, 12) + "…"
    );
  }
  if (lastStatus === 403 || lastStatus === 401) hints.push(REGION_HINT);

  return {
    buffer: null,
    error: [lastMsg || `HTTP ${lastStatus}`, ...hints].filter(Boolean).join(" "),
  };
}

export async function textToSpeech(text: string): Promise<TtsResult> {
  const apiKey = normalizeApiKey(process.env.ELEVENLABS_API_KEY);
  if (!apiKey) {
    return { buffer: null, error: "ELEVENLABS_API_KEY is missing." };
  }
  const base = elevenLabsV1Base();
  const trimmed = text.slice(0, 2500).trim();
  if (!trimmed) {
    return { buffer: null, error: "No text to speak." };
  }
  const voiceId = await resolveVoiceId(apiKey, base);
  return textToSpeechWithVoiceId(text, voiceId);
}
