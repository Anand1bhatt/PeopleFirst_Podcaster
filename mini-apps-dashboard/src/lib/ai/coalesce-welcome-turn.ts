import type { DialogueTurn } from "@/types";

const WELCOME_MARKERS = /reliance|welcome|ai news podcast/i;

/**
 * If the model split Kriti's opening welcome across two short turns, merge them so TTS
 * does not splice mid-sentence (common cause of "cut" words between turn 0 and 1).
 */
export function coalesceSplitWelcomeTurn(turns: DialogueTurn[]): DialogueTurn[] {
  if (turns.length < 2 || turns[0]?.speaker !== "kriti") return turns;

  const a = turns[0]!.text.trim();
  const b = turns[1]!.text.trim();
  if (!a || !b) return turns;

  const aHasWelcome = WELCOME_MARKERS.test(a);
  const bHasWelcome = WELCOME_MARKERS.test(b);
  const aComplete =
    /reliance/i.test(a) && /welcome/i.test(a) && /ai news podcast/i.test(a);

  if (aComplete) return turns;

  const secondIsKritiContinuation =
    turns[1]!.speaker === "kriti" &&
    b.length <= 120 &&
    (bHasWelcome || /podcast|family|news/i.test(b));

  const secondIsAkshayEcho =
    turns[1]!.speaker === "akshay" &&
    b.length <= 40 &&
    /^(yeah|yes|hey|right|okay|ok)\b/i.test(b);

  if (
    aHasWelcome &&
    (secondIsKritiContinuation || (bHasWelcome && b.length < 100)) &&
    !aComplete
  ) {
    const merged: DialogueTurn = {
      speaker: "kriti",
      text: `${a} ${b}`.replace(/\s+/g, " ").trim(),
      ...(turns[0]!.section_break ? { section_break: true } : {}),
    };
    const rest = secondIsAkshayEcho ? turns.slice(1) : turns.slice(2);
    return [merged, ...rest];
  }

  return turns;
}
