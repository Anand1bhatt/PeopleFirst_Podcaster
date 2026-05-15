import { NextRequest, NextResponse } from "next/server";
import { getAudio } from "@/lib/db/memory-audio";
import { devAudioRead } from "@/lib/db/dev-briefing-store";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let buffer = getAudio(id);
  if (!buffer) {
    buffer = (await devAudioRead(id)) ?? undefined;
  }
  if (!buffer) {
    return NextResponse.json({ error: "Audio not found" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(buffer.length),
    },
  });
}
