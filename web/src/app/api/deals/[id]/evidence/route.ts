import { NextResponse } from "next/server";
import { getDeal } from "@/lib/store";
import { logEvent, transition } from "@/lib/stateMachine";
import { verifyEvidence } from "@/lib/verifier";
import { captureAuthorization } from "@/lib/paypal";

/**
 * Seller submits proof of delivery. The AI verifier checks it against the
 * agreement. A confident pass captures the payment; anything else is routed
 * to a human via DISPUTED (the AI recommends, people decide).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const deal = getDeal(params.id);
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (deal.state !== "FUNDS_AUTHORIZED") {
    return NextResponse.json({ error: `Deal is ${deal.state}, expected FUNDS_AUTHORIZED` }, { status: 409 });
  }
  const body = await req.json().catch(() => null);
  const text = String(body?.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "evidence text is required" }, { status: 400 });

  deal.evidence = { text, submittedAt: new Date().toISOString() };
  transition(deal, "EVIDENCE_SUBMITTED");

  const result = await verifyEvidence(deal.agreement, text);
  deal.verification = result;
  logEvent(deal, "AI_VERDICT", `${result.verdict} (${result.confidence}) via ${result.verifier}`);

  if (result.verdict === "pass" && result.confidence >= 0.7) {
    transition(deal, "VERIFIED", "AI verified evidence against agreement");
    try {
      const cap = await captureAuthorization(deal.paypal.authorizationId as string, deal.id);
      deal.paypal.captureId = cap.captureId;
      logEvent(deal, "PAYPAL_CAPTURED", `${cap.captureId} (${cap.status})`);
      transition(deal, "CAPTURED", "Payment released to seller");
    } catch (err) {
      logEvent(deal, "CAPTURE_FAILED", (err as Error).message);
      return NextResponse.json({ deal, error: (err as Error).message }, { status: 502 });
    }
  } else {
    transition(deal, "DISPUTED", `AI verdict ${result.verdict}: needs human review`);
  }
  return NextResponse.json({ deal });
}
