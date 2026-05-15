import Link from "next/link";
import { BriefingHistoryList } from "@/components/briefing-history-list";
import { MiniAppsDashboardLink } from "@/components/mini-apps-dashboard-link";

export default function HistoryPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border/80 bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-lg flex-wrap items-center justify-between gap-3 px-4 py-4 sm:max-w-2xl sm:py-3">
          <MiniAppsDashboardLink className="inline-flex h-10 items-center rounded-full border-2 border-primary/15 px-3 text-sm font-semibold text-primary hover:border-primary/30" />
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-primary hover:underline sm:text-xl"
          >
            AI News Briefing
          </Link>
          <span className="rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
            History
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6 sm:max-w-2xl sm:px-6 sm:py-10">
        <BriefingHistoryList />
      </main>
    </div>
  );
}
