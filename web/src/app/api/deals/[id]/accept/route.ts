import { NextResponse } from "next/server";
import { getDeal } from "@/lib/store";
import { logEvent, transition } from "@/lib/stateMachine";
import { isEmail } from "@/lib/payout";
import { sellerAgentReview } from "@/lib/agents";

/**
 * Seller side of the handshake (DRAFT -> AGREED). The seller agent reviews the
 * proposal and may decline it with reasons; a human seller can accept directly.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const deal = getDeal(params.id);
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (deal.state !== "DRAFT") {
    return NextResponse.json({ error: `Deal is ${deal.state}, expected DRAFT` }, { status: 409 });
  }
  const body = await req.json().catch(() => null);
  if (body?.sellerEmail !== undefined) {
    if (!isEmail(body.sellerEmail)) {
      return NextResponse.json({ error: "sellerEmail is not a valid email" }, { status: 400 });
    }
    deal.sellerEmail = body.sellerEmail;
  }
  const actor = body?.actor === "human_seller" ? "human_seller" : "seller_agent";

  if (actor === "seller_agent") {
    const review = sellerAgentReview(deal.agreement);
    if (!review.ok) {
      logEvent(deal, "AGREEMENT_DECLINED", review.reasons.join("; "), "seller_agent");
      return NextResponse.json(
        { deal, error: `Seller agent declined: ${review.reasons.join("; ")}` },
        { status: 422 },
      );
    }
    logEvent(deal, "AGREEMENT_REVIEWED", "Terms are specific, priced and verifiable", "seller_agent");
  }
  transition(deal, "AGREED", `Agreement locked at v${deal.agreement.version}`, actor);
  return NextResponse.json({ deal });
}
