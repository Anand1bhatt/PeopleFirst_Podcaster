import { NextResponse } from "next/server";
import { listBriefings } from "@/lib/db/briefings";

export async function GET() {
  const briefings = await listBriefings(50);
  return NextResponse.json({ briefings });
}
