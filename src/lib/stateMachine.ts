import type { Deal, DealState } from "./types";

/**
 * Allowed transitions. Every state change in the app goes through `transition`,
 * so illegal jumps (e.g. capturing before evidence is verified) are impossible.
 */
const TRANSITIONS: Record<DealState, DealState[]> = {
  DRAFT: ["AGREED"],
  AGREED: ["FUNDS_AUTHORIZED", "EXPIRED"],
  FUNDS_AUTHORIZED: ["EVIDENCE_SUBMITTED", "EXPIRED", "REFUNDED"],
  EVIDENCE_SUBMITTED: ["VERIFIED", "DISPUTED"],
  VERIFIED: ["CAPTURED", "DISPUTED"],
  DISPUTED: ["CAPTURED", "REFUNDED"],
  CAPTURED: [],
  EXPIRED: [],
  REFUNDED: [],
};

export class IllegalTransitionError extends Error {
  constructor(from: DealState, to: DealState) {
    super(`Illegal transition ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export function canTransition(from: DealState, to: DealState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function transition(deal: Deal, to: DealState, detail?: string): Deal {
  if (!canTransition(deal.state, to)) {
    throw new IllegalTransitionError(deal.state, to);
  }
  const at = new Date().toISOString();
  deal.events.push({ at, type: `STATE_${to}`, detail });
  deal.state = to;
  deal.updatedAt = at;
  return deal;
}

export function logEvent(deal: Deal, type: string, detail?: string): void {
  const at = new Date().toISOString();
  deal.events.push({ at, type, detail });
  deal.updatedAt = at;
}
