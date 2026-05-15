"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
export type FigmaBriefingState = {
  headline: string;
  glimpse: string;
  sourceCount: number;
  durationSec: number | null;
  durationLabel: string;
  audioUrl: string | null;
  status: "generating" | "ready" | "error";
  /** Full app URL for opening the full briefing app */
  fullAppNote?: string;
};

/** Shown in the mini player when the feed has not published metadata yet. */
const INITIAL_GLIMPSE =
  "Use the news feed to play a two-host briefing for each day, or expand below for the embed.";

function formatDuration(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const defaultState: FigmaBriefingState = {
  headline: "AI News Podcast",
  glimpse: INITIAL_GLIMPSE,
  sourceCount: 0,
  durationSec: null,
  durationLabel: "—",
  audioUrl: null,
  status: "ready",
};

/** Synced from FigmaNewsFeed — date/day lines for the sticky mini player. */
export type FeedMiniBarMeta = {
  eyebrow: string;
  title: string;
  subline: string;
  /** Second row (e.g. approximate duration below the tagline). */
  sublineSecondary?: string;
};

/** Live feed conversation audio (separate from iframe / postMessage audio). */
export type FeedAudioSnap = {
  active: boolean;
  playing: boolean;
  currentSec: number;
  durationSec: number;
  togglePlay: () => void;
  seekBy: (deltaSec: number) => void;
  seekTo: (sec: number) => void;
};

export type FigmaAudioProgress = {
  currentSec: number;
  durationSec: number;
};

type Ctx = {
  state: FigmaBriefingState;
  feedMiniBar: FeedMiniBarMeta | null;
  setFeedMiniBar: (v: FeedMiniBarMeta | null) => void;
  feedAudio: FeedAudioSnap | null;
  setFeedAudio: (v: FeedAudioSnap | null) => void;
  playing: boolean;
  playbackRate: number;
  progress: FigmaAudioProgress;
  togglePlay: () => void;
  seekBy: (deltaSec: number) => void;
  seekTo: (sec: number) => void;
  setPlaybackRate: (rate: number) => void;
};

const FigmaBriefingContext = createContext<Ctx | null>(null);

export function useFigmaBriefing() {
  const c = useContext(FigmaBriefingContext);
  if (!c) throw new Error("useFigmaBriefing outside provider");
  return c;
}

export function FigmaBriefingProvider({
  children,
  briefingUrl,
}: {
  children: React.ReactNode;
  briefingUrl: string;
}) {
  const [state, setState] = useState<FigmaBriefingState>(defaultState);
  const [feedMiniBar, setFeedMiniBar] = useState<FeedMiniBarMeta | null>(null);
  const [feedAudio, setFeedAudio] = useState<FeedAudioSnap | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [progress, setProgress] = useState<FigmaAudioProgress>({
    currentSec: 0,
    durationSec: 0,
  });
  const audioRef = useRef<HTMLAudioElement>(null);

  const briefingOrigin = useMemo(() => {
    if (typeof window === "undefined") return "";
    try {
      const resolved = briefingUrl.startsWith("http")
        ? briefingUrl
        : new URL(briefingUrl, window.location.origin).href;
      return new URL(resolved).origin;
    } catch {
      return window.location.origin;
    }
  }, [briefingUrl]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (briefingOrigin && e.origin !== briefingOrigin) return;
      if (e.data?.type !== "AI_BRIEFING_WIDGET") return;
      const d = e.data as {
        headline?: string;
        glimpse?: string;
        sourceCount?: number;
        durationSec?: number | null;
        audioUrl?: string | null;
        status?: "error";
        fullAppUrl?: string;
      };
      setState((s) => ({
        ...s,
        headline: d.headline ?? s.headline,
        glimpse: d.glimpse ?? s.glimpse,
        sourceCount:
          typeof d.sourceCount === "number" ? d.sourceCount : s.sourceCount,
        durationSec:
          d.durationSec != null ? d.durationSec : s.durationSec,
        durationLabel:
          d.durationSec != null && Number.isFinite(d.durationSec)
            ? formatDuration(d.durationSec)
            : d.audioUrl
              ? "~3:00"
              : s.durationLabel,
        audioUrl: d.audioUrl ?? s.audioUrl,
        status: d.status === "error" ? "error" : d.audioUrl ? "ready" : s.status,
        fullAppNote: d.fullAppUrl ?? s.fullAppNote ?? briefingUrl,
      }));
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [briefingOrigin, briefingUrl]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !state.audioUrl) return;
    el.src = state.audioUrl;
    el.playbackRate = playbackRate;
    setProgress({ currentSec: 0, durationSec: 0 });
    el.load();
  }, [state.audioUrl]);

  useEffect(() => {
    const el = audioRef.current;
    if (el) el.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const sync = () => {
      const d = el.duration;
      setProgress({
        currentSec: el.currentTime,
        durationSec: Number.isFinite(d) && d > 0 ? d : 0,
      });
    };
    const onEnded = () => {
      setPlaying(false);
      setProgress((p) => ({ ...p, currentSec: 0 }));
    };
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    el.addEventListener("timeupdate", sync);
    el.addEventListener("loadedmetadata", sync);
    el.addEventListener("seeked", sync);
    el.addEventListener("ended", onEnded);
    el.addEventListener("pause", onPause);
    el.addEventListener("play", onPlay);
    return () => {
      el.removeEventListener("timeupdate", sync);
      el.removeEventListener("loadedmetadata", sync);
      el.removeEventListener("seeked", sync);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("play", onPlay);
    };
  }, [state.audioUrl]);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el?.src) return;
    if (playing) el.pause();
    else void el.play().catch(() => {});
  }, [playing]);

  const seekBy = useCallback((deltaSec: number) => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
    el.currentTime = Math.max(0, Math.min(el.duration, el.currentTime + deltaSec));
  }, []);

  const seekTo = useCallback((sec: number) => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
    el.currentTime = Math.max(0, Math.min(el.duration, sec));
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    const el = audioRef.current;
    const r = Math.min(1.5, Math.max(0.75, rate));
    setPlaybackRateState(r);
    if (el) el.playbackRate = r;
  }, []);

  const value = useMemo(
    () => ({
      state,
      feedMiniBar,
      setFeedMiniBar,
      feedAudio,
      setFeedAudio,
      playing,
      playbackRate,
      progress,
      togglePlay,
      seekBy,
      seekTo,
      setPlaybackRate,
    }),
    [
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
    ]
  );

  return (
    <FigmaBriefingContext.Provider value={value}>
      <audio ref={audioRef} preload="metadata" className="hidden" />
      {children}
    </FigmaBriefingContext.Provider>
  );
}
