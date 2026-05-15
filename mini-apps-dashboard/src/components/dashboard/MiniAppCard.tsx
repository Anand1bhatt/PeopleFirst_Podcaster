import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { MiniApp } from "@/types/mini-app";
import { AI_NEWS_BRIEFING_SLUG } from "@/data/mini-apps";

type MiniAppCardProps = MiniApp;

export function MiniAppCard({ slug, title, description }: MiniAppCardProps) {
  const href =
    slug === AI_NEWS_BRIEFING_SLUG
      ? "/"
      : `/dashboard/${slug}`;
  const hint =
    slug === AI_NEWS_BRIEFING_SLUG
      ? "Figma design + widget → full app from header"
      : "Click to open product page";
  return (
    <Link
      href={href}
      className="block rounded-xl transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card className="h-full transition-colors hover:border-primary/50 hover:ring-primary/20">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
