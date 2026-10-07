import { NextResponse } from "next/server";
import { withDeal } from "@/lib/store";
import { sweepExpiry } from "@/lib/expiry";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await withDeal(id, async (deal) => {
    sweepExpiry(deal);
    return NextResponse.json({ deal });
  });
  return res ?? NextResponse.json({ error: "not found" }, { status: 404 });
}
