import { NextRequest, NextResponse } from "next/server";
import { getBriefingApiOrigin } from "@/lib/briefing-api-base";

export async function GET(request: NextRequest) {
  const lang = request.nextUrl.searchParams.get("lang") === "hi" ? "hi" : "en";
  const limit = Math.min(60, Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 30));
  const base = getBriefingApiOrigin(request);

  try {
    const url = `${base}/api/figma-daily-digest?list=1&lang=${lang}&limit=${limit}`;
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: (data as { error?: string }).error ?? "History error", items: [] },
        { status: res.status }
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unreachable", items: [] },
      { status: 502 }
    );
  }
}
