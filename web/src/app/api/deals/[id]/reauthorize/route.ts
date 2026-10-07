import { NextResponse } from "next/server";
import { dealRoute } from "@/lib/dealRoute";
import { honorPeriodLapsed, reauthorize, sweepExpiry } from "@/lib/expiry";

/**
 * Reauthorize a hold whose 3-day honor period has lapsed but whose 29-day valid
 * period has not. Capture paths do this automatically; this endpoint lets a
 * person or agent do it ahead of time.
 */
export const POST = dealRoute(async (deal, _req) => {
    if (sweepExpiry(deal)) {
      return NextResponse.json({ deal, error: "Hold expired; use /renew to fund again" }, { status: 409 });
    }
    if (!deal.paypal.authorizationId || !["FUNDS_AUTHORIZED", "EVIDENCE_SUBMITTED", "VERIFIED", "DISPUTED"].includes(deal.state)) {
      return NextResponse.json({ error: `Deal is ${deal.state}; there is no live hold` }, { status: 409 });
    }
    if (!honorPeriodLapsed(deal)) {
      return NextResponse.json({ error: "Still inside the 3-day honor period; PayPal only allows reauthorization after it" }, { status: 409 });
    }
    try {
      await reauthorize(deal, "human_buyer");
      return NextResponse.json({ deal });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 502 });
    }
});
