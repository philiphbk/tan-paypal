import { NextResponse } from "next/server";
import { readJson } from "@/lib/http";
import { payoutSeller } from "@/lib/payout";
import { dealRoute } from "@/lib/dealRoute";
import { logEvent, transition } from "@/lib/stateMachine";
import { verifyEvidence } from "@/lib/verifier";
import { captureAuthorization } from "@/lib/paypal";
import { buyerAgentReleasePolicy } from "@/lib/agents";
import { ensureCapturable, HoldExpiredError, sweepExpiry } from "@/lib/expiry";

/**
 * Seller (or seller agent) submits proof of delivery. The verifier agent checks
 * it against the agreement. Only a verifier pass that also satisfies the buyer
 * agent's release policy captures the payment; everything else is routed to a
 * human via DISPUTED (the AI recommends, people decide).
 */
export const POST = dealRoute(["seller"], async (deal, req) => {
    if (deal.state !== "FUNDS_AUTHORIZED") {
      return NextResponse.json({ error: `Deal is ${deal.state}, expected FUNDS_AUTHORIZED` }, { status: 409 });
    }
    if (sweepExpiry(deal)) {
      return NextResponse.json({ deal, error: new HoldExpiredError().message }, { status: 409 });
    }
    const body = await readJson(req);
    const text = String(body?.text ?? "").trim();
    if (!text) return NextResponse.json({ error: "evidence text is required" }, { status: 400 });
    const submitter = body?.actor === "seller_agent" ? "seller_agent" : "human_seller";

    deal.evidence = { text, submittedAt: new Date().toISOString() };
    transition(deal, "EVIDENCE_SUBMITTED", `${text.length} characters of evidence`, submitter);

    const result = await verifyEvidence(deal.agreement, text);
    deal.verification = result;
    logEvent(
      deal,
      "VERIFIER_VERDICT",
      `${result.verdict} (${result.confidence}) via ${result.verifier}${result.injectionSuspected ? "; evidence tried to instruct the verifier" : ""}`,
      "verifier_agent",
    );

    if (result.verdict !== "pass") {
      transition(deal, "DISPUTED", `Verifier verdict ${result.verdict}: needs human review`, "verifier_agent");
      return NextResponse.json({ deal });
    }
    transition(deal, "VERIFIED", "Evidence satisfies the agreement", "verifier_agent");

    const policy = buyerAgentReleasePolicy(deal);
    if (!policy.ok) {
      logEvent(deal, "RELEASE_WITHHELD", policy.reasons.join("; "), "buyer_agent");
      transition(deal, "DISPUTED", "Buyer agent withheld release; human review needed", "buyer_agent");
      return NextResponse.json({ deal });
    }

    logEvent(deal, "RELEASE_REQUESTED", "Policy checks passed", "buyer_agent");
    try {
      await ensureCapturable(deal);
      const cap = await captureAuthorization(deal.paypal.authorizationId as string, deal.id);
      deal.paypal.captureId = cap.captureId;
      logEvent(deal, "PAYPAL_CAPTURED", `${cap.captureId} (${cap.status})`, "paypal");
      transition(deal, "CAPTURED", "Payment released to seller", "buyer_agent");
      await payoutSeller(deal);
    } catch (err) {
      if (err instanceof HoldExpiredError) {
        return NextResponse.json({ deal, error: err.message }, { status: 409 });
      }
      logEvent(deal, "CAPTURE_FAILED", (err as Error).message, "paypal");
      transition(deal, "DISPUTED", "Capture failed; a human can retry the release", "system");
      return NextResponse.json({ deal, error: (err as Error).message }, { status: 502 });
    }
    return NextResponse.json({ deal });
}, "llm");
