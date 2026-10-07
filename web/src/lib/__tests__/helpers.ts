import type { Agreement, Deal, VerificationResult } from "../types";

export const agreement = (over: Partial<Agreement> = {}): Agreement => ({
  version: 1,
  title: "Logo design",
  description: "",
  deliverables: ["Logo"],
  acceptanceCriteria: ["Logo delivered as SVG and PNG files", "A one page usage guide is included"],
  amount: "150.00",
  currency: "GBP",
  ...over,
});

export const verification = (over: Partial<VerificationResult> = {}): VerificationResult => ({
  verdict: "pass",
  confidence: 0.9,
  reasoning: "ok",
  criteria: [
    { criterion: "a", met: true, note: "" },
    { criterion: "b", met: true, note: "" },
  ],
  verifier: "ai",
  ...over,
});

export const deal = (over: Partial<Deal> = {}): Deal => ({
  id: "d1",
  state: "AGREED",
  agreement: agreement(),
  buyerLabel: "Buyer",
  sellerLabel: "Seller",
  paypal: {},
  events: [],
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...over,
});
