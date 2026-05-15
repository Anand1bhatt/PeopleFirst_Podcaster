import { create } from "zustand";
import type { BriefingWithSources } from "@/lib/db/briefings";

type BriefingStore = {
  currentId: string | null;
  current: BriefingWithSources | null;
  setCurrentId: (id: string | null) => void;
  setCurrent: (b: BriefingWithSources | null) => void;
};

export const useBriefingStore = create<BriefingStore>((set) => ({
  currentId: null,
  current: null,
  setCurrentId: (id) => set({ currentId: id, current: null }),
  setCurrent: (current) => set({ current }),
}));
