import { NextResponse } from "next/server";
import { getDeal } from "@/lib/store";
import { logEvent } from "@/lib/stateMachine";
import { createAuthorizeOrder } from "@/lib/paypal";

/** Step 1 of the hold: create the AUTHORIZE order and return the buyer approval URL. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const deal = getDeal(params.id);
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (deal.state !== "AGREED") {
    return NextResponse.json({ error: `Deal is ${deal.state}, expected AGREED` }, { status: 409 });
  }
  try {
    const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
    const { orderId, approveUrl } = await createAuthorizeOrder({
      dealId: deal.id,
      amount: deal.agreement.amount,
      currency: deal.agreement.currency,
      description: deal.agreement.title,
      returnUrl: `${base}/?deal=${deal.id}&approved=1`,
      cancelUrl: `${base}/?deal=${deal.id}&cancelled=1`,
    });
    deal.paypal.orderId = orderId;
    deal.paypal.approveUrl = approveUrl;
    logEvent(deal, "PAYPAL_ORDER_CREATED", orderId);
    return NextResponse.json({ deal, approveUrl });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
