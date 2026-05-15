"use client";

import { Loader2, Pause, Play, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  formatBriefingDurationLabel,
  type DayBlock,
} from "@/components/figma-home/figma-news-day-card";
import { useFigmaBriefing } from "@/components/figma-home/FigmaBriefingContext";

const SPOTLIGHT_TITLE = "Daily AI Podcast";

type Props = {
  day: DayBlock;
  generatingFor: string | null;
  playbackKey: string;
  activeAudioKey: string | null;
  playing: boolean;
  briefingErr: Record<string, string>;
  audioDurationByKey?: Record<string, number>;
  onPlay: () => void;
};

/** Hero-style briefing card: play + title + subtitle on a bold AI-themed treatment. */
export function AiNewsBriefingSpotlightWidget({
  day,
  generatingFor,
  playbackKey,
  activeAudioKey,
  playing,
  briefingErr,
  audioDurationByKey,
  onPlay,
}: Props) {
  const { feedMiniBar } = useFigmaBriefing();
  const gen = generatingFor === playbackKey;
  const isActivePlaying = activeAudioKey === playbackKey && playing;
  const bErr = briefingErr[playbackKey];
  const durationSec = audioDurationByKey?.[playbackKey];

  const durationLabel = useMemo(() => {
    if (feedMiniBar?.sublineSecondary) return feedMiniBar.sublineSecondary;
    return formatBriefingDurationLabel(durationSec);
  }, [feedMiniBar?.sublineSecondary, durationSec]);

  return (
    <div
      className={cn(
        "relative mb-0 overflow-hidden rounded-2xl shadow-[0_8px_32px_rgba(79,70,229,0.22)]",
        "ring-1 ring-white/25"
      )}
    >
      {/* Aurora / mesh background */}
      <div
        className="absolute inset-0 bg-gradient-to-br from-[#1e1b4b] via-[#4c1d95] to-[#0e7490]"
        aria-hidden
      />
      <div
        className="absolute -left-1/4 -top-1/2 h-[140%] w-[70%] rounded-full bg-gradient-to-br from-fuchsia-500/40 via-violet-500/25 to-transparent blur-3xl motion-safe:animate-pulse"
        style={{ animationDuration: "4s" }}
        aria-hidden
      />
      <div
        className="absolute -bottom-1/3 -right-1/4 h-[90%] w-[80%] rounded-full bg-gradient-to-tl from-cyan-400/35 via-sky-500/20 to-transparent blur-3xl motion-safe:animate-pulse"
        style={{ animationDuration: "5.5s" }}
        aria-hidden
      />
      {/* Soft grid */}
      <div
        className="absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.35) 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
        }}
        aria-hidden
      />

      <div className="relative flex items-center gap-3 px-3.5 py-3.5">
        <div className="pointer-events-none absolute right-3 top-2.5 text-white/25">
          <Sparkles className="size-5" strokeWidth={1.5} aria-hidden />
        </div>

        <button
          type="button"
          disabled={!!generatingFor && !gen}
          onClick={onPlay}
          className={cn(
            "relative grid size-[52px] shrink-0 place-items-center rounded-full",
            "bg-white text-[#4c1d95] shadow-[0_4px_24px_rgba(255,255,255,0.45),0_0_0_1px_rgba(255,255,255,0.5)]",
            "transition hover:scale-[1.03] hover:shadow-[0_6px_28px_rgba(255,255,255,0.55)] active:scale-[0.97]",
            "disabled:opacity-55 disabled:hover:scale-100"
          )}
          aria-label={
            gen
              ? "Generating conversation briefing"
              : isActivePlaying
                ? "Pause"
                : "Play conversation briefing"
          }
        >
          <span className="absolute inset-0 rounded-full bg-gradient-to-br from-white to-cyan-100/80 opacity-90" />
          <span className="relative flex size-6 items-center justify-center [&_svg]:size-6">
            {gen ? (
              <Loader2 className="animate-spin text-[#6366f1]" aria-hidden />
            ) : isActivePlaying ? (
              <Pause className="text-[#4c1d95]" fill="currentColor" aria-hidden />
            ) : (
              <Play
                className="translate-x-px text-[#4c1d95]"
                fill="currentColor"
                aria-hidden
              />
            )}
          </span>
        </button>

        <div className="min-w-0 flex-1 pr-6">
          <p className="truncate text-sm font-black leading-snug tracking-[-0.02em] text-white drop-shadow-sm sm:text-[0.9375rem]">
            {SPOTLIGHT_TITLE}
          </p>
          <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-white/85">
            {day.dayLabel}
          </p>
          <p className="mt-0.5 text-[11px] font-medium tabular-nums leading-snug text-cyan-100/90">
            {durationLabel}
          </p>
          {bErr ? (
            <p className="mt-1.5 text-[10px] font-medium text-amber-200">{bErr}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
