import { NextResponse } from "next/server";
import { deleteAllDeals } from "@/lib/store";

/** Delete every deal so a demo can start clean. Needs DEMO_MODE=1. */
export async function POST() {
  if (process.env.DEMO_MODE !== "1") {
    return NextResponse.json({ error: "Disabled. Set DEMO_MODE=1 to enable." }, { status: 403 });
  }
  deleteAllDeals();
  return NextResponse.json({ reset: true });
}
