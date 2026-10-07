import { NextResponse } from "next/server";
import { seedDemoData } from "@/lib/seed";
import { rateLimit } from "@/lib/rateLimit";

/**
 * Replace the public sample deals (needs DEMO_MODE=1). Returns the sample deals'
 * access tokens so the caller can act on them; anyone can read them.
 */
export async function POST(req: Request) {
  if (process.env.DEMO_MODE !== "1") {
    return NextResponse.json({ error: "Disabled. Set DEMO_MODE=1 to enable." }, { status: 403 });
  }
  const limited = rateLimit(req, "create");
  if (limited) return limited;
  const keys = seedDemoData();
  return NextResponse.json({ seeded: Object.keys(keys).length, keys });
}
