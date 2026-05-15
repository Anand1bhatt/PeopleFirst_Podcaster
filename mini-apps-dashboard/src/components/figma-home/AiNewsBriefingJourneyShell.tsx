"use client";

import { useEffect, useState } from "react";
import { CircleHelp } from "lucide-react";
import type { DayBlock } from "@/components/figma-home/figma-news-day-card";
import { DiwaliHomeScreen } from "./DiwaliHomeScreen";
import { AiNewsBriefingOnboardingModal } from "./AiNewsBriefingOnboardingModal";

const TOUR_DISMISSED_KEY = "ai-news-briefing-tour-dismissed";

type Props = {
  briefingUrl: string;
  /** Server-prefetched feed so the widget can render before client fetch. */
  initialFeed?: { days: DayBlock[] };
};

export function AiNewsBriefingJourneyShell({
  briefingUrl,
  initialFeed,
}: Props) {
  /** null = hydration: avoid wrong initial open state vs localStorage */
  const [onboardingOpen, setOnboardingOpen] = useState<boolean | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const dismissed = localStorage.getItem(TOUR_DISMISSED_KEY) === "1";
        setOnboardingOpen(!dismissed);
      } catch {
        setOnboardingOpen(true);
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const handleTourClose = () => {
    try {
      localStorage.setItem(TOUR_DISMISSED_KEY, "1");
    } catch {
      /* ignore quota / private mode */
    }
    setOnboardingOpen(false);
  };

  return (
    <>
      <AiNewsBriefingOnboardingModal
        open={onboardingOpen === true}
        onClose={handleTourClose}
      />

      <header className="fixed left-0 right-0 top-0 z-[70] flex h-12 items-center justify-between gap-2 border-b border-[#d0e4f0] bg-white/95 px-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/90 sm:h-14 sm:px-5">
        <span className="min-w-0 shrink truncate text-xs font-semibold text-[#013e7c] sm:text-sm">
          Home
        </span>
        <span className="hidden min-w-0 truncate text-center text-[11px] font-medium text-[#013e7c]/80 sm:block sm:text-xs">
          Briefing widget below
        </span>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setOnboardingOpen(true)}
            className="inline-flex items-center gap-1 rounded-full border border-[#013e7c]/20 px-2.5 py-1.5 text-xs font-bold text-[#013e7c] transition-colors hover:bg-[#e8f4fc] sm:px-3 sm:text-sm"
            aria-label="Open AI News Podcast tour"
          >
            <CircleHelp className="size-4 shrink-0 sm:size-[18px]" strokeWidth={2} />
            <span className="hidden sm:inline">Tour</span>
          </button>
          <a
            href={briefingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center rounded-full bg-[#0078ad] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#006a9a] sm:px-4 sm:text-sm"
          >
            Open full app ↗
          </a>
        </div>
      </header>

      <div className="flex justify-center px-2 pb-10 pt-14 sm:px-4 sm:pt-16">
        <DiwaliHomeScreen
          briefingUrl={briefingUrl}
          initialFeed={initialFeed}
        />
      </div>
    </>
  );
}
