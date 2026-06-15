import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getBriefing, updateBriefingStatus } from "@/lib/db/briefings";
import { runPipelineFromAudio } from "@/lib/pipeline/run";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const briefing = await getBriefing(id);

  if (!briefing) {
    return NextResponse.json({ error: "Briefing not found" }, { status: 404 });
  }
  if (briefing.status !== "awaiting_approval") {
    return NextResponse.json(
      { error: `Briefing is in status "${briefing.status}", not "awaiting_approval"` },
      { status: 400 }
    );
  }

  await updateBriefingStatus(id, "generating_audio");

  after(() => {
    runPipelineFromAudio(id).catch((err) => {
      console.error("[approve] Pipeline audio error", id, err);
    });
  });

  return NextResponse.json({ briefingId: id, status: "generating_audio" });
}
