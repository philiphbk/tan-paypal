import { NextResponse } from "next/server";
import { getDeal } from "@/lib/store";
import { payoutSeller, syncPayout } from "@/lib/payout";

/** Retry the seller payout (or refresh its status) for a captured deal. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const deal = getDeal(params.id);
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (deal.state !== "CAPTURED") {
    return NextResponse.json({ error: `Deal is ${deal.state}, expected CAPTURED` }, { status: 409 });
  }
  await payoutSeller(deal);
  return NextResponse.json({ deal });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const deal = getDeal(params.id);
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    await syncPayout(deal);
  } catch (err) {
    return NextResponse.json({ deal, error: (err as Error).message }, { status: 502 });
  }
  return NextResponse.json({ deal });
}
