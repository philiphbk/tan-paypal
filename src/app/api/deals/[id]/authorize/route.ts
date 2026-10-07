import { NextResponse } from "next/server";
import { getDeal } from "@/lib/store";
import { logEvent, transition } from "@/lib/stateMachine";
import { authorizeOrder } from "@/lib/paypal";

/** Step 2 of the hold: after buyer approval, authorize the order (funds reserved). */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const deal = getDeal(params.id);
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!deal.paypal.orderId) {
    return NextResponse.json({ error: "No PayPal order yet; call /pay first" }, { status: 409 });
  }
  if (deal.state !== "AGREED") {
    return NextResponse.json({ error: `Deal is ${deal.state}, expected AGREED` }, { status: 409 });
  }
  try {
    const auth = await authorizeOrder(deal.paypal.orderId);
    deal.paypal.authorizationId = auth.authorizationId;
    logEvent(deal, "PAYPAL_AUTHORIZED", `${auth.authorizationId} (${auth.status})${auth.expiresAt ? `, expires ${auth.expiresAt}` : ""}`);
    transition(deal, "FUNDS_AUTHORIZED", "Funds held, not captured");
    return NextResponse.json({ deal });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
