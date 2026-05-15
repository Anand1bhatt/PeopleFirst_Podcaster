"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadAllFigmaBriefingAudioUrls,
  readFigmaBriefingAudioCache,
  writeFigmaBriefingAudioCache,
} from "@/components/figma-home/figma-briefing-audio-cache";
import {
  feedPlaybackKey,
  type FigmaWidgetLang,
} from "@/components/figma-home/figma-widget-lang";

const POLL_MS = 1800;
const POLL_MAX = 100;
const FETCH_TIMEOUT_MS = 45_000;
const GATEWAY_RETRY_MS = 1000;
const GATEWAY_RETRY_STATUSES = new Set([502, 503, 504]);

function fetchWithTimeout(
  input: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? FETCH_TIMEOUT_MS;
  const { timeoutMs: _, ...rest } = init ?? {};
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(input, { ...rest, signal: ctrl.signal }).finally(() =>
    clearTimeout(t)
  );
}

async function fetchBriefingStatusWithGatewayRetry(
  briefingId: string
): Promise<{ r: Response; text: string }> {
  const url = `/api/briefing-status/${encodeURIComponent(briefingId)}`;
  let r = await fetchWithTimeout(url, { cache: "no-store" });
  let text = await r.text();
  if (GATEWAY_RETRY_STATUSES.has(r.status)) {
    await new Promise((res) => setTimeout(res, GATEWAY_RETRY_MS));
    r = await fetchWithTimeout(url, { cache: "no-store" });
    text = await r.text();
  }
  return { r, text };
}

