"use client";

import {
  Bell,
  ChevronRight,
  ArrowRight,
  LogOut,
  Search,
  UserX,
  Phone,
  Shield,
  Network,
  Wrench,
  Gift,
  MessageSquarePlus,
  Megaphone,
  Users,
} from "lucide-react";
import { FigmaBirthdayCarousel } from "./FigmaBirthdayCarousel";
import { FigmaBriefingProvider } from "./FigmaBriefingContext";
import { FigmaHomeStickyFooter } from "./FigmaHomeStickyFooter";
import { FigmaNewsFeed } from "./FigmaNewsFeed";
import type { DayBlock } from "@/components/figma-home/figma-news-day-card";
import { cn } from "@/lib/utils";

type Props = {
  briefingUrl: string;
  initialFeed?: { days: DayBlock[] };
};

/** Manager home — aligned to Figma node 1:30080 (Figma MCP) */
function DiwaliHomeScreenInner({ briefingUrl, initialFeed }: Props) {
  const announcements = [
    {
      title: "Policy change - Mobile Handset",
      date: "29/09/2024",
    },
    {
      title: "Policy change - International roaming",
      date: "14/05/2024",
    },
    {
      title: "Update address in User Profile",
      date: "23/01/2024",
    },
  ];

  const quickLinksRow1 = [
    { Icon: Phone, label: "Important Contacts" },
    { Icon: Shield, label: "Insurance Card" },
    { Icon: Network, label: "Reporting Structure" },
  ];
  const quickLinksRow2 = [
    { Icon: Wrench, label: "Self Services" },
    { Icon: Gift, label: "Benefits" },
    { Icon: MessageSquarePlus, label: "Raise a Query" },
  ];

  return (
    <div
      className="relative mx-auto flex min-h-dvh w-full max-w-[360px] flex-col bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.04)]"
      data-figma-node="1:30080"
    >
      {/* Hero — height follows content (no fixed min-height gap after removing Attendance Summary) */}
      <div className="relative w-full shrink-0 overflow-hidden">
        <img
          src="/hero-top-bg.png"
          alt=""
          className="absolute inset-0 size-full min-h-full object-cover object-center"
          width={720}
          height={860}
          fetchPriority="high"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/30 via-black/5 to-black/15"
          aria-hidden
        />

        <div
          className={cn(
            "relative z-10 flex flex-col px-6 pb-8 pt-4",
            "text-white"
          )}
        >
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="size-8 shrink-0 overflow-hidden rounded-full ring-2 ring-white/40">
                <img
                  src="https://images.unsplash.com/photo-1560250097-0b93528c311a?w=96&h=96&fit=crop"
                  alt=""
                  className="size-full object-cover"
                  width={32}
                  height={32}
                />
              </div>
              <p className="truncate text-lg font-medium leading-6 tracking-[-0.09px] text-white drop-shadow-sm">
                Hello, Harikrishna{" "}
              </p>
            </div>
            <button
              type="button"
              className="flex size-10 shrink-0 items-center justify-center text-white/95"
              aria-label="Search"
            >
              <Search className="size-6" strokeWidth={1.8} />
            </button>
            <div className="relative shrink-0">
              <button
                type="button"
                className="flex size-10 items-center justify-center text-white/95"
                aria-label="Notifications"
              >
                <Bell className="size-6" strokeWidth={1.8} />
              </button>
              <span className="absolute right-0 top-1 flex min-w-[14px] items-center justify-center rounded-full bg-[#f50031] px-1 py-0.5 text-[8px] font-bold leading-none text-white">
                4
              </span>
            </div>
          </div>

          <div className="mt-4 flex w-full flex-col gap-4">
            {/* Check_in 1:30101 */}
            <div className="flex w-full items-center gap-4 rounded-2xl bg-white px-4 py-1 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
              <div className="flex flex-1 items-center justify-center gap-3 rounded-2xl py-1">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#25ab21]">
                  <ArrowRight className="size-4 text-white" strokeWidth={2.5} />
                </div>
                <div className="text-left">
                  <p className="text-xs font-medium leading-4 tracking-[-0.06px] text-black/[0.65]">
                    Mark In
                  </p>
                  <p className="text-sm font-bold leading-5 tracking-[-0.07px] text-[#141414]">
                    09:30
                  </p>
                </div>
              </div>
              <div className="h-[30px] w-px shrink-0 rounded-full bg-[#e0e0e0]" />
              <div className="flex flex-1 items-center justify-center gap-3 rounded-2xl py-1">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#f5f5f5]">
                  <LogOut className="size-4 text-[#b5b5b5]" strokeWidth={2.2} />
                </div>
                <div className="text-left">
                  <p className="text-xs font-medium leading-4 tracking-[-0.06px] text-black/[0.65]">
                    Mark out
                  </p>
                  <p className="text-sm font-bold leading-5 tracking-[-0.07px] text-[#141414]">
                    --/--
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <main
        className={cn(
          "relative -mt-3 flex-1 overflow-y-auto rounded-t-[20px] bg-white",
          /* Bottom tab bar (~64px) + safe area */
          "pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))]"
        )}
      >
        <div className="flex justify-center py-3">
          <div className="h-1 w-16 rounded-full bg-black/10" aria-hidden />
        </div>

        {/* My Team 1:30223 */}
        <section className="px-6 pb-3">
          <h2 className="mb-3 text-base font-black tracking-[-0.48px] text-[#141414]">
            My Team
          </h2>
          <div className="-mx-1 flex gap-4 overflow-x-auto pb-1 scrollbar-hide">
            {[
              {
                Icon: UserX,
                value: "1",
                label: "Not Reported",
                h: "h-[92px]",
              },
              {
                Icon: LogOut,
                value: "3",
                labelLines: ["Separation", "Request"],
                h: "min-h-[92px]",
              },
              {
                Icon: Users,
                value: "69 ",
                sub: "/ 4000",
                label: "Reportees",
                h: "h-[92px]",
              },
            ].map((card, i) => (
              <div
                key={i}
                className={cn(
                  "flex w-[140px] shrink-0 flex-col gap-2 rounded-2xl bg-white px-4 py-3 shadow-[0_4px_16px_rgba(0,0,0,0.08)]",
                  card.h
                )}
              >
                <div className="flex items-center gap-2">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#fef7e9] p-1">
                    <card.Icon
                      className="size-[22px] text-[#ea580c]"
                      strokeWidth={2}
                    />
                  </div>
                  <div className="font-black leading-5 tracking-[-0.48px] text-[#0c5273]">
                    {card.value}
                    {card.sub && (
                      <span className="text-xs font-medium tracking-[-0.06px] text-[#0c5273]">
                        {card.sub}
                      </span>
                    )}
                  </div>
                </div>
                <div className="pl-1">
                  {card.label && (
                    <p className="text-xs font-medium leading-4 tracking-[-0.06px] text-black/[0.65]">
                      {card.label}
                    </p>
                  )}
                  {card.labelLines && (
                    <p className="text-xs font-medium leading-4 tracking-[-0.06px] text-black/[0.65]">
                      {card.labelLines[0]}
                      <br />
                      {card.labelLines[1]}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Attendance Status (team) 1:30278 */}
        <section className="px-6 pb-5 pt-2">
          <h2 className="mb-3 text-base font-black tracking-[-0.48px] text-[#141414]">
            Attendance Status
          </h2>
          <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
            <p className="text-lg font-bold leading-6 tracking-[-0.09px] text-[#0c5273]">
              <span className="text-lg">69 </span>
              <span className="text-xs font-bold text-[#141414]">Total members</span>
            </p>
            <div className="relative h-2 w-full overflow-hidden rounded-[14px] bg-[#f7ab20]">
              <div
                className="absolute left-0 top-0 h-full rounded-l-[14px] bg-[#e30513] border-r border-white"
                style={{ width: `${(257 / 280) * 100}%` }}
              />
              <div
                className="absolute left-0 top-0 h-full rounded-l-[14px] bg-[#25ab21] border-r border-white"
                style={{ width: `${(217 / 280) * 100}%` }}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex gap-2">
                <div className="w-1 self-stretch rounded bg-[#25ab21]" />
                <div>
                  <p className="whitespace-nowrap text-xs font-medium leading-4 tracking-[-0.06px] text-black/[0.65]">
                    Available
                  </p>
                  <p className="text-sm font-bold leading-5 tracking-[-0.07px] text-[#0c5273]">
                    52
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="w-1 self-stretch rounded bg-[#f50031]" />
                <div>
                  <p className="whitespace-nowrap text-xs font-medium leading-4 tracking-[-0.06px] text-black/[0.65]">
                    On Leave
                  </p>
                  <p className="text-sm font-bold leading-5 tracking-[-0.07px] text-[#0c5273]">
                    10
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="w-1 self-stretch rounded bg-[#f7ab20]" />
                <div>
                  <p className="whitespace-nowrap text-xs font-medium leading-4 tracking-[-0.06px] text-black/[0.65]">
                    Not reported
                  </p>
                  <p className="text-sm font-bold leading-5 tracking-[-0.07px] text-[#0c5273]">
                    7
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 pb-5">
          <FigmaNewsFeed
            className="mt-0"
            sectionTitle="AI News Podcast"
            initialFeed={initialFeed}
          />
        </section>

        {/* Quick Links 1:30363 */}
        <section className="px-6 pb-5">
          <h2 className="mb-3 text-base font-black tracking-[-0.48px] text-[#141414]">
            Quick Links
          </h2>
          <div className="flex flex-col gap-4 rounded-[24px] bg-white p-4 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
            <div className="flex gap-4">
              {quickLinksRow1.map(({ Icon, label }) => (
                <button
                  key={label}
                  type="button"
                  className="flex min-w-0 flex-1 flex-col items-center gap-1"
                >
                  <span className="flex size-12 items-center justify-center rounded-full bg-[#e5f1f7] p-2">
                    <Icon className="size-8 text-[#0078ad]" strokeWidth={1.75} />
                  </span>
                  <span className="text-center text-xs font-medium leading-4 tracking-[-0.06px] text-black/[0.65]">
                    {label}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex gap-4">
              {quickLinksRow2.map(({ Icon, label }) => (
                <button
                  key={label}
                  type="button"
                  className="flex min-w-0 flex-1 flex-col items-center gap-1"
                >
                  <span className="flex size-12 items-center justify-center rounded-full bg-[#e5f1f7] p-2">
                    <Icon className="size-8 text-[#0078ad]" strokeWidth={1.75} />
                  </span>
                  <span className="text-center text-xs font-medium leading-4 tracking-[-0.06px] text-black/[0.65]">
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Announcement 1:30397 */}
        <section className="px-6 pb-5">
          <h2 className="mb-3 text-base font-black tracking-[-0.48px] text-[#141414]">
            Announcement
          </h2>
          <div className="rounded-2xl border border-[#f5f5f5] bg-white p-4">
            <div className="flex flex-col gap-4">
              {announcements.map((a) => (
                <div key={a.title} className="flex gap-3">
                  <Megaphone className="mt-0.5 size-5 shrink-0 text-[#0078ad]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold leading-5 tracking-[-0.07px] text-[#0c5273]">
                      {a.title}
                    </p>
                    <p className="mt-0.5 text-xs font-medium leading-4 tracking-[-0.06px] text-black/[0.65]">
                      {a.date}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center border-t border-[#e7ebf8] pt-2">
              <span className="flex-1 text-sm font-bold tracking-[-0.07px] text-[#0c5273]">
                View all
              </span>
              <ChevronRight className="size-6 text-[#0c5273]" />
            </div>
          </div>
        </section>

        {/* Birthdays & Anniversaries — Figma 1:30648 carousel */}
        <section className="bg-[#f5f5f5] pb-10 pt-2">
          <h2 className="mb-1 px-4 text-center text-2xl font-medium leading-8 tracking-tight text-[#141414]">
            Birthdays &amp; Anniversaries
          </h2>
          <FigmaBirthdayCarousel />
          <div className="mt-2 flex justify-center px-6">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-[#e0e0e0] bg-white px-8 py-2.5 text-sm font-bold tracking-[-0.07px] text-[#0c5273] shadow-sm"
            >
              View Upcoming
              <ChevronRight className="size-5" strokeWidth={2.2} />
            </button>
          </div>
        </section>
      </main>

      <FigmaHomeStickyFooter briefingUrl={briefingUrl} />
    </div>
  );
}

export function DiwaliHomeScreen({ briefingUrl, initialFeed }: Props) {
  return (
    <FigmaBriefingProvider briefingUrl={briefingUrl}>
      <DiwaliHomeScreenInner
        briefingUrl={briefingUrl}
        initialFeed={initialFeed}
      />
    </FigmaBriefingProvider>
  );
}
