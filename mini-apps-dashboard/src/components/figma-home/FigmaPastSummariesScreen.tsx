"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2 } from "lucide-react";
import { AiNewsBriefingBottomWidget } from "./AiNewsBriefingBottomWidget";
import { FigmaBottomNav } from "./FigmaBottomNav";
import { FigmaBriefingProvider } from "./FigmaBriefingContext";
import {
  FigmaNewsDayCard,
  type DayBlock,
} from "@/components/figma-home/figma-news-day-card";
import { useFigmaDayBriefingPlayer } from "@/components/figma-home/use-figma-day-briefing-player";
import {
  feedPlaybackKey,
  FIGMA_WIDGET_LANG_STORAGE_KEY,
  type FigmaWidgetLang,
} from "@/components/figma-home/figma-widget-lang";

const FEED_DAYS = 10;

type Props = {
  briefingUrl: string;
};

export function FigmaPastSummariesScreen({ briefingUrl }: Props) {
  const [widgetLang, setWidgetLang] = useState<FigmaWidgetLang>("en");
  const [days, setDays] = useState<DayBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem(FIGMA_WIDGET_LANG_STORAGE_KEY);
      if (s === "hi" || s === "en") setWidgetLang(s);
    } catch {
      /* ignore */
    }
  }, []);

  const {
    audioRef,
    generatingFor,
    briefingErr,
    activeAudioKey,
    playing,
    startConversationBriefing,
    audioDurationByKey,
  } = useFigmaDayBriefingPlayer();

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(
        `/api/figma-daily-feed?days=${FEED_DAYS}&lang=${widgetLang}&fill=0`,
        { cache: "no-store" }
      );
      const j = await r.json();
      if (!r.ok) {
        const main =
          typeof j.error === "string" ? j.error : "Could not load feed";
        const hint = typeof j.hint === "string" ? j.hint : "";
        setErr(hint ? `${main} ${hint}` : main);
        setDays([]);
        return;
      }
      setDays(Array.isArray(j.days) ? j.days : []);
    } catch {
      setErr("Network error — is the briefing app running?");
      setDays([]);
    } finally {
      setLoading(false);
    }
  }, [widgetLang]);

  useEffect(() => {
    load();
  }, [load]);

  const pastDays = days.slice(1);

  const inner = (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[360px] flex-col bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.04)]">
      <main className="flex-1 overflow-y-auto px-6 pb-[220px] pt-5">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-[#013e7c] hover:underline"
        >
          <ChevronLeft className="size-4" />
          Back to homepage
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-[#141414]">
              Past summaries
            </h1>
            <p className="mt-0.5 text-xs text-black/50">
              Newest past days first (conversation play per date)
            </p>
          </div>
          <label className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-[#013e7c]/80">
            <span className="sr-only">Briefing language</span>
            <select
              value={widgetLang}
              onChange={(e) => {
                const next = e.target.value === "hi" ? "hi" : "en";
                try {
                  localStorage.setItem(FIGMA_WIDGET_LANG_STORAGE_KEY, next);
                } catch {
                  /* ignore */
                }
                setWidgetLang(next);
              }}
              className="rounded-lg border border-[#0078ad]/25 bg-white px-2 py-1.5 text-[12px] font-bold text-[#013e7c] shadow-sm outline-none ring-[#0078ad]/20 focus:ring-2"
            >
              <option value="en">English</option>
              <option value="hi">हिंदी</option>
            </select>
          </label>
        </div>

        <audio ref={audioRef} className="hidden" preload="auto" />

        {err && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {err}
          </p>
        )}

        {loading && (
          <div className="mt-6 flex items-center gap-2 text-sm text-black/50">
            <Loader2 className="size-5 animate-spin text-[#0078ad]" />
            Loading…
          </div>
        )}

        {!loading &&
          pastDays.map((day) => (
            <div key={day.date} className="mt-4">
              <FigmaNewsDayCard
                day={day}
                isToday={false}
                generatingFor={generatingFor}
                playbackKey={feedPlaybackKey(day.date, widgetLang)}
                activeAudioKey={activeAudioKey}
                playing={playing}
                briefingErr={briefingErr}
                audioDurationByKey={audioDurationByKey}
                onPlay={() => startConversationBriefing(day.date, widgetLang)}
              />
            </div>
          ))}

        {!loading && !pastDays.length && !err && (
          <p className="mt-6 text-sm text-black/50">No past days in feed.</p>
        )}
      </main>

      <div className="fixed bottom-0 left-1/2 z-50 w-full max-w-[360px] -translate-x-1/2 bg-white shadow-[0_-8px_32px_rgba(0,0,0,0.1)] ring-1 ring-black/[0.06]">
        <AiNewsBriefingBottomWidget briefingUrl={briefingUrl} />
        <FigmaBottomNav />
      </div>
    </div>
  );

  return (
    <FigmaBriefingProvider briefingUrl={briefingUrl}>{inner}</FigmaBriefingProvider>
  );
}
