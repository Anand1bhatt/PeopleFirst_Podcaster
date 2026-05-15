"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { SourceInput, type SourceEntry } from "./source-input";
import { TopicNewsPanel } from "./topic-news-panel";
import { AudioPlayer } from "./audio-player";
import { useBriefingStore } from "@/store/briefing";
import type { TtsProvider } from "@/types";
import { FIGMA_DEMO_ARTICLE, FIGMA_DEMO_HEADLINE } from "@/lib/figma-demo-article";
import { BriefingProgressPanel } from "@/components/briefing-progress";

type Props = {
  initialBriefingId?: string | null;
  /** Figma widget: featured Reliance/Jio story, auto-generate + autoplay audio */
  figmaEmbedDemo?: boolean;
};

export function BriefingForm({ initialBriefingId, figmaEmbedDemo }: Props) {
  const [sources, setSources] = useState<SourceEntry[]>(figmaEmbedDemo ? [] : []);
  const [figmaSourcesReady, setFigmaSourcesReady] = useState(!figmaEmbedDemo);
  const [figmaFeedHeadline, setFigmaFeedHeadline] = useState(FIGMA_DEMO_HEADLINE);
  const [ttsProvider, setTtsProvider] = useState<TtsProvider>(
    figmaEmbedDemo ? "microsoft" : "elevenlabs"
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { current, setCurrentId, setCurrent } = useBriefingStore();
  const figmaWidgetPosted = useRef<string | null>(null);
  const figmaFailPosted = useRef(false);
  const figmaBriefingPostedRef = useRef(false);
  const poll = useCallback(async (id: string) => {
    const res = await fetch(`/api/briefings/${id}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setCurrent(data);
    if (data.status === "completed" || data.status === "failed") return;
    const quick =
      data.status === "extracting" ||
      data.status === "pending" ||
      data.status === "generating_audio";
    setTimeout(() => poll(id), quick ? 1100 : 1800);
  }, [setCurrent]);

  useEffect(() => {
    if (initialBriefingId) {
      setCurrentId(initialBriefingId);
      poll(initialBriefingId);
    }
  }, [initialBriefingId, setCurrentId, poll]);

  useEffect(() => {
    if (!figmaEmbedDemo || initialBriefingId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/figma-daily-digest?briefing_sources=1&t=${Date.now()}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (cancelled) return;
        const raw = data.sources as
          | { type: "url"; value: string; sectionTitle?: string }[]
          | undefined;
        if (Array.isArray(raw) && raw.length > 0) {
          setSources(
            raw.map((s) => ({
              type: "url" as const,
              value: s.value,
              briefing_section: s.sectionTitle,
            }))
          );
          setFigmaFeedHeadline("Today’s news briefing");
        } else {
          setSources([{ type: "text", value: FIGMA_DEMO_ARTICLE }]);
          setFigmaFeedHeadline(FIGMA_DEMO_HEADLINE);
        }
      } catch {
        if (!cancelled) {
          setSources([{ type: "text", value: FIGMA_DEMO_ARTICLE }]);
          setFigmaFeedHeadline(FIGMA_DEMO_HEADLINE);
        }
      } finally {
        if (!cancelled) setFigmaSourcesReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [figmaEmbedDemo, initialBriefingId]);

  useEffect(() => {
    if (!figmaEmbedDemo || initialBriefingId || !figmaSourcesReady) return;
    if (sources.length === 0) return;
    if (figmaBriefingPostedRef.current) return;
    figmaBriefingPostedRef.current = true;
    (async () => {
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch("/api/briefings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sources: sources.map((s) => ({
              type: s.type,
              value: s.value,
              briefing_section: s.briefing_section,
            })),
            ttsProvider: "microsoft",
            outputLanguage: "en",
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed to start");
          figmaBriefingPostedRef.current = false;
          return;
        }
        setCurrentId(data.briefingId);
        poll(data.briefingId);
      } catch {
        setError("Network error");
        figmaBriefingPostedRef.current = false;
      } finally {
        setSubmitting(false);
      }
    })();
  }, [
    figmaEmbedDemo,
    initialBriefingId,
    figmaSourcesReady,
    sources,
    poll,
    setCurrentId,
  ]);

  useEffect(() => {
    if (!figmaEmbedDemo || typeof window === "undefined") return;
    if (current?.status === "failed") {
      if (!figmaFailPosted.current) {
        figmaFailPosted.current = true;
        window.parent.postMessage({ type: "AI_BRIEFING_WIDGET", status: "error" }, "*");
      }
      return;
    }
    if (current?.status !== "completed" || !current.audio_url || !current.id) return;
    if (figmaWidgetPosted.current === current.id) return;
    figmaWidgetPosted.current = current.id;

    const base = window.location.origin;
    const audioUrl = current.audio_url.startsWith("http")
      ? current.audio_url
      : `${base}${current.audio_url}`;
    const sourceCount = current.sources?.length ?? 1;
    const points = current.summary?.summary_points ?? [];
    const glimpse =
      points.length > 0
        ? `${points.slice(0, 2).join(" ")}${points.length > 2 ? "…" : ""}`
        : `${current.summary?.headline ?? ""}. ${FIGMA_DEMO_ARTICLE.slice(0, 120)}…`.trim();

    const a = new Audio(audioUrl);
    const send = (durationSec: number | null) => {
      window.parent.postMessage(
        {
          type: "AI_BRIEFING_WIDGET",
          headline: current.summary?.headline ?? FIGMA_DEMO_HEADLINE,
          glimpse,
          sourceCount,
          durationSec,
          audioUrl,
          fullAppUrl: `${base}/briefing`,
        },
        "*"
      );
    };
    a.addEventListener(
      "loadedmetadata",
      () => {
        const d = a.duration;
        send(Number.isFinite(d) && d > 0 ? d : null);
      },
      { once: true }
    );
    a.addEventListener("error", () => send(null), { once: true });
    a.load();
  }, [figmaEmbedDemo, current]);

  const submit = async () => {
    if (sources.length === 0) {
      setError("Add at least one source.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/briefings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sources: sources.map((s) => ({
            type: s.type,
            value: s.value,
            briefing_section: s.briefing_section,
          })),
          ttsProvider,
          outputLanguage: "en",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to start briefing");
        return;
      }
      setCurrentId(data.briefingId);
      poll(data.briefingId);
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const isPending =
    current &&
    ["pending", "extracting", "summarizing", "generating_audio"].includes(current.status);

  if (figmaEmbedDemo) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
          <p className="text-xs font-semibold text-primary">{figmaFeedHeadline}</p>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {!figmaSourcesReady
              ? "Loading today’s stories…"
              : sources.some((s) => s.type === "url")
                ? "World → Reliance → Jio → Tech → Business → Sports"
                : "Featured story — auto briefing"}
          </p>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        {(!figmaSourcesReady || (!current && submitting)) && (
          <p className="text-xs text-muted-foreground">
            {!figmaSourcesReady ? "Fetching headlines…" : "Preparing your briefing…"}
          </p>
        )}
        {current && isPending && (
          <BriefingProgressPanel
            compact
            status={current.status}
            pipeline_progress={current.pipeline_progress ?? null}
            sources={current.sources ?? []}
          />
        )}
        {current?.status === "failed" && (
          <p className="text-xs text-destructive">{current.error ?? "Failed"}</p>
        )}
        {current?.status === "completed" && current.audio_url && (
          <div className="rounded-xl border border-dashed border-primary/25 bg-muted/30 px-3 py-2">
            <p className="text-[10px] text-muted-foreground">
              Use play above (Figma widget) or expand for backup player.
            </p>
            <details className="mt-1">
              <summary className="cursor-pointer text-[10px] font-medium text-primary">
                Player in frame
              </summary>
              <div className="pt-2">
                <AudioPlayer src={current.audio_url} className="gap-2" compact />
              </div>
            </details>
          </div>
        )}
      </div>
    );
  }

  const appendSources = useCallback((entries: SourceEntry[]) => {
    setSources((prev) => {
      const seen = new Set(
        prev.filter((s) => s.type === "url").map((s) => s.value.trim())
      );
      const next = [...prev];
      for (const e of entries) {
        const v = e.value.trim();
        if (!v) continue;
        if (e.type === "url") {
          if (seen.has(v)) continue;
          seen.add(v);
        }
        next.push({ type: e.type, value: v });
      }
      return next;
    });
  }, []);

  return (
    <div className="space-y-6">
      <TopicNewsPanel
        sources={sources}
        onAppendSources={appendSources}
        disabled={submitting || !!isPending}
      />
      <SourceInput
        sources={sources}
        onChange={setSources}
        disabled={submitting || !!isPending}
      />
      <fieldset
        disabled={submitting || !!isPending}
        className="space-y-3 rounded-3xl border-2 border-primary/15 bg-card/80 p-4"
      >
        <legend className="px-1 text-sm font-semibold text-foreground">
          Voice (text-to-speech)
        </legend>
        <p className="text-xs text-muted-foreground">
          Primary engine for this briefing. If it fails, the app tries the other provider, then OpenAI.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-transparent bg-primary/5 p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/10">
            <input
              type="radio"
              name="tts"
              checked={ttsProvider === "elevenlabs"}
              onChange={() => setTtsProvider("elevenlabs")}
              className="mt-1"
            />
            <span>
              <span className="font-medium">ElevenLabs</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Needs <code className="rounded bg-muted px-1">ELEVENLABS_API_KEY</code>
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-transparent bg-primary/5 p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/10">
            <input
              type="radio"
              name="tts"
              checked={ttsProvider === "microsoft"}
              onChange={() => setTtsProvider("microsoft")}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Microsoft Azure Speech</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Needs <code className="rounded bg-muted px-1">AZURE_SPEECH_KEY</code> + region
              </span>
            </span>
          </label>
        </div>
      </fieldset>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      {!current && (
        <Button
          onClick={submit}
          disabled={submitting || sources.length === 0}
          size="lg"
          className="w-full shadow-md"
        >
          {submitting ? "Starting…" : "Generate briefing (up to ~3 min for multiple sources)"}
        </Button>
      )}
      {current && isPending && (
        <BriefingProgressPanel
          status={current.status}
          pipeline_progress={current.pipeline_progress ?? null}
          sources={current.sources ?? []}
        />
      )}
      {current?.status === "failed" && (
        <p className="text-sm text-destructive">
          {current.error ?? "Generation failed. Check your sources and try again."}
        </p>
      )}
      {current?.status === "completed" && current.audio_url && (
        <div className="space-y-4 rounded-3xl border-2 border-primary/15 bg-card p-5 shadow-sm sm:p-6">
          <p className="text-xs text-muted-foreground">
            Language: {current.output_language} · Voice:{" "}
            {current.tts_provider === "microsoft"
              ? "Microsoft Azure (primary)"
              : "ElevenLabs (primary)"}
          </p>
          {current.summary?.headline && (
            <h3 className="text-lg font-semibold leading-snug sm:text-base">{current.summary.headline}</h3>
          )}
          <AudioPlayer src={current.audio_url} />
        </div>
      )}
    </div>
  );
}
