"use client";

import { useState } from "react";
import { Check, Circle, Loader2, FileText, Globe } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { Source, BriefingStatus, PipelineProgress } from "@/types";

function sourceHost(src: Source): string | null {
  if (src.type !== "url") return null;
  try {
    const v = src.value.trim();
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return u.hostname.replace(/^www\./i, "") || null;
  } catch {
    return null;
  }
}

function sourceDisplayLine(src: Source): string {
  const h = sourceHost(src);
  if (h) return h;
  const t = src.value.replace(/\s+/g, " ").trim();
  if (!t) return "Pasted text";
  return t.length > 56 ? `${t.slice(0, 56)}…` : t;
}

function SourceFavicon({ host }: { host: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) {
    return (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Globe className="size-4 text-muted-foreground" aria-hidden />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
      alt=""
      width={36}
      height={36}
      className="size-9 shrink-0 rounded-lg bg-white ring-1 ring-border object-contain"
      onError={() => setOk(false)}
    />
  );
}

const PHASE_LABELS: Record<BriefingStatus, string> = {
  pending: "Queued…",
  extracting: "Gathering sources",
  summarizing: "Writing briefing",
  generating_audio: "Creating audio",
  completed: "Done",
  failed: "Stopped",
};

function fallbackPercent(status: BriefingStatus): number {
  switch (status) {
    case "pending":
      return 3;
    case "extracting":
      return 18;
    case "summarizing":
      return 52;
    case "generating_audio":
      return 80;
    default:
      return 0;
  }
}

type Props = {
  status: BriefingStatus;
  pipeline_progress: PipelineProgress | null;
  sources: Source[];
  /** Smaller layout for Figma embed */
  compact?: boolean;
};

const MINI_STEPS: { stepKey: PipelineProgress["step_key"]; label: string; statuses: BriefingStatus[] }[] =
  [
    { stepKey: "sources", label: "Scan your sources", statuses: ["pending", "extracting"] },
    { stepKey: "summarize", label: "Write dialogue", statuses: ["summarizing"] },
    { stepKey: "audio", label: "Generate audio", statuses: ["generating_audio"] },
  ];

export function BriefingProgressPanel({ status, pipeline_progress, sources, compact }: Props) {
  const pct = pipeline_progress?.percent ?? fallbackPercent(status);
  const message =
    pipeline_progress?.message?.trim() ||
    PHASE_LABELS[status] ||
    "Working…";

  const activeStepIdx =
    status === "pending" || status === "extracting"
      ? 0
      : status === "summarizing"
        ? 1
        : status === "generating_audio"
          ? 2
          : -1;

  return (
    <div
      className={cn(
        "rounded-3xl border-2 border-primary/15 bg-gradient-to-b from-card to-primary/5",
        compact ? "space-y-3 px-3 py-3" : "space-y-5 px-5 py-5 sm:px-6"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "font-semibold tracking-tight text-foreground",
              compact ? "text-sm" : "text-lg sm:text-base"
            )}
          >
            {message}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            We only use the sources you added — transparent, step by step.
          </p>
        </div>
        <div
          className={cn(
            "flex shrink-0 flex-col items-end tabular-nums",
            compact ? "text-2xl" : "text-3xl sm:text-2xl"
          )}
        >
          <span className="font-bold leading-none text-primary">{pct}</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            % done
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <Progress
          value={pct}
          className={cn("h-2.5 rounded-full", compact && "h-2")}
        />
      </div>

      <div className={cn("space-y-2", compact && "space-y-1.5")}>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Steps
        </p>
        <ol className="flex flex-col gap-2">
          {MINI_STEPS.map((step, i) => {
            const stepDone =
              status === "completed" ||
              (activeStepIdx >= 0 && i < activeStepIdx) ||
              (status === "failed" && activeStepIdx >= 0 && i < activeStepIdx);
            const active = activeStepIdx === i && status !== "completed" && status !== "failed";

            return (
              <li key={step.stepKey} className="flex items-start gap-2">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
                  {stepDone ? (
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3" strokeWidth={3} aria-hidden />
                    </span>
                  ) : active ? (
                    <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
                  ) : (
                    <Circle className="size-4 text-muted-foreground/40" aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "text-sm font-medium",
                      active ? "text-foreground" : stepDone ? "text-foreground/90" : "text-muted-foreground"
                    )}
                  >
                    {i + 1}. {step.label}
                  </span>
                  {active && i === 0 && sources.length > 0 && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Source {Math.min((pipeline_progress?.source_index ?? 0) + 1, sources.length)} of{" "}
                      {sources.length}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {sources.length > 0 && (
        <div
          className={cn(
            "rounded-2xl border border-primary/10 bg-background/80",
            compact ? "p-2.5" : "p-4"
          )}
        >
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Your sources
          </p>
          <ul className="space-y-2">
            {sources.map((src, idx) => {
              const host = sourceHost(src);
              const line = sourceDisplayLine(src);
              const isUrl = src.type === "url";
              const si = pipeline_progress?.source_index ?? 0;
              const inExtract = status === "extracting" || status === "pending";
              const pastExtract =
                status === "summarizing" ||
                status === "generating_audio" ||
                status === "completed";
              const doneSource = pastExtract || idx < si;
              const activeSource = inExtract && idx === si;

              return (
                <li
                  key={src.id ?? idx}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-2.5 py-2 transition-colors",
                    activeSource
                      ? "border-primary/40 bg-primary/5"
                      : doneSource && inExtract && idx < si
                        ? "border-green-500/20 bg-green-500/5"
                        : "border-transparent bg-muted/30"
                  )}
                >
                  {isUrl && host ? (
                    <SourceFavicon host={host} />
                  ) : (
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <FileText className="size-4 text-primary" aria-hidden />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{line}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {isUrl ? "Article URL" : "Text you pasted"}
                      {activeSource && " · scanning now"}
                      {doneSource && inExtract && idx < si && " · done"}
                      {!doneSource && inExtract && idx > si && " · waiting"}
                      {pastExtract && " · included"}
                    </p>
                  </div>
                  {activeSource && (
                    <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
                  )}
                  {doneSource && inExtract && idx < si && (
                    <Check className="size-4 shrink-0 text-green-600" aria-hidden />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
