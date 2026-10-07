import { NextResponse } from "next/server";
import { AgreementValidationError, buildAgreement } from "@/lib/agreementBuilder";

export const dynamic = "force-dynamic";

/**
 * Turn a free-text deal description into a structured agreement draft.
 * This only drafts: nothing is stored until the user reviews it and locks it
 * via POST /api/deals.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const description = typeof body?.description === "string" ? body.description : "";
  try {
    const result = await buildAgreement(description);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AgreementValidationError) {
      return NextResponse.json({ error: err.message, issues: err.issues }, { status: 400 });
    }
    console.error("Agreement draft failed:", err);
    return NextResponse.json({ error: "Could not draft an agreement" }, { status: 500 });
  }
}
