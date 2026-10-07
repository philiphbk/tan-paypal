import test from "node:test";
import assert from "node:assert/strict";
import { buyerAgentReleasePolicy, sellerAgentReview } from "../agents";
import { agreement, deal, verification } from "./helpers";

const withEvidence = (v = verification(), over = {}) =>
  deal({ state: "VERIFIED", verification: v, evidence: { text: "x", submittedAt: "2026-10-05T10:00:00.000Z" }, ...over });

test("confident, complete, on-time pass is released", () => {
  assert.equal(buyerAgentReleasePolicy(withEvidence()).ok, true);
});

test("no verification result -> no release", () => {
  assert.equal(buyerAgentReleasePolicy(deal()).ok, false);
});

test("needs_human and fail verdicts are never released", () => {
  for (const verdict of ["needs_human", "fail"] as const) {
    assert.equal(buyerAgentReleasePolicy(withEvidence(verification({ verdict }))).ok, false);
  }
});

test("low confidence is not released", () => {
  const r = buyerAgentReleasePolicy(withEvidence(verification({ confidence: 0.69 })));
  assert.equal(r.ok, false);
  assert.match(r.reasons.join(), /confidence/);
});

test("a pass with an unmet criterion is not released", () => {
  const v = verification({ criteria: [{ criterion: "a", met: true, note: "" }, { criterion: "b", met: false, note: "" }] });
  assert.equal(buyerAgentReleasePolicy(withEvidence(v)).ok, false);
});

test("a pass with zero criteria is not released", () => {
  assert.equal(buyerAgentReleasePolicy(withEvidence(verification({ criteria: [] }))).ok, false);
});

test("injection-flagged evidence is not released even with a pass", () => {
  assert.equal(buyerAgentReleasePolicy(withEvidence(verification({ injectionSuspected: true }))).ok, false);
});

test("late evidence is not released", () => {
  const d = withEvidence(verification(), { agreement: agreement({ deadline: "2026-10-04" }) });
  const r = buyerAgentReleasePolicy(d);
  assert.equal(r.ok, false);
  assert.match(r.reasons.join(), /deadline/);
});

test("amount above the buyer agent mandate goes to a human", () => {
  const d = withEvidence(verification(), { agreement: agreement({ amount: "501.00" }) });
  assert.equal(buyerAgentReleasePolicy(d).ok, false);
});

test("seller agent accepts a specific, priced, verifiable proposal", () => {
  assert.equal(sellerAgentReview(agreement(), new Date("2026-10-01")).ok, true);
});

test("seller agent declines unpriced, vague, empty and late proposals", () => {
  const now = new Date("2026-10-10");
  assert.equal(sellerAgentReview(agreement({ amount: "0.00" }), now).ok, false);
  assert.equal(sellerAgentReview(agreement({ acceptanceCriteria: ["SVG"] }), now).ok, false);
  assert.equal(sellerAgentReview(agreement({ deliverables: [] }), now).ok, false);
  assert.equal(sellerAgentReview(agreement({ deadline: "2026-10-01" }), now).ok, false);
});
