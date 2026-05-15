"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import type { BriefingWithSources } from "@/lib/db/briefings";
import { cn } from "@/lib/utils";

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BriefingHistoryList() {
  const [briefings, setBriefings] = useState<BriefingWithSources[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchList() {
      try {
        const res = await fetch("/api/briefings/list");
        if (res.ok) {
          const data = await res.json();
          setBriefings(data.briefings ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchList();
  }, []);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading history...</p>;
  }

  if (briefings.length === 0) {
    return (
      <p className="text-muted-foreground">
        No briefings yet.{" "}
        <Link href="/" className="underline hover:no-underline">
          Create one
        </Link>
        .
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {briefings.map((b) => (
        <li key={b.id}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold leading-snug sm:text-base">
                {b.summary?.headline ?? `Briefing ${b.id.slice(0, 8)}`}
              </CardTitle>
              <p className="text-sm text-muted-foreground sm:text-xs">
                {formatDate(b.created_at)} · {b.sources.length} source(s) ·{" "}
                {b.tts_provider === "microsoft" ? "Azure TTS" : "ElevenLabs"} · {b.status}
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              <Link
                href={`/?id=${b.id}`}
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "w-full sm:h-10 sm:min-h-10 sm:w-auto sm:px-6"
                )}
              >
                {b.status === "completed" && b.audio_url ? "Replay" : "View"}
              </Link>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
