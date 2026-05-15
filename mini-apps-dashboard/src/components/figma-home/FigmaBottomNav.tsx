"use client";

import {
  CalendarDays,
  GraduationCap,
  Grid3X3,
  Home,
} from "lucide-react";

/** Light Figma tab bar — white chrome, blue active state */
export function FigmaBottomNav() {
  return (
    <nav
      className="flex h-[64px] items-end justify-around border-t border-[#e8eef2] bg-white px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-1px_0_rgba(0,0,0,0.04)]"
      aria-label="Main"
    >
      {[
        { icon: Home, label: "Home", active: true },
        { icon: CalendarDays, label: "Attendance" },
        { icon: GraduationCap, label: "Learn" },
        { icon: Grid3X3, label: "More" },
      ].map(({ icon: Icon, label, active }) => (
        <button
          key={label}
          type="button"
          className={`flex min-w-[56px] flex-col items-center gap-0.5 rounded-md px-2 py-1 ${
            active ? "text-[#0078ad]" : "text-black/40"
          }`}
        >
          <Icon
            className={`size-6 ${active ? "stroke-[2.5px]" : ""}`}
            strokeWidth={active ? 2.5 : 1.75}
          />
          <span className="max-w-[4.5rem] truncate text-[10px] font-semibold leading-none">
            {label}
          </span>
        </button>
      ))}
    </nav>
  );
}
