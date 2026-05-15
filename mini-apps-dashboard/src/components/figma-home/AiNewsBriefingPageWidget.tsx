"use client";

import Link from "next/link";
import { History, Play, Pause, Sparkles } from "lucide-react";
import { useFigmaBriefing } from "./FigmaBriefingContext";

/** Inline card — headline + glimpse + play; seek/speed live in sticky player when playing */
export function AiNewsBriefingPageWidget() {
  const { state, playing, togglePlay } = useFigmaBriefing();

  return (
    <section
      className="rounded-2xl border-2 border-[#0078ad]/20 bg-gradient-to-br from-white via-[#f5fafd] to-[#e8f4fc] p-4 shadow-[0_8px_30px_rgba(1,62,124,0.08)]"
      aria-label="AI News Podcast widget"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-[#0078ad]/15 text-[#013e7c]">
            <Sparkles className="size-4" aria-hidden />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#013e7c]">
            AI News Podcast
          </span>
        </div>
        <Link
          href="/dashboard/ai-news-briefing/history"
          className="flex size-9 items-center justify-center rounded-full bg-white text-[#013e7c] ring-1 ring-[#e5f1f7] transition-colors hover:bg-[#eef6fb]"
          aria-label="Past daily summaries"
        >
          <History className="size-[18px]" />
        </Link>
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={togglePlay}
          disabled={!state.audioUrl || state.status !== "ready"}
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[#0078ad] text-white shadow-lg shadow-[#0078ad]/25 transition-transform active:scale-95 disabled:cursor-not-allowed disabled:bg-black/20 disabled:shadow-none"
          aria-label={playing ? "Pause briefing" : "Play briefing"}
        >
          {playing ? (
            <Pause className="size-6" strokeWidth={2.2} />
          ) : (
            <Play className="size-6 pl-0.5" strokeWidth={2.2} fill="currentColor" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold leading-snug tracking-tight text-[#141414]">
            {state.headline}
          </h3>
          <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-black/70">
            {state.glimpse}
          </p>
        </div>
      </div>
    </section>
  );
}
