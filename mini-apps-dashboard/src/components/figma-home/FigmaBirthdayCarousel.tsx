"use client";

import type { CSSProperties } from "react";
import { Balloon, Cake, PartyPopper, Phone } from "lucide-react";

type CardTheme = {
  topBg: string;
  bottomBg: string;
  avatarBorder: string;
  name: string;
  subtitle: string;
  photo: string;
};

const CARDS: CardTheme[] = [
  {
    topBg: "bg-[#e48c8d]",
    bottomBg: "bg-[#ca3348]",
    avatarBorder: "border-[#ca3348]",
    name: "Rohan Singh",
    subtitle: "2th Work Anniversary🎉",
    photo:
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&h=200&fit=crop",
  },
  {
    topBg: "bg-[#cbe48c]",
    bottomBg: "bg-[#83a139]",
    avatarBorder: "border-[#83a139]",
    name: "Angad Sharma",
    subtitle: "Birthday 🍰",
    photo:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop",
  },
  {
    topBg: "bg-[#ad99dc]",
    bottomBg: "bg-[#754dd1]",
    avatarBorder: "border-[#754dd1]",
    name: "Arjun Verma",
    subtitle: "Birthday 🍰",
    photo:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop",
  },
];

function BirthdayCard({
  card,
  className,
  style,
}: {
  card: CardTheme;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`relative h-[202px] w-[173px] shrink-0 overflow-hidden rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.24)] ${card.topBg} ${className ?? ""}`}
      style={style}
    >
      {/* Decorative line-art (Figma vectors) — low-opacity white icons */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.35]">
        <Balloon className="absolute left-2 top-3 size-5 rotate-12 text-white" />
        <Cake className="absolute right-4 top-6 size-6 -rotate-6 text-white" />
        <PartyPopper className="absolute bottom-[42%] left-3 size-5 -rotate-12 text-white" />
        <Balloon className="absolute right-2 top-[22%] size-4 rotate-[17deg] text-white" />
      </div>
      <div className="relative flex flex-col items-center pt-5">
        <div
          className={`size-[82px] overflow-hidden rounded-full border-4 border-white bg-white/80 shadow-sm backdrop-blur-sm ${card.avatarBorder}`}
        >
          <img
            src={card.photo}
            alt=""
            className="size-full object-cover"
            width={82}
            height={82}
          />
        </div>
      </div>
      <div
        className={`absolute bottom-0 left-0 right-0 flex flex-col gap-2 rounded-2xl px-4 py-2 backdrop-blur-[3px] ${card.bottomBg}`}
      >
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold leading-4 tracking-tight text-white">
              {card.name}
            </p>
            <p className="mt-0.5 text-[9.5px] font-medium leading-[13px] text-white/95">
              {card.subtitle}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-full border border-[#b5b5b5] bg-white/10 p-1.5 text-white"
            aria-label="Call"
          >
            <Phone className="size-3 text-white" strokeWidth={2.2} />
          </button>
        </div>
        <button
          type="button"
          className="w-full rounded-full border border-[#b5b5b5] py-1.5 text-center text-[11px] font-bold text-white"
        >
          Send wishes
        </button>
      </div>
    </div>
  );
}

/** Figma 1:30648 / Component 7 — fanned 3-card carousel */
export function FigmaBirthdayCarousel() {
  const [left, center, right] = CARDS;

  return (
    <div className="relative h-[300px] w-full overflow-hidden">
      <div className="absolute left-1/2 top-8 flex -translate-x-1/2 items-end justify-center gap-0">
        {/* Left — tilted back (Figma ~rotate-90 on axis → ~-14deg visually) */}
        <div
          className="z-0 origin-bottom"
          style={{
            transform: "translateX(6px) translateY(12px) rotate(-16deg) scale(0.9)",
          }}
        >
          <BirthdayCard card={left} />
        </div>
        <div
          className="z-10 -mx-4"
          style={{ transform: "translateY(-4px)" }}
        >
          <BirthdayCard card={center} />
        </div>
        <div
          className="z-0 origin-bottom"
          style={{
            transform: "translateX(-6px) translateY(12px) rotate(16deg) scale(0.9)",
          }}
        >
          <BirthdayCard card={right} />
        </div>
      </div>
    </div>
  );
}
