import { extractSources } from "@/lib/scraper/extract";
import { summarizeArticles, SummarizeTimeoutError } from "@/lib/ai/summarize";
import { textToSpeech } from "@/lib/tts/elevenlabs";
import { microsoftTextToSpeechWithVoice } from "@/lib/tts/microsoft-speech";
import { openAiTextToSpeech } from "@/lib/tts/openai-speech";
import { synthesizeDialogueAudio } from "@/lib/tts/dialogue-tts";
import { uploadAudio } from "@/lib/db/storage";
import {
  updateBriefingStatus,
  updateBriefingProgress,
  getBriefing,
} from "@/lib/db/briefings";
import type { TtsProvider, Source, PipelineProgress, OutputLanguage } from "@/types";
import { azureVoiceSingleFallback } from "@/lib/tts/language-voices";

function hostnameFromSource(src: Source): string | null {
  if (src.type !== "url") return null;
  try {
    const v = src.value.trim();
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return u.hostname.replace(/^www\./i, "") || null;
  } catch {
    return null;
  }
}

function progressForSourceExtract(
  index: number,
  total: number,
  src: Source
): PipelineProgress {
  const n = Math.max(total, 1);
  const pct = 8 + Math.round(((index + 0.15) / n) * 30);
  const host = hostnameFromSource(src);
  return {
    percent: Math.min(38, pct),
    step_key: "sources",
    message:
      src.type === "url"
        ? `Scanning ${host ?? "article link"} — fetching trusted content…`
        : "Reading your pasted text…",
    source_index: index,
    source_total: total,
    active_host: host,
    active_source_type: src.type,
  };
}

async function synthesizeAudio(
  script: string,
  preferred: TtsProvider,
  outputLanguage: OutputLanguage = "en"
): Promise<{ buffer: Buffer | null; log: string[] }> {
  const log: string[] = [];

  const tryEleven = async (): Promise<Buffer | null> => {
    if (!process.env.ELEVENLABS_API_KEY?.trim()) {
      log.push("ElevenLabs skipped (no ELEVENLABS_API_KEY).");
      return null;
    }
    const r = await textToSpeech(script);
    if (r.buffer) return r.buffer;
    if (r.error) log.push(`ElevenLabs: ${r.error.slice(0, 200)}`);
    return null;
  };

  const tryMicrosoft = async (): Promise<Buffer | null> => {
    const voice =
      outputLanguage === "en"
        ? (process.env.AZURE_SPEECH_VOICE ?? "en-US-JennyNeural").trim()
        : azureVoiceSingleFallback(outputLanguage);
    let r = await microsoftTextToSpeechWithVoice(script, voice);
    if (r.buffer) return r.buffer;
    if (outputLanguage === "pa") {
      r = await microsoftTextToSpeechWithVoice(script, azureVoiceSingleFallback("hi"));
      if (r.buffer) {
        log.push("Microsoft: Punjabi voice unavailable; Hindi neural read Gurmukhi text.");
        return r.buffer;
      }
    }
    if (r.error) log.push(`Microsoft: ${r.error.slice(0, 200)}`);
    return null;
  };

  const tryOpenAi = async (): Promise<Buffer | null> => {
    const b = await openAiTextToSpeech(script);
    if (!b) log.push("OpenAI TTS failed or OPENAI_API_KEY missing.");
    return b;
  };

  let buffer: Buffer | null = null;
  if (preferred === "elevenlabs") {
    buffer = await tryEleven();
    if (!buffer) buffer = await tryMicrosoft();
    if (!buffer) buffer = await tryOpenAi();
  } else {
    buffer = await tryMicrosoft();
    if (!buffer) buffer = await tryEleven();
    if (!buffer) buffer = await tryOpenAi();
  }

  return { buffer, log };
}

