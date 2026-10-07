import { NextResponse } from "next/server";
import { visibleDeals } from "@/lib/visibility";

export const dynamic = "force-dynamic";

/** Flat rows for the AG Grid ledger: one per deal, per criterion check, and per audit event. */
export async function GET(req: Request) {
  const deals = await visibleDeals(req);
  const transactions = deals.map((d) => ({
    id: d.id,
    title: d.agreement.title,
    state: d.state,
    amount: Number(d.agreement.amount),
    currency: d.agreement.currency,
    verdict: d.verification?.verdict ?? null,
    confidence: d.verification?.confidence ?? null,
    decidedBy: d.humanDecision ? "Human" : d.state === "CAPTURED" ? "AI + policy" : null,
    authorizationId: d.paypal.authorizationId ?? null,
    captureId: d.paypal.captureId ?? null,
    payoutStatus: d.payout?.batchStatus ?? null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }));
  const evidence = deals.flatMap((d) =>
    (d.verification?.criteria ?? []).map((c) => ({
      dealId: d.id,
      title: d.agreement.title,
      criterion: c.criterion,
      met: c.met,
      note: c.note,
      verdict: d.verification!.verdict,
      confidence: d.verification!.confidence,
      verifier: d.verification!.verifier,
      injectionSuspected: !!d.verification!.injectionSuspected,
      submittedAt: d.evidence?.submittedAt ?? null,
    })),
  );
  const events = deals.flatMap((d) =>
    d.events.map((e) => ({ dealId: d.id, title: d.agreement.title, at: e.at, type: e.type, actor: e.actor ?? "system", detail: e.detail ?? "" })),
  );
  events.sort((a, b) => b.at.localeCompare(a.at));
  return NextResponse.json({ transactions, evidence, events });
}
