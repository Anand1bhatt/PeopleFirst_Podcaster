"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AiNewsBriefingSpotlightWidget } from "@/components/figma-home/AiNewsBriefingSpotlightWidget";
import {
  buildTopicTeaser,
  formatBriefingDurationLabel,
  type DayBlock,
} from "@/components/figma-home/figma-news-day-card";
import { useFigmaBriefing } from "@/components/figma-home/FigmaBriefingContext";
import { useFigmaDayBriefingPlayer } from "@/components/figma-home/use-figma-day-briefing-player";
import {
  readFigmaBriefingAudioCache,
  writeFigmaBriefingAudioCache,
} from "@/components/figma-home/figma-briefing-audio-cache";
import {
  feedPlaybackKey,
  FIGMA_WIDGET_LANG_STORAGE_KEY,
  type FigmaWidgetLang,
} from "@/components/figma-home/figma-widget-lang";
import { DEFAULT_FIGMA_FEED_DAYS } from "@/lib/figma-daily-feed-data";

const SUBLINE_MAX = 72;

function clipSub(s: string, max = SUBLINE_MAX): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function playbackKeyToDate(key: string | null): string | null {
  if (!key) return null;
  const i = key.indexOf("::");
  return i > 0 ? key.slice(0, i) : key;
}

export function FigmaNewsFeed({
  className,
  sectionTitle = "News feed",
  /** When set (e.g. from RSC home), skip the initial client fetch — data is already in HTML. */
  initialFeed,
}: {
  className?: string;
  /** Accessible name for the region (no visible heading). */
  sectionTitle?: string;
  initialFeed?: { days: DayBlock[] };
}) {
  const [widgetLang, setWidgetLang] = useState<FigmaWidgetLang>("en");
  const [days, setDays] = useState<DayBlock[]>(() => initialFeed?.days ?? []);
  const [loading, setLoading] = useState(() => initialFeed === undefined);
  const [err, setErr] = useState<string | null>(null);
  const { setFeedMiniBar, setFeedAudio } = useFigmaBriefing();

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

  const toggleFeedPlay = useCallback(() => {
    const el = audioRef.current;
    if (!el?.src) return;
    if (el.paused) void el.play();
    else el.pause();
  }, []);

  const seekFeedBy = useCallback((deltaSec: number) => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
    el.currentTime = Math.max(
      0,
      Math.min(el.duration, el.currentTime + deltaSec)
    );
  }, []);

  const seekFeedTo = useCallback((sec: number) => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
    el.currentTime = Math.max(0, Math.min(el.duration, sec));
  }, []);

  const feedControlsRef = useRef({
    toggleFeedPlay,
    seekFeedBy,
    seekFeedTo,
  });
  feedControlsRef.current = { toggleFeedPlay, seekFeedBy, seekFeedTo };

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(
        `/api/figma-daily-feed?days=${DEFAULT_FIGMA_FEED_DAYS}&lang=${widgetLang}&fill=0`,
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
      setErr("Network error — is the app running?");
      setDays([]);
    } finally {
      setLoading(false);
    }
  }, [widgetLang]);

  /** No server payload: fetch on mount. With `initialFeed` + English, skip until lang changes. */
  useEffect(() => {
    if (initialFeed !== undefined && widgetLang === "en") {
      setDays(initialFeed.days);
      setLoading(false);
      return;
    }
    load();
  }, [load, initialFeed, widgetLang]);

  useEffect(() => {
    return () => {
      setFeedMiniBar(null);
      setFeedAudio(null);
    };
  }, [setFeedAudio, setFeedMiniBar]);

  /** Prefetch cached audio URLs for feed days so localStorage is warm before first play. */
  useEffect(() => {
    if (!days.length) return;
    let cancelled = false;
    void (async () => {
      for (const day of days) {
        if (cancelled) break;
        const date = day.date;
        if (readFigmaBriefingAudioCache(date, widgetLang)) continue;
        try {
          const r = await fetch(
            `/api/figma-day-briefing?date=${encodeURIComponent(date)}&lang=${widgetLang}`,
            { cache: "no-store" }
          );
          if (!r.ok) continue;
          const j = (await r.json()) as {
            audio_url?: string;
            briefingId?: string;
          };
          if (typeof j.audio_url === "string" && j.audio_url.trim()) {
            writeFigmaBriefingAudioCache(date, widgetLang, {
              audioUrl: j.audio_url.trim(),
              ...(typeof j.briefingId === "string" && j.briefingId.trim()
                ? { briefingId: j.briefingId.trim() }
                : {}),
            });
          }
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days, widgetLang]);

  const activeDateForBar = playbackKeyToDate(activeAudioKey);
  const generatingDateForBar = playbackKeyToDate(generatingFor);

  /** Sticky mini player: same date/day + topic cues as the day cards. */
  useEffect(() => {
    const today = days[0];
    const todayKey = today ? feedPlaybackKey(today.date, widgetLang) : "";
    const todayDurSec =
      todayKey && audioDurationByKey[todayKey] != null
        ? audioDurationByKey[todayKey]
        : undefined;
    const todayDurationLabel = formatBriefingDurationLabel(todayDurSec);

    const podcastTitle = "Daily AI Podcast";

    const g = generatingDateForBar;
    if (g) {
      const d = days.find((x) => x.date === g);
      const isTodayG = Boolean(today && d && d.date === today.date);
      setFeedMiniBar(
        isTodayG && today
          ? {
              eyebrow: "Preparing audio",
              title: podcastTitle,
              subline: clipSub(today.dayLabel),
              sublineSecondary: formatBriefingDurationLabel(),
            }
          : {
              eyebrow: "Preparing audio",
              title: d?.dayLabel ?? g,
              subline: clipSub("Akshay & Kriti · Generating your podcast…"),
            }
      );
      return;
    }
    if (activeDateForBar && playing) {
      const d = days.find((x) => x.date === activeDateForBar);
      const isToday = Boolean(d && today && d.date === today.date);
      const teaser = d && !isToday ? buildTopicTeaser(d) : "";
      setFeedMiniBar({
        eyebrow: isToday ? "Today" : "Now playing",
        title: isToday ? podcastTitle : d ? d.dayLabel : activeDateForBar,
        subline: clipSub(
          isToday && today
            ? today.dayLabel
            : teaser
              ? `${teaser} · Akshay & Kriti`
              : "Conversation · Akshay & Kriti"
        ),
        ...(isToday ? { sublineSecondary: todayDurationLabel } : {}),
      });
      return;
    }
    if (activeDateForBar && !playing) {
      const d = days.find((x) => x.date === activeDateForBar);
      const isToday = Boolean(d && today && d.date === today.date);
      const dur =
        activeAudioKey != null ? audioDurationByKey[activeAudioKey] : undefined;
      const teaser = d && !isToday ? buildTopicTeaser(d) : "";
      const pausedDurationLabel = formatBriefingDurationLabel(
        dur != null && Number.isFinite(dur) && dur > 0 ? dur : todayDurSec
      );
      setFeedMiniBar({
        eyebrow: isToday ? "Today" : "Paused",
        title: isToday ? podcastTitle : d ? d.dayLabel : activeDateForBar,
        subline: clipSub(
          isToday && today
            ? today.dayLabel
            : `${dur != null && Number.isFinite(dur) && dur > 0 ? `${formatBriefingDurationLabel(dur)} · ` : ""}${teaser || "Resume anytime"}`
        ),
        ...(isToday ? { sublineSecondary: pausedDurationLabel } : {}),
      });
      return;
    }
    if (today) {
      setFeedMiniBar({
        eyebrow: "Today",
        title: podcastTitle,
        subline: clipSub(today.dayLabel),
        sublineSecondary: todayDurationLabel,
      });
      return;
    }
    setFeedMiniBar(null);
  }, [
    days,
    generatingDateForBar,
    activeDateForBar,
    activeAudioKey,
    playing,
    audioDurationByKey,
    widgetLang,
    setFeedMiniBar,
  ]);

  /** Bridge feed <audio> to the sticky player when conversation audio is loaded. */
  useEffect(() => {
    const el = audioRef.current;
    if (!el) {
      setFeedAudio(null);
      return;
    }
    const sync = () => {
      const dur = el.duration;
      const durationSec =
        typeof dur === "number" && Number.isFinite(dur) && dur > 0 ? dur : 0;
      const hasSrc = Boolean(el.currentSrc || el.src);
      const active = hasSrc && activeAudioKey != null;
      const c = feedControlsRef.current;
      setFeedAudio({
        active,
        playing: !el.paused,
        currentSec: el.currentTime,
        durationSec,
        togglePlay: () => {
          c.toggleFeedPlay();
        },
        seekBy: (d: number) => {
          c.seekFeedBy(d);
        },
        seekTo: (t: number) => {
          c.seekFeedTo(t);
        },
      });
    };
    el.addEventListener("timeupdate", sync);
    el.addEventListener("loadedmetadata", sync);
    el.addEventListener("play", sync);
    el.addEventListener("pause", sync);
    el.addEventListener("ended", sync);
    el.addEventListener("seeked", sync);
    sync();
    return () => {
      el.removeEventListener("timeupdate", sync);
      el.removeEventListener("loadedmetadata", sync);
      el.removeEventListener("play", sync);
      el.removeEventListener("pause", sync);
      el.removeEventListener("ended", sync);
      el.removeEventListener("seeked", sync);
      setFeedAudio(null);
    };
  }, [activeAudioKey, setFeedAudio]);

  const today = days[0];
  const pastDays = days.slice(1);
  const todayPlaybackKey = today
    ? feedPlaybackKey(today.date, widgetLang)
    : "";

  return (
    <section className={cn(className)} aria-label={sectionTitle}>
      <audio ref={audioRef} className="hidden" preload="auto" />

      {err && (
        <p className="mb-2 rounded-lg border border-amber-200/80 bg-amber-50/90 px-2.5 py-2 text-[11px] leading-snug text-amber-900">
          {err}
        </p>
      )}

      {loading && (
        <div className="flex items-center gap-2 py-3 text-[13px] text-black/45">
          <Loader2 className="size-4 animate-spin text-[#0078ad]" />
          Loading…
        </div>
      )}

      {!loading && today && (
        <AiNewsBriefingSpotlightWidget
          day={today}
          generatingFor={generatingFor}
          playbackKey={todayPlaybackKey}
          activeAudioKey={activeAudioKey}
          playing={playing}
          briefingErr={briefingErr}
          audioDurationByKey={audioDurationByKey}
          onPlay={() => startConversationBriefing(today.date, widgetLang)}
        />
      )}

      {!loading && pastDays.length > 0 && (
        <Link
          href="/dashboard/ai-news-briefing/past-summaries"
          className="mt-2 flex w-full items-center justify-center gap-0.5 rounded-lg py-2 text-[12px] font-bold text-[#0078ad] transition hover:text-[#006a99]"
        >
          Past day news
          <ChevronRight className="size-3.5" strokeWidth={2.5} />
        </Link>
      )}

      {!loading && !today && !err && (
        <p className="py-2 text-sm text-black/50">No feed data yet.</p>
      )}
    </section>
  );
}
