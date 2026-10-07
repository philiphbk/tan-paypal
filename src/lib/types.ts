export type DealState =
  | "DRAFT"
  | "AGREED"
  | "FUNDS_AUTHORIZED"
  | "EVIDENCE_SUBMITTED"
  | "VERIFIED"
  | "CAPTURED"
  | "DISPUTED"
  | "EXPIRED"
  | "REFUNDED";

export interface Agreement {
  version: number;
  title: string;
  description: string;
  deliverables: string[];
  acceptanceCriteria: string[];
  deadline?: string; // ISO date
  amount: string; // decimal string, e.g. "25.00"
  currency: string; // ISO 4217
}

export type Verdict = "pass" | "fail" | "needs_human";

export interface VerificationResult {
  verdict: Verdict;
  confidence: number; // 0..1
  reasoning: string;
  criteria: { criterion: string; met: boolean; note: string }[];
  verifier: "ai" | "offline-fallback";
}

export interface DealEvent {
  at: string;
  type: string;
  detail?: string;
}

export interface Deal {
  id: string;
  state: DealState;
  agreement: Agreement;
  buyerLabel: string;
  sellerLabel: string;
  paypal: {
    orderId?: string;
    approveUrl?: string;
    authorizationId?: string;
    captureId?: string;
  };
  evidence?: { text: string; submittedAt: string };
  verification?: VerificationResult;
  humanDecision?: { decision: "release" | "dispute"; note?: string; at: string };
  events: DealEvent[];
  createdAt: string;
  updatedAt: string;
}
