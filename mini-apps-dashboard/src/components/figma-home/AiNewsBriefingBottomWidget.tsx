"use client";

import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useFigmaBriefing } from "./FigmaBriefingContext";

type Props = {
  briefingUrl: string;
};

function fmtClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Light Figma mini player — matches feed blues / white cards */
export function AiNewsBriefingBottomWidget({ briefingUrl }: Props) {
  const [expanded, setExpanded] = useState(false);
  const {
    state,
    feedMiniBar,
    feedAudio,
    playing,
    playbackRate,
    progress,
    togglePlay,
    seekBy,
    seekTo,
    setPlaybackRate,
  } = useFigmaBriefing();
  const feedSubSecondary = feedMiniBar?.sublineSecondary;
  const speeds = [0.75, 1, 1.25, 1.5] as const;

  const iframeReady = Boolean(state.audioUrl && state.status === "ready");
  /** Prefer feed conversation audio when it is the active session (vs iframe embed). */
  const useFeed = Boolean(
    feedAudio?.active &&
      (feedAudio.playing ||
        feedAudio.durationSec > 0 ||
        feedAudio.currentSec > 0)
  );

  const effectivePlaying = useFeed ? Boolean(feedAudio?.playing) : playing;
  const effectiveProgress = useMemo(() => {
    if (useFeed && feedAudio) {
      return {
        currentSec: feedAudio.currentSec,
        durationSec: feedAudio.durationSec,
      };
    }
    return progress;
  }, [useFeed, feedAudio, progress]);

  const effectiveToggle = useFeed
    ? feedAudio?.togglePlay ?? (() => {})
    : togglePlay;
  const effectiveSeekBy = useFeed
    ? feedAudio?.seekBy ?? (() => {})
    : seekBy;
  const effectiveSeekTo = useFeed
    ? feedAudio?.seekTo ?? (() => {})
    : seekTo;

  const ready = iframeReady || useFeed;
  const pct = useMemo(() => {
    const { currentSec, durationSec } = effectiveProgress;
    if (!durationSec || durationSec <= 0) return 0;
    return Math.min(100, (currentSec / durationSec) * 100);
  }, [effectiveProgress]);

  const timeLine = useMemo(() => {
    if (useFeed && feedAudio) {
      if (feedAudio.playing && feedAudio.durationSec > 0) {
        return `${fmtClock(feedAudio.currentSec)} / ${fmtClock(feedAudio.durationSec)}`;
      }
      if (feedAudio.playing) return "Playing…";
      if (feedAudio.durationSec > 0) return "Paused";
      return "Loading…";
    }
    if (state.status === "generating") return "Preparing…";
    if (state.status === "error") return "Unavailable";
    if (iframeReady && playing) {
      return `${fmtClock(progress.currentSec)} / ${fmtClock(progress.durationSec || state.durationSec || 0)}`;
    }
    if (iframeReady) return "Ready";
    return state.durationLabel || "Tap to listen";
  }, [
    useFeed,
    feedAudio,
    state.status,
    state.durationLabel,
    state.durationSec,
    iframeReady,
    playing,
    progress.currentSec,
    progress.durationSec,
  ]);

  const eyebrow = feedMiniBar?.eyebrow ?? "Briefing";
  const title = feedMiniBar?.title ?? state.headline;
  const subLine = feedMiniBar?.subline ?? timeLine;

  const onPrimaryListen = () => {
    if (ready) {
      void effectiveToggle();
      return;
    }
    setExpanded(true);
  };

  /** Keep one chrome when audio is available; only the pre-listen state uses the compact bar (avoids play/pause layout jump). */
  if (!ready) {
    return (
      <div className="border-b border-[#e8eef2] bg-white">
        <div className="flex min-h-[52px] items-center gap-2 px-2 py-2">
          <div
            className="h-10 w-1 shrink-0 rounded-full bg-[#0078ad] motion-safe:animate-pulse"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-bold uppercase tracking-wide text-[#0078ad]">
              {eyebrow}
            </p>
            <p className="truncate text-[13px] font-bold leading-tight text-[#141414]">
              {title}
            </p>
            <p className="truncate text-[10px] text-black/45">{subLine}</p>
            {feedSubSecondary ? (
              <p className="truncate text-[10px] tabular-nums text-black/38">
                {feedSubSecondary}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onPrimaryListen}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#0078ad] text-white shadow-sm transition hover:bg-[#006a99] active:scale-95"
            aria-label="Open player"
          >
            <Play className="size-4 translate-x-px fill-current" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-[#013e7c] hover:bg-[#f5fafd]"
            aria-expanded={expanded}
            aria-label={expanded ? "Hide embed" : "Show embed"}
          >
            {expanded ? (
              <ChevronUp className="size-4" strokeWidth={2.5} />
            ) : (
              <ChevronDown className="size-4" strokeWidth={2.5} />
            )}
          </button>
        </div>

        <div
          className={cn(
            "overflow-hidden border-t border-[#e8eef2] transition-[max-height] duration-200",
            expanded ? "max-h-[200px]" : "max-h-0 border-t-0"
          )}
        >
          <iframe
            title="AI News Podcast"
            src={`${briefingUrl}${briefingUrl.includes("?") ? "&" : "?"}figma_demo=1`}
            className="h-[180px] w-full bg-[#f5fafd]"
            allow="clipboard-read; clipboard-write; autoplay"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-[#e8eef2] bg-white text-[#141414]">
      <div
        role="slider"
        aria-valuenow={Math.round(effectiveProgress.currentSec)}
        aria-valuemin={0}
        aria-valuemax={Math.round(effectiveProgress.durationSec) || 100}
        className="h-1 w-full shrink-0 cursor-pointer bg-[#e8eef2]"
        onClick={(e) => {
          if (!effectiveProgress.durationSec) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          effectiveSeekTo((x / rect.width) * effectiveProgress.durationSec);
        }}
      >
        <div
          className="h-full bg-[#0078ad] transition-[width] duration-150 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex min-h-[52px] items-center gap-1 px-1.5 py-1.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#eef6fb]">
          {effectivePlaying ? (
            <Pause className="size-3.5 text-[#0078ad]" fill="currentColor" aria-hidden />
          ) : (
            <Play className="size-3.5 text-[#0078ad]" fill="currentColor" aria-hidden />
          )}
        </div>

        <div className="flex min-h-[52px] min-w-0 flex-1 flex-col justify-center leading-tight">
          <p className="truncate text-[10px] font-bold uppercase tracking-wide text-[#0078ad]">
            {eyebrow}
          </p>
          <p className="truncate text-[12px] font-bold text-[#141414]">{title}</p>
          {feedMiniBar?.subline ? (
            <p className="truncate text-[10px] text-black/45">{feedMiniBar.subline}</p>
          ) : null}
          {feedSubSecondary ? (
            <p className="truncate text-[10px] tabular-nums text-black/40">
              {feedSubSecondary}
            </p>
          ) : null}
          <p className="truncate text-[10px] tabular-nums text-black/45">{timeLine}</p>
        </div>

        <button
          type="button"
          disabled={!ready}
          onClick={() => effectiveSeekBy(-10)}
          className="rounded-full p-1.5 text-[#013e7c] hover:bg-[#f5fafd] disabled:opacity-30"
          aria-label="Back 10 seconds"
        >
          <SkipBack className="size-4" strokeWidth={2.2} />
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={effectiveToggle}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#0078ad] text-white shadow-sm hover:bg-[#006a99] disabled:opacity-30"
          aria-label={effectivePlaying ? "Pause" : "Play"}
        >
          {effectivePlaying ? (
            <Pause className="size-4 shrink-0" fill="currentColor" />
          ) : (
            <Play className="size-4 shrink-0 translate-x-px fill-current" />
          )}
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={() => effectiveSeekBy(10)}
          className="rounded-full p-1.5 text-[#013e7c] hover:bg-[#f5fafd] disabled:opacity-30"
          aria-label="Forward 10 seconds"
        >
          <SkipForward className="size-4" strokeWidth={2.2} />
        </button>
        <a
          href={state.fullAppNote ?? briefingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full p-1.5 text-[#013e7c] hover:bg-[#f5fafd]"
          aria-label="Open full app"
        >
          <ExternalLink className="size-3.5" />
        </a>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="rounded-full p-1.5 text-[#013e7c] hover:bg-[#f5fafd]"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse" : "More"}
        >
          {expanded ? (
            <ChevronUp className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
        </button>
      </div>

      <div
        className={cn(
          "border-[#e8eef2]",
          expanded && "space-y-1.5 border-t px-1.5 pb-1.5 pt-1"
        )}
      >
        {expanded && !useFeed && (
          <div className="flex flex-wrap justify-center gap-0.5">
            {speeds.map((r) => (
              <button
                key={r}
                type="button"
                disabled={!iframeReady}
                onClick={() => setPlaybackRate(r)}
                className={cn(
                  "rounded-full px-2 py-px text-[9px] font-bold disabled:opacity-40",
                  playbackRate === r
                    ? "bg-[#0078ad] text-white"
                    : "bg-[#eef6fb] text-[#013e7c]"
                )}
              >
                {r}×
              </button>
            ))}
          </div>
        )}
        <div className="relative min-h-0 overflow-visible">
          <iframe
            title="AI News Podcast"
            src={`${briefingUrl}${briefingUrl.includes("?") ? "&" : "?"}figma_demo=1`}
            className={cn(
              "w-full bg-[#f5fafd] transition-opacity duration-200",
              expanded
                ? "relative z-10 h-[160px] rounded-md border border-[#e5f1f7] opacity-100"
                : "pointer-events-none absolute bottom-full left-0 right-0 z-0 mb-0 h-[200px] max-h-[200px] opacity-0"
            )}
            allow="clipboard-read; clipboard-write; autoplay"
          />
        </div>
      </div>
    </div>
  );
}
