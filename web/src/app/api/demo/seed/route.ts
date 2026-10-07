import { NextResponse } from "next/server";
import { seedDemoData } from "@/lib/seed";

/** Replace all deals with labelled sample deals covering every state. Needs DEMO_MODE=1. */
export async function POST() {
  if (process.env.DEMO_MODE !== "1") {
    return NextResponse.json({ error: "Disabled. Set DEMO_MODE=1 to enable." }, { status: 403 });
  }
  return NextResponse.json({ seeded: seedDemoData() });
}
