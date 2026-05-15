import type { DialogueSpeaker } from "@/types";

/** Map model / legacy JSON to canonical speakers (male host → akshay, female → kriti). */
export function normalizeDialogueSpeaker(raw: string | undefined): DialogueSpeaker | null {
  const s = raw?.toLowerCase().trim() ?? "";
  if (
    s === "akshay" ||
    s === "alex" ||
    s === "male" ||
    s === "m" ||
    s === "host1" ||
    s === "host_1"
  )
    return "akshay";
  if (
    s === "kriti" ||
    s === "jamie" ||
    s === "female" ||
    s === "f" ||
    s === "host2" ||
    s === "host_2"
  )
    return "kriti";
  return null;
}

export function dialogueSpeakerLabel(s: DialogueSpeaker): string {
  return s === "akshay" ? "Akshay" : "Kriti";
}
