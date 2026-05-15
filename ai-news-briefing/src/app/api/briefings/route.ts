import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createBriefing } from "@/lib/db/briefings";
import { briefingQueue, isQueueAvailable } from "@/lib/queue/client";
import { runPipeline } from "@/lib/pipeline/run";
import type { Source, TtsProvider } from "@/types";
import { parseOutputLanguage } from "@/types";

export async function POST(request: NextRequest) {
  let body: {
    sources: Array<{
      type: "url" | "text";
      value: string;
      title?: string;
      briefing_section?: string;
    }>;
    ttsProvider?: string;
    outputLanguage?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const sources = body?.sources;
  if (!Array.isArray(sources) || sources.length === 0) {
    return NextResponse.json(
      { error: "sources array with at least one item (type, value) is required" },
      { status: 400 }
    );
  }
  const normalized: Omit<Source, "id">[] = sources
    .map((s) => ({
      type: (s.type === "url" ? "url" : "text") as "url" | "text",
      value: String(s.value).trim(),
      title: s.title ? String(s.title).trim() : undefined,
      briefing_section: s.briefing_section?.trim() || undefined,
    }))
    .filter((s) => s.value.length > 0);
  if (normalized.length === 0) {
    return NextResponse.json({ error: "No valid sources" }, { status: 400 });
  }

  const ttsProvider: TtsProvider =
    body.ttsProvider === "microsoft" ? "microsoft" : "elevenlabs";
  const outputLanguage = parseOutputLanguage(body.outputLanguage);

  const briefingId = await createBriefing(normalized, ttsProvider, outputLanguage);
  if (!briefingId) {
    return NextResponse.json({ error: "Failed to create briefing" }, { status: 500 });
  }

  if (isQueueAvailable() && briefingQueue) {
    await briefingQueue.add("process", { briefingId });
    return NextResponse.json({ briefingId, queued: true });
  }
  // Run after response so the handler isn’t torn down mid-pipeline (fixes stuck “Writing your briefing…”)
  after(() => {
    runPipeline(briefingId).catch((err) => {
      console.error("[briefing pipeline]", briefingId, err);
    });
  });
  return NextResponse.json({ briefingId, queued: false });
}
