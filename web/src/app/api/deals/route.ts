import { NextResponse } from "next/server";
import { createDeal, issueAccess, saveDeal } from "@/lib/store";
import { readJson } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { visibleDeals } from "@/lib/visibility";
import { isEmail } from "@/lib/payout";
import { AgreementValidationError, validateAgreementDraft } from "@/lib/agreementBuilder";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return NextResponse.json({ deals: await visibleDeals(req) });
}

/**
 * Propose a deal. The buyer (a person or the buyer agent) proposes the
 * agreement; it stays DRAFT until the seller or seller agent accepts it via
 * POST /api/deals/[id]/accept.
 */
export async function POST(req: Request) {
  const limited = rateLimit(req, "create");
  if (limited) return limited;
  const body = await readJson(req);
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
  const sellerEmail = body?.sellerEmail;
  if (sellerEmail && !isEmail(sellerEmail)) {
    return NextResponse.json({ error: "sellerEmail is not a valid email" }, { status: 400 });
  }
  const deal = createDeal(draft, "Buyer", "Seller", proposer);
  if (sellerEmail) {
    deal.sellerEmail = sellerEmail as string;
    saveDeal(deal);
  }
  // The raw tokens are shown exactly once. Only their hashes are stored.
  const keys = issueAccess(deal.id);
  return NextResponse.json({ deal, keys }, { status: 201 });
}