export async function runPipeline(briefingId: string): Promise<void> {
  const briefing = await getBriefing(briefingId);
  if (!briefing || briefing.sources.length === 0) {
    await updateBriefingStatus(briefingId, "failed", { error_message: "Briefing or sources not found" });
    return;
  }

  try {
    const srcs = briefing.sources;
    await updateBriefingStatus(briefingId, "extracting");
    void updateBriefingProgress(briefingId, {
      percent: 5,
      step_key: "queue",
      message: "Starting secure scan of your sources…",
    }).catch(() => {});

    const articles = await extractSources(srcs, {
      onSourceStart: async ({ index, total, source }) => {
        await updateBriefingProgress(briefingId, progressForSourceExtract(index, total, source));
      },
      onSourceTick: ({ index, total, source, elapsedSec }) => {
        const host = hostnameFromSource(source);
        const base = progressForSourceExtract(index, total, source);
        void updateBriefingProgress(briefingId, {
          ...base,
          message: `Still fetching ${host ?? "page"}… (${elapsedSec}s) — trying alternate readers if slow`,
          percent: Math.min(38, base.percent + Math.min(5, Math.floor(elapsedSec / 12))),
        }).catch(() => {});
      },
    });

    await updateBriefingProgress(briefingId, {
      percent: 40,
      step_key: "sources",
      message:
        articles.length > 0
          ? `Gathered ${articles.length} article${articles.length === 1 ? "" : "s"}`
          : "Finished scanning sources",
      source_index: srcs.length,
      source_total: srcs.length,
      active_host: null,
      active_source_type: undefined,
    });

    if (articles.length === 0) {
      await updateBriefingStatus(briefingId, "failed", {
        error_message:
          "No content could be extracted from the URL (site may block bots or need JavaScript). Use Raw text: copy the article from your browser and paste as a source.",
      });
      return;
    }

    await updateBriefingProgress(briefingId, {
      percent: 44,
      step_key: "summarize",
      message: "Writing conversational briefing (Akshay & Kriti)…",
    });
    await updateBriefingStatus(briefingId, "summarizing");
    let summary: Awaited<ReturnType<typeof summarizeArticles>>;
    try {
      summary = await summarizeArticles(articles, briefing.output_language);
    } catch (err) {
      const msg =
        err instanceof SummarizeTimeoutError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Summarization failed.";
      await updateBriefingStatus(briefingId, "failed", { error_message: msg });
      return;
    }
    if (!summary) {
      const msg = process.env.OPENAI_API_KEY
        ? "Summarization failed (invalid JSON or empty response). Check server logs."
        : "Add OPENAI_API_KEY to .env.local to generate summaries.";
      await updateBriefingStatus(briefingId, "failed", { error_message: msg });
      return;
    }

    await updateBriefingProgress(briefingId, {
      percent: 72,
      step_key: "audio",
      message: "Generating natural voice audio…",
    });
    await updateBriefingStatus(briefingId, "generating_audio", {
      summary_headline: summary.headline,
      summary_points: summary.summary_points,
      audio_script: summary.audio_script,
      dialogue_turns: summary.dialogue_turns ?? null,
    });

    const preferred: TtsProvider = briefing.tts_provider ?? "elevenlabs";
    let audioBuffer: Buffer | null = null;
    const ttsLog: string[] = [];

    await updateBriefingProgress(briefingId, {
      percent: 82,
      step_key: "audio",
      message: summary.dialogue_turns?.length
        ? "Synthesizing dual-voice dialogue…"
        : "Synthesizing narration…",
    });

    if (summary.dialogue_turns?.length) {
      const d = await synthesizeDialogueAudio(
        summary.dialogue_turns,
        preferred,
        briefing.output_language
      );
      ttsLog.push(...d.log);
      if (d.buffer) {
        audioBuffer = d.buffer;
      } else {
        ttsLog.push("Dialogue TTS failed; falling back to single-voice script.");
      }
    }

    if (!audioBuffer) {
      const single = await synthesizeAudio(
        summary.audio_script,
        preferred,
        briefing.output_language
      );
      audioBuffer = single.buffer;
      ttsLog.push(...single.log);
    }
    if (!audioBuffer) {
      const detail = ttsLog.join(" ");
      const msg =
        detail.length > 80
          ? `All TTS providers failed. ${detail.slice(0, 400)}${detail.length > 400 ? "…" : ""}`
          : "Audio generation failed. Configure ElevenLabs and/or Azure Speech (AZURE_SPEECH_KEY + AZURE_SPEECH_REGION), or ensure OPENAI_API_KEY works for TTS fallback.";
      await updateBriefingStatus(briefingId, "failed", { error_message: msg });
      return;
    }

    await updateBriefingProgress(briefingId, {
      percent: 94,
      step_key: "audio",
      message: "Uploading audio — almost ready…",
    });
    let audioUrl: string | null;
    try {
      audioUrl = await uploadAudio(briefingId, audioBuffer);
    } catch (uploadErr) {
      const u =
        uploadErr instanceof Error ? uploadErr.message : "Audio upload failed (check Supabase storage).";
      await updateBriefingStatus(briefingId, "failed", { error_message: u.slice(0, 500) });
      return;
    }
    await updateBriefingStatus(briefingId, "completed", { audio_url: audioUrl ?? undefined });
  } catch (err) {
    const message =
      err instanceof Error
        ? `${err.message}${err.stack ? ` | ${err.stack.split("\n").slice(0, 2).join(" ")}` : ""}`
        : "Pipeline failed";
    await updateBriefingStatus(briefingId, "failed", {
      error_message: message.slice(0, 500),
    });
  }
}
