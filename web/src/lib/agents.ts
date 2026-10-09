import type { Agreement, Deal } from "./types";
import { maxAutoReleaseAmount } from "./config";

/**
 * Agent mandates. Each agent has a narrow job and the code that grants it
 * authority lives here, in one place, so it is easy to audit:
 *
 *  - buyer agent    proposes the agreement and requests release of funds, but only
 *                   when `buyerAgentReleasePolicy` approves.
 *  - seller agent   reviews a proposal and accepts or declines it; submits evidence.
 *  - verifier agent checks evidence (see verifier.ts). It recommends; it never
 *                   moves money.
 *  - humans         can always overrule: release or refund a DISPUTED deal.
 */

export const RELEASE_CONFIDENCE = 0.7;

/** Largest amount the buyer agent may release without a human. */
export { maxAutoReleaseAmount };

export interface AgentDecision {
  ok: boolean;
  reasons: string[];
}

/** The seller agent accepts only agreements it could actually be held to. */
export function sellerAgentReview(agreement: Agreement, now = new Date()): AgentDecision {
  const reasons: string[] = [];
  if (Number(agreement.amount) <= 0) reasons.push("amount must be greater than zero");
  if (agreement.deliverables.length === 0) reasons.push("no deliverables are listed");
  if (agreement.acceptanceCriteria.length === 0) reasons.push("no acceptance criteria are listed");
  const vague = agreement.acceptanceCriteria.filter((c) => c.trim().split(/\s+/).length < 3);
  if (vague.length) reasons.push(`criteria too vague to verify: "${vague[0]}"`);
  if (agreement.deadline && endOfDay(agreement.deadline) < now.getTime()) {
    reasons.push("deadline has already passed");
  }
  return { ok: reasons.length === 0, reasons };
}

/**
 * The single gate between an AI verdict and moving money. Anything short of a
 * confident, complete, on-time pass inside the buyer agent's spending mandate
 * goes to a human instead.
 */
export function buyerAgentReleasePolicy(deal: Deal): AgentDecision {
  const v = deal.verification;
  const reasons: string[] = [];
  if (!v) return { ok: false, reasons: ["no verification result"] };
  if (v.verdict !== "pass") reasons.push(`verifier verdict is ${v.verdict}`);
  if (v.confidence < RELEASE_CONFIDENCE) {
    reasons.push(`confidence ${v.confidence} is below ${RELEASE_CONFIDENCE}`);
  }
  if (v.criteria.length === 0 || !v.criteria.every((c) => c.met)) {
    reasons.push("not every acceptance criterion is met");
  }
  if (v.injectionSuspected) reasons.push("evidence tried to instruct the verifier");
  const { deadline } = deal.agreement;
  if (deadline && deal.evidence && new Date(deal.evidence.submittedAt).getTime() > endOfDay(deadline)) {
    reasons.push(`evidence was submitted after the ${deadline} deadline`);
  }
  const cap = maxAutoReleaseAmount();
  if (Number(deal.agreement.amount) > cap) {
    reasons.push(`amount exceeds the buyer agent's ${cap} auto-release mandate`);
  }
  return { ok: reasons.length === 0, reasons };
}

function endOfDay(isoDate: string): number {
  return new Date(`${isoDate}T23:59:59.999Z`).getTime();
}
