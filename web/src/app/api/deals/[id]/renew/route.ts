import { NextResponse } from "next/server";
import { dealRoute } from "@/lib/dealRoute";
import { logEvent, transition } from "@/lib/stateMachine";
import { sweepExpiry } from "@/lib/expiry";

/**
 * Re-fund an EXPIRED deal (EXPIRED -> AGREED). The locked agreement is kept;
 * the old PayPal references are cleared and the next /pay call creates a fresh
 * order under a new idempotency key.
 */
export const POST = dealRoute(async (deal, _req) => {
    sweepExpiry(deal);
    if (deal.state !== "EXPIRED") {
      return NextResponse.json({ error: `Deal is ${deal.state}, expected EXPIRED` }, { status: 409 });
    }
    const attempt = (deal.paypal.fundingAttempt ?? 1) + 1;
    logEvent(deal, "HOLD_RENEWAL_STARTED", `Funding attempt ${attempt}; previous authorization ${deal.paypal.authorizationId}`, "human_buyer");
    deal.paypal = { fundingAttempt: attempt };
    deal.evidence = undefined;
    deal.verification = undefined;
    transition(deal, "AGREED", "Agreement stands; buyer must approve a new hold", "human_buyer");
    return NextResponse.json({ deal });
});
