import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Tells the UI whether demo tools (seed/reset/time shift) are switched on. */
export async function GET() {
  return NextResponse.json({ enabled: process.env.DEMO_MODE === "1" });
}
