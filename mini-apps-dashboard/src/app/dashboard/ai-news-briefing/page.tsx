import { permanentRedirect } from "next/navigation";

/** Canonical Figma home lives at /. */
export default function AiNewsBriefingJourneyPage() {
  permanentRedirect("/");
}
