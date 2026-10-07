import { NextResponse } from "next/server";
import { createDeal, listDeals, saveDeal, withDeal } from "@/lib/store";
import { isEmail } from "@/lib/payout";
import { sweepExpiry } from "@/lib/expiry";
import { AgreementValidationError, validateAgreementDraft } from "@/lib/agreementBuilder";

export const dynamic = "force-dynamic";

export async function GET() {
  // Expire lapsed holds under each deal's lock, then return the fresh list.
  const now = new Date();
  for (const d of listDeals()) {
    const copy = structuredClone(d);
    if (sweepExpiry(copy, now)) await withDeal(d.id, async (live) => sweepExpiry(live, now));
  }
  return NextResponse.json({ deals: listDeals() });
}

/**
 * Propose a deal. The buyer (a person or the buyer agent) proposes the
 * agreement; it stays DRAFT until the seller or seller agent accepts it via
 * POST /api/deals/[id]/accept.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  let draft;
  try {
    draft = validateAgreementDraft(body);
  } catch (err) {
    if (err instanceof AgreementValidationError) {
      return NextResponse.json({ error: err.message, issues: err.issues }, { status: 400 });
    }
    throw err;
  }
  const proposer = body?.proposer === "buyer_agent" ? "buyer_agent" : "human_buyer";
  if (body?.sellerEmail && !isEmail(body.sellerEmail)) {
    return NextResponse.json({ error: "sellerEmail is not a valid email" }, { status: 400 });
  }
  const deal = createDeal(draft, "Buyer", "Seller", proposer);
  if (body?.sellerEmail) {
    deal.sellerEmail = body.sellerEmail;
    saveDeal(deal);
  }
  return NextResponse.json({ deal }, { status: 201 });
}
