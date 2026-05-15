import { NextRequest, NextResponse } from "next/server";
import { getBriefing } from "@/lib/db/briefings";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const briefing = await getBriefing(id);
  if (!briefing) {
    return NextResponse.json({ error: "Briefing not found" }, { status: 404 });
  }
  return NextResponse.json(briefing, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });
}
