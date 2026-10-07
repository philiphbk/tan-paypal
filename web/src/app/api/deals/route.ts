import { NextResponse } from "next/server";
import { createDeal, listDeals } from "@/lib/store";
import { transition } from "@/lib/stateMachine";
import { AgreementValidationError, validateAgreementDraft } from "@/lib/agreementBuilder";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ deals: listDeals() });
}

/** Create a deal and lock the agreement (DRAFT -> AGREED). */
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
  const deal = createDeal(draft);
  transition(deal, "AGREED", "Agreement locked at v1");
  return NextResponse.json({ deal }, { status: 201 });
}
