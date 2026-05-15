import { NextRequest, NextResponse } from "next/server";
import { getBriefingApiOrigin } from "@/lib/briefing-api-base";

export async function POST(request: NextRequest) {
  let body: { date?: string; lang?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const base = getBriefingApiOrigin(request);
  try {
    const res = await fetch(`${base}/api/figma-daily-digest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: body.date,
        lang: body.lang === "hi" ? "hi" : "en",
      }),
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 502 }
    );
  }
}
