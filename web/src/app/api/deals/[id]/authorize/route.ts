import { NextResponse } from "next/server";
import { dealRoute } from "@/lib/dealRoute";
import { logEvent, transition } from "@/lib/stateMachine";
import { authorizeOrder } from "@/lib/paypal";
import { setAuthWindow } from "@/lib/expiry";

/** Step 2 of the hold: after buyer approval, authorize the order (funds reserved). */
export const POST = dealRoute(["buyer"], async (deal, _req) => {
    if (!deal.paypal.orderId) {
      return NextResponse.json({ error: "No PayPal order yet; call /pay first" }, { status: 409 });
    }
    if (deal.state !== "AGREED") {
      return NextResponse.json({ error: `Deal is ${deal.state}, expected AGREED` }, { status: 409 });
    }
    try {
      const auth = await authorizeOrder(deal.paypal.orderId);
      deal.paypal.authorizationId = auth.authorizationId;
      setAuthWindow(deal, auth.expiresAt);
      logEvent(deal, "PAYPAL_AUTHORIZED", `${auth.authorizationId} (${auth.status})${auth.expiresAt ? `, expires ${auth.expiresAt}` : ""}`, "paypal");
      transition(deal, "FUNDS_AUTHORIZED", "Funds held, not captured", "human_buyer");
      return NextResponse.json({ deal });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 502 });
    }
});
