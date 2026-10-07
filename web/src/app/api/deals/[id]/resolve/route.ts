import { NextResponse } from "next/server";
import { payoutSeller } from "@/lib/payout";
import { dealRoute } from "@/lib/dealRoute";
import { logEvent, transition } from "@/lib/stateMachine";
import { captureAuthorization, voidAuthorization } from "@/lib/paypal";
import { ensureCapturable, HoldExpiredError, sweepExpiry } from "@/lib/expiry";

/** Human override for a disputed deal: release (capture) or refund (void the hold). */
export const POST = dealRoute(async (deal, req) => {
    if (deal.state !== "DISPUTED") {
      return NextResponse.json({ error: `Deal is ${deal.state}, expected DISPUTED` }, { status: 409 });
    }
    if (sweepExpiry(deal)) {
      return NextResponse.json({ deal, error: new HoldExpiredError().message }, { status: 409 });
    }
    const body = await req.json().catch(() => null);
    const decision = body?.decision;
    if (decision !== "release" && decision !== "refund" && decision !== "dispute") {
      return NextResponse.json({ error: 'decision must be "release" or "refund"' }, { status: 400 });
    }
    deal.humanDecision = { decision: decision === "release" ? "release" : "dispute", note: body?.note ? String(body.note) : undefined, at: new Date().toISOString() };
    try {
      if (decision === "release") {
        await ensureCapturable(deal);
        const cap = await captureAuthorization(deal.paypal.authorizationId as string, deal.id);
        deal.paypal.captureId = cap.captureId;
        logEvent(deal, "PAYPAL_CAPTURED", `${cap.captureId} (human override)`, "paypal");
        transition(deal, "CAPTURED", "Human released payment", "human_reviewer");
        await payoutSeller(deal);
      } else {
        await voidAuthorization(deal.paypal.authorizationId as string, deal.id);
        logEvent(deal, "PAYPAL_VOIDED", "human decision", "paypal");
        transition(deal, "REFUNDED", "Hold voided; buyer keeps funds", "human_reviewer");
      }
      return NextResponse.json({ deal });
    } catch (err) {
      if (err instanceof HoldExpiredError) {
        return NextResponse.json({ deal, error: err.message }, { status: 409 });
      }
      return NextResponse.json({ error: (err as Error).message }, { status: 502 });
    }
});
