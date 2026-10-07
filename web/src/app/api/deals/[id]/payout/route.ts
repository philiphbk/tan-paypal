import { NextResponse } from "next/server";
import { dealRoute } from "@/lib/dealRoute";
import { withDeal } from "@/lib/store";
import { payoutSeller, syncPayout } from "@/lib/payout";

/** Retry the seller payout for a captured deal (no-op if one is already paid or in flight). */
export const POST = dealRoute(async (deal) => {
  if (deal.state !== "CAPTURED") {
    return NextResponse.json({ error: `Deal is ${deal.state}, expected CAPTURED` }, { status: 409 });
  }
  await payoutSeller(deal);
  return NextResponse.json({ deal });
});

/** Refresh the payout status from PayPal. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const res = await withDeal(params.id, async (deal) => {
    try {
      await syncPayout(deal);
      return NextResponse.json({ deal });
    } catch (err) {
      return NextResponse.json({ deal, error: (err as Error).message }, { status: 502 });
    }
  });
  return res ?? NextResponse.json({ error: "not found" }, { status: 404 });
}
