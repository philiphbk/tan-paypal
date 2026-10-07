import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sweepAll } from "@/lib/sweeper";

export const dynamic = "force-dynamic";

const digest = (v: string) => createHash("sha256").update(v).digest();

/** Trigger the expiry sweep from an external scheduler. Needs CRON_SECRET; disabled without it. */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Disabled. Set CRON_SECRET to enable." }, { status: 403 });
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!timingSafeEqual(digest(secret), digest(given))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ expired: await sweepAll() });
}

export const GET = handle;
export const POST = handle;
