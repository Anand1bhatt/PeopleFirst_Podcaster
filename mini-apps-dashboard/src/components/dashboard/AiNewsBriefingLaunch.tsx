"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

type Props = {
  briefingUrl: string;
};

export function AiNewsBriefingLaunch({ briefingUrl }: Props) {
  const external = briefingUrl.startsWith("http");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        {external ? (
          <a
            href={briefingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ size: "lg" }),
              "inline-flex gap-2 rounded-full px-6"
            )}
          >
            <ExternalLink className="size-4" />
            Open in new tab
          </a>
        ) : (
          <Link
            href={briefingUrl}
            className={cn(
              buttonVariants({ size: "lg" }),
              "inline-flex gap-2 rounded-full px-6"
            )}
          >
            Open full app
          </Link>
        )}
        <p className="w-full text-sm text-muted-foreground sm:w-auto sm:self-center">
          AI News Podcast runs at{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">{briefingUrl}</code>{" "}
          in this deployment.
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-muted/30 shadow-inner">
        <iframe
          title="AI News Podcast"
          src={briefingUrl}
          className="h-[min(85dvh,720px)] w-full bg-background"
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </div>
  );
}