export function useFigmaDayBriefingPlayer() {
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [briefingErr, setBriefingErr] = useState<Record<string, string>>({});
  /** Composite key `date::lang` for the track currently loaded / active. */
  const [activeAudioKey, setActiveAudioKey] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const briefingInFlightRef = useRef<string | null>(null);
  /** Last successful audio URL per feedPlaybackKey — replay with one tap. */
  const audioUrlByKeyRef = useRef<Record<string, string>>({});
  /** Feed key for the current `audio` src (for correlating loadedmetadata). */
  const currentAudioKeyRef = useRef<string | null>(null);
  const [audioDurationByKey, setAudioDurationByKey] = useState<
    Record<string, number>
  >({});

  useEffect(() => {
    const fromDisk = loadAllFigmaBriefingAudioUrls();
    Object.assign(audioUrlByKeyRef.current, fromDisk);
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setActiveAudioKey(null);
    };
    const onLoadedMetadata = () => {
      const key = currentAudioKeyRef.current;
      const d = el.duration;
      if (
        key &&
        typeof d === "number" &&
        Number.isFinite(d) &&
        d > 0 &&
        !Number.isNaN(d)
      ) {
        setAudioDurationByKey((prev) => ({
          ...prev,
          [key]: Math.round(d),
        }));
      }
    };
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    el.addEventListener("loadedmetadata", onLoadedMetadata);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, []);

  const pollUntilAudio = useCallback(
    async (briefingId: string, date: string, lang: FigmaWidgetLang) => {
      const key = feedPlaybackKey(date, lang);
      for (let i = 0; i < POLL_MAX; i++) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        let r: Response;
        let text: string;
        try {
          ({ r, text } = await fetchBriefingStatusWithGatewayRetry(briefingId));
        } catch (e) {
          const msg =
            e instanceof Error && e.name === "AbortError"
              ? "Request timed out — check the briefing app is running."
              : "Network error while checking status.";
          setBriefingErr((prev) => ({ ...prev, [key]: msg }));
          return;
        }
        let d: Record<string, unknown>;
        try {
          d = JSON.parse(text) as Record<string, unknown>;
        } catch {
          const trimmed = text.replace(/\s+/g, " ").trim().slice(0, 100);
          setBriefingErr((prev) => ({
            ...prev,
            [key]: `Briefing server returned non-JSON (HTTP ${r.status}). Often a temporary gateway error — wait and retry.${trimmed ? ` (${trimmed}…)` : ""}`,
          }));
          return;
        }
        if (!r.ok) {
          const errMsg =
            typeof d.error === "string"
              ? d.error
              : r.status === 404
                ? "Briefing not found — try again."
                : `Briefing status error (${r.status})`;
          setBriefingErr((prev) => ({ ...prev, [key]: errMsg }));
          return;
        }
        if (d.status === "failed") {
          setBriefingErr((prev) => ({
            ...prev,
            [key]:
              typeof d.error === "string" ? d.error : "Briefing failed",
          }));
          return;
        }
        if (d.status === "completed") {
          const url =
            typeof d.audio_url === "string" && d.audio_url.trim()
              ? d.audio_url.trim()
              : "";
          if (!url) {
            setBriefingErr((prev) => ({
              ...prev,
              [key]:
                "Briefing completed but no audio URL — check server logs and Supabase storage.",
            }));
            return;
          }
          const el = audioRef.current;
          if (el) {
            audioUrlByKeyRef.current[key] = url;
            writeFigmaBriefingAudioCache(date, lang, { audioUrl: url, briefingId });
            try {
              el.pause();
              currentAudioKeyRef.current = key;
              el.src = url;
              setActiveAudioKey(key);
              await el.play();
            } catch (playErr) {
              const name =
                playErr && typeof playErr === "object" && "name" in playErr
                  ? String((playErr as { name: string }).name)
                  : "";
              if (name === "NotAllowedError") {
                setBriefingErr((prev) => ({
                  ...prev,
                  [key]:
                    "Ready — tap play again to listen (browser blocked auto-play).",
                }));
              } else {
                setBriefingErr((prev) => ({
                  ...prev,
                  [key]: "Could not start playback — tap play to try again.",
                }));
              }
            }
          }
          return;
        }
      }
      setBriefingErr((prev) => ({
        ...prev,
        [key]:
          "Still generating after several minutes. If you use Redis, run the briefing worker or set BRIEFING_FIGMA_DAY_USE_QUEUE=0 (default). Open the full briefing app to retry.",
      }));
    },
    []
  );

  const startConversationBriefing = useCallback(
    async (date: string, lang: FigmaWidgetLang) => {
      const key = feedPlaybackKey(date, lang);
      if (briefingInFlightRef.current) {
        if (briefingInFlightRef.current !== key) return;
        return;
      }

      const el = audioRef.current;
      let cachedUrl = audioUrlByKeyRef.current[key];
      if (!cachedUrl) {
        const persisted = readFigmaBriefingAudioCache(date, lang);
        if (persisted?.audioUrl) {
          cachedUrl = persisted.audioUrl;
          audioUrlByKeyRef.current[key] = cachedUrl;
        }
      }

      if (activeAudioKey === key && playing) {
        el?.pause();
        return;
      }

      if (cachedUrl && el) {
        try {
          el.pause();
          currentAudioKeyRef.current = key;
          el.src = cachedUrl;
          setActiveAudioKey(key);
          await el.play();
          setBriefingErr((prev) => ({ ...prev, [key]: "" }));
          return;
        } catch {
          setBriefingErr((prev) => ({
            ...prev,
            [key]: "Tap play again to listen.",
          }));
          return;
        }
      }

      if (
        activeAudioKey === key &&
        el &&
        el.src &&
        Number.isFinite(el.duration) &&
        el.duration > 0 &&
        el.currentTime > 0.5 &&
        el.currentTime < el.duration - 0.3
      ) {
        try {
          await el.play();
        } catch {
          /* ignore */
        }
        return;
      }

      setBriefingErr((prev) => ({ ...prev, [key]: "" }));
      briefingInFlightRef.current = key;
      try {
        const res = await fetchWithTimeout("/api/figma-day-briefing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, lang }),
          timeoutMs: 120_000,
        });
        const j = (await res.json()) as {
          error?: string;
          briefingId?: string;
          cached?: boolean;
          inProgress?: boolean;
          audio_url?: string;
        };
        if (!res.ok) {
          setBriefingErr((prev) => ({
            ...prev,
            [key]: typeof j.error === "string" ? j.error : "Could not start",
          }));
          return;
        }
        const id = j.briefingId;
        if (!id) {
          setBriefingErr((prev) => ({ ...prev, [key]: "No briefing id" }));
          return;
        }

        const directUrl =
          j.cached &&
          typeof j.audio_url === "string" &&
          j.audio_url.trim().length > 0
            ? j.audio_url.trim()
            : "";

        if (directUrl && el) {
          try {
            el.pause();
            currentAudioKeyRef.current = key;
            el.src = directUrl;
            audioUrlByKeyRef.current[key] = directUrl;
            writeFigmaBriefingAudioCache(date, lang, {
              audioUrl: directUrl,
              briefingId: id,
            });
            setActiveAudioKey(key);
            setBriefingErr((prev) => ({ ...prev, [key]: "" }));
            await el.play();
          } catch (playErr) {
            const name =
              playErr && typeof playErr === "object" && "name" in playErr
                ? String((playErr as { name: string }).name)
                : "";
            if (name === "NotAllowedError") {
              setBriefingErr((prev) => ({
                ...prev,
                [key]:
                  "Ready — tap play again to listen (browser blocked auto-play).",
              }));
            } else {
              setBriefingErr((prev) => ({
                ...prev,
                [key]: "Could not start playback — tap play to try again.",
              }));
            }
          }
          return;
        }

        setGeneratingFor(key);
        await pollUntilAudio(id, date, lang);
      } catch (e) {
        const msg =
          e instanceof Error && e.name === "AbortError"
            ? "Starting briefing timed out — check NEWS_API_KEY and server logs."
            : "Network error";
        setBriefingErr((prev) => ({
          ...prev,
          [key]: msg,
        }));
      } finally {
        briefingInFlightRef.current = null;
        setGeneratingFor(null);
      }
    },
    [activeAudioKey, playing, pollUntilAudio]
  );

  return {
    audioRef,
    generatingFor,
    briefingErr,
    /** Composite key `date::lang` or null. */
    activeAudioKey,
    playing,
    startConversationBriefing,
    audioDurationByKey,
  };
}
