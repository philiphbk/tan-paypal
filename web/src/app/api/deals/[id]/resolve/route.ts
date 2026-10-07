import { NextResponse } from "next/server";
import { getDeal } from "@/lib/store";
import { logEvent, transition } from "@/lib/stateMachine";
import { captureAuthorization, voidAuthorization } from "@/lib/paypal";

/** Human override for a disputed deal: release (capture) or refund (void the hold). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const deal = getDeal(params.id);
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (deal.state !== "DISPUTED") {
    return NextResponse.json({ error: `Deal is ${deal.state}, expected DISPUTED` }, { status: 409 });
  }
  const body = await req.json().catch(() => null);
  const decision = body?.decision;
  if (decision !== "release" && decision !== "dispute") {
    return NextResponse.json({ error: 'decision must be "release" or "dispute"' }, { status: 400 });
  }
  deal.humanDecision = { decision, note: body?.note ? String(body.note) : undefined, at: new Date().toISOString() };
  try {
    if (decision === "release") {
      const cap = await captureAuthorization(deal.paypal.authorizationId as string, deal.id);
      deal.paypal.captureId = cap.captureId;
      logEvent(deal, "PAYPAL_CAPTURED", `${cap.captureId} (human override)`);
      transition(deal, "CAPTURED", "Human released payment");
    } else {
      await voidAuthorization(deal.paypal.authorizationId as string, deal.id);
      logEvent(deal, "PAYPAL_VOIDED", "human decision");
      transition(deal, "REFUNDED", "Hold voided; buyer keeps funds");
    }
    return NextResponse.json({ deal });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
