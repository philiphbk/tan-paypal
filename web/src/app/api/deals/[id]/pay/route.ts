import { NextResponse } from "next/server";
import { dealRoute } from "@/lib/dealRoute";
import { logEvent } from "@/lib/stateMachine";
import { createAuthorizeOrder } from "@/lib/paypal";

/** Step 1 of the hold: create the AUTHORIZE order and return the buyer approval URL. */
export const POST = dealRoute(["buyer"], async (deal, _req) => {
    if (deal.state !== "AGREED") {
      return NextResponse.json({ error: `Deal is ${deal.state}, expected AGREED` }, { status: 409 });
    }
    try {
      const base = process.env.APP_BASE_URL ?? process.env.RENDER_EXTERNAL_URL ?? "http://localhost:3000";
      const { orderId, approveUrl } = await createAuthorizeOrder({
        dealId: deal.id,
        attempt: deal.paypal.fundingAttempt ?? 1,
        amount: deal.agreement.amount,
        currency: deal.agreement.currency,
        description: deal.agreement.title,
        returnUrl: `${base}/deals/${deal.id}/buyer?approved=1`,
        cancelUrl: `${base}/deals/${deal.id}/buyer?cancelled=1`,
      });
      deal.paypal.orderId = orderId;
      deal.paypal.approveUrl = approveUrl;
      logEvent(deal, "PAYPAL_ORDER_CREATED", orderId, "paypal");
      return NextResponse.json({ deal, approveUrl });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 502 });
    }
});
