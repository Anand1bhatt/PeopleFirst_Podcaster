import Link from "next/link";
import { BriefingForm } from "@/components/briefing-form";
import { MiniAppsDashboardLink } from "@/components/mini-apps-dashboard-link";

type PageProps = {
  searchParams: Promise<{ id?: string; figma_demo?: string }>;
};

export default async function Home({ searchParams }: PageProps) {
  const { id, figma_demo } = await searchParams;
  const figmaEmbed = figma_demo === "1" || figma_demo === "true";

  if (figmaEmbed) {
    return (
      <div className="min-h-0 bg-background p-2">
        <BriefingForm figmaEmbedDemo initialBriefingId={id ?? null} />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border/80 bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
        <div className="mx-auto grid w-full max-w-lg grid-cols-1 gap-3 px-4 py-4 sm:max-w-2xl sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-4 sm:py-3">
          <MiniAppsDashboardLink className="inline-flex h-11 items-center justify-center rounded-full border-2 border-primary/15 bg-card px-4 text-sm font-semibold text-primary transition-colors hover:border-primary/30 sm:h-10 sm:justify-self-start" />
          <h1 className="text-center text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-lg sm:justify-self-center">
            AI News Briefing
          </h1>
          <Link
            href="/history"
            className="inline-flex h-11 w-full items-center justify-center rounded-full border-2 border-primary/20 bg-card px-6 text-base font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted/50 sm:h-10 sm:w-auto sm:justify-self-end sm:px-5 sm:text-sm"
          >
            History
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-6 sm:max-w-2xl sm:px-6 sm:pt-8">
        <p className="mb-6 text-base leading-relaxed text-muted-foreground sm:mb-8 sm:text-[0.95rem]">
          Add news URLs or paste text—or search by topic to load articles automatically—then get a
          conversational audio briefing.
        </p>
        <BriefingForm initialBriefingId={id ?? null} />
      </main>
    </div>
  );
}
