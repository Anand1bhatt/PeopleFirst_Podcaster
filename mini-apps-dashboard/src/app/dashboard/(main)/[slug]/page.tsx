import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { AI_NEWS_BRIEFING_SLUG, MINI_APPS } from "@/data/mini-apps";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;

  if (slug === AI_NEWS_BRIEFING_SLUG) {
    permanentRedirect("/");
  }

  const app = MINI_APPS.find((a) => a.slug === slug);
  if (!app) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-8 md:px-6">
      <Link
        href="/"
        className="mb-6 inline-flex h-10 items-center rounded-full px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        ← Home
      </Link>
      <article className="mx-auto max-w-4xl">
        <h1 className="mb-2 text-3xl font-semibold tracking-tight">
          {app.title}
        </h1>
        <p className="mb-6 text-muted-foreground">{app.description}</p>
        <div className="rounded-2xl border bg-muted/50 p-8 text-center text-muted-foreground">
          Coming soon — product page placeholder
        </div>
      </article>
    </div>
  );
}
