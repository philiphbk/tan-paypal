import test from "node:test";
import assert from "node:assert/strict";
import { AgreementValidationError, buildAgreement, validateAgreementDraft } from "../agreementBuilder";

delete process.env.ANTHROPIC_API_KEY; // offline drafter
const NOW = new Date("2026-10-07T12:00:00Z");

const ok = {
  title: "Logo", deliverables: ["Logo"], acceptanceCriteria: ["Logo delivered as SVG"], amount: "150", currency: "gbp",
};

test("valid drafts are normalised", () => {
  const a = validateAgreementDraft({ ...ok, deadline: "2026-11-01" }, NOW);
  assert.equal(a.amount, "150.00");
  assert.equal(a.currency, "GBP");
  assert.equal(a.deadline, "2026-11-01");
});

test("invalid drafts list every problem", () => {
  try {
    validateAgreementDraft({ title: "", amount: -5, currency: "XXX", deadline: "2020-01-01" }, NOW);
    assert.fail("should throw");
  } catch (e) {
    assert.ok(e instanceof AgreementValidationError);
    assert.ok(e.issues.length >= 4, e.issues.join("; "));
  }
});

test("amount cap and bad dates are rejected", () => {
  assert.throws(() => validateAgreementDraft({ ...ok, amount: "10001" }, NOW), AgreementValidationError);
  assert.throws(() => validateAgreementDraft({ ...ok, deadline: "not a date" }, NOW), AgreementValidationError);
});

test("list fields are clamped, not trusted", () => {
  const a = validateAgreementDraft({ ...ok, deliverables: Array(50).fill("x"), acceptanceCriteria: ["y".repeat(900)] }, NOW);
  assert.equal(a.deliverables.length, 10);
  assert.equal(a.acceptanceCriteria[0].length, 300);
});

test("offline drafter extracts price, currency and deadline", async () => {
  const r = await buildAgreement("I will design a logo for £150, delivered as SVG and PNG files. Payment on delivery, within 7 days.", NOW);
  assert.equal(r.source, "offline-fallback");
  assert.equal(r.agreement.amount, "150.00");
  assert.equal(r.agreement.currency, "GBP");
  assert.equal(r.agreement.deadline, "2026-10-14");
});

test("missing price is a warning, not a crash", async () => {
  const r = await buildAgreement("Please translate my product manual into German by 2026-11-01.", NOW);
  assert.ok(r.warnings.some((w) => /amount/.test(w)));
});

test("too-short input is rejected", async () => {
  await assert.rejects(buildAgreement("logo"), AgreementValidationError);
});
