import Link from "next/link";
import { FigmaPastSummariesScreen } from "@/components/figma-home/FigmaPastSummariesScreen";
import { getBriefingAppUrl } from "@/lib/briefing-public-url";

export const metadata = {
  title: "Past summaries | AI News Podcast | Mini Apps",
  description: "Browse past daily news summaries from the Figma journey feed.",
};

export default function PastSummariesPage() {
  const briefingUrl = getBriefingAppUrl();

  return (
    <>
      <header className="fixed left-0 right-0 top-0 z-[70] flex h-12 items-center justify-between gap-2 border-b border-[#d0e4f0] bg-white/95 px-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/90 sm:h-14 sm:px-5">
        <Link
          href="/"
          className="shrink-0 rounded-full px-2 py-1.5 text-xs font-semibold text-[#013e7c] transition-colors hover:bg-[#e8f4fc] sm:px-3 sm:text-sm"
        >
          ← Home
        </Link>
        <span className="hidden min-w-0 truncate text-center text-[11px] font-medium text-[#013e7c]/80 sm:block sm:text-xs">
          Past summaries
        </span>
        {briefingUrl.startsWith("http") ? (
          <a
            href={briefingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-full bg-[#0078ad] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#006a9a] sm:px-4 sm:text-sm"
          >
            Open full app ↗
          </a>
        ) : (
          <Link
            href={briefingUrl}
            className="shrink-0 rounded-full bg-[#0078ad] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#006a9a] sm:px-4 sm:text-sm"
          >
            Open full app
          </Link>
        )}
      </header>

      <div className="flex justify-center px-2 pb-10 pt-14 sm:px-4 sm:pt-16">
        <FigmaPastSummariesScreen briefingUrl={briefingUrl} />
      </div>
    </>
  );
}
