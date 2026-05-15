import { NextRequest, NextResponse } from "next/server";
import { absoluteBriefingAudioUrl, getBriefingApiOrigin } from "@/lib/briefing-api-base";
import { getBriefing } from "@/lib/db/briefings";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Missing briefing id" }, { status: 400 });
  }
  try {
    const briefing = await getBriefing(id);
    if (!briefing) {
      return NextResponse.json({ error: "Briefing not found" }, { status: 404 });
    }
    const base = getBriefingApiOrigin(request);
    const audio_url = absoluteBriefingAudioUrl(base, briefing.audio_url);
    return NextResponse.json(
      { ...briefing, audio_url },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load briefing" },
      { status: 502 }
    );
  }
}
