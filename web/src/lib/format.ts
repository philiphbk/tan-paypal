import type { Actor, DealEvent, DealState } from "./types";

export function money(amount: string | number, currency: string): string {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(Number(amount));
  } catch {
    return `${amount} ${currency}`;
  }
}

export const dateTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—";

export const dateOnly = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { dateStyle: "medium" }) : "—";

export function timeLeft(iso?: string, now = Date.now()): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "lapsed";
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  return d > 0 ? `${d}d ${h}h left` : `${h}h left`;
}

export const ACTOR_LABEL: Record<Actor, string> = {
  buyer_agent: "Buyer agent",
  seller_agent: "Seller agent",
  verifier_agent: "Verifier agent",
  human_buyer: "Buyer",
  human_seller: "Seller",
  human_reviewer: "Human reviewer",
  system: "System",
  paypal: "PayPal",
};

export type Tone = "agent" | "human" | "paypal" | "";
export const actorTone = (a: Actor = "system"): Tone =>
  a.endsWith("_agent") ? "agent" : a.startsWith("human") ? "human" : a === "paypal" ? "paypal" : "";

export const STATE_META: Record<DealState, { label: string; tone: "" | "blue" | "ok" | "warn" | "bad" | "agent" }> = {
  DRAFT: { label: "Awaiting seller", tone: "" },
  AGREED: { label: "Awaiting funds", tone: "blue" },
  FUNDS_AUTHORIZED: { label: "Funds held", tone: "blue" },
  EVIDENCE_SUBMITTED: { label: "Verifying", tone: "agent" },
  VERIFIED: { label: "Verified", tone: "ok" },
  CAPTURED: { label: "Released", tone: "ok" },
  DISPUTED: { label: "Human review", tone: "warn" },
  EXPIRED: { label: "Hold expired", tone: "bad" },
  REFUNDED: { label: "Refunded", tone: "bad" },
};

const EVENT_TITLE: Record<string, string> = {
  AGREEMENT_PROPOSED: "Agreement proposed",
  AGREEMENT_REVIEWED: "Terms reviewed",
  AGREEMENT_DECLINED: "Proposal declined",
  STATE_AGREED: "Agreement locked",
  PAYPAL_ORDER_CREATED: "PayPal order created",
  PAYPAL_AUTHORIZED: "PayPal authorized the hold",
  STATE_FUNDS_AUTHORIZED: "Funds held, not captured",
  STATE_EVIDENCE_SUBMITTED: "Evidence submitted",
  VERIFIER_VERDICT: "Verdict issued",
  STATE_VERIFIED: "Evidence verified",
  RELEASE_REQUESTED: "Release requested",
  RELEASE_WITHHELD: "Release withheld",
  PAYPAL_CAPTURED: "Payment captured",
  STATE_CAPTURED: "Payment released",
  STATE_DISPUTED: "Sent to human review",
  PAYPAL_VOIDED: "Hold voided",
  STATE_REFUNDED: "Buyer refunded",
  STATE_EXPIRED: "Hold expired",
  PAYPAL_REAUTHORIZED: "Hold reauthorized",
  HOLD_RENEWAL_STARTED: "New hold requested",
  PAYOUT_SENT: "Seller payout sent",
  PAYOUT_STATUS: "Payout status updated",
  PAYOUT_FAILED: "Payout failed",
  PAYOUT_SKIPPED: "Payout skipped",
  CAPTURE_FAILED: "Capture failed",
  DEMO_TIME_SHIFT: "Demo: clock moved",
};

export function eventTitle(e: DealEvent): string {
  if (EVENT_TITLE[e.type]) return EVENT_TITLE[e.type];
  if (e.type.startsWith("WEBHOOK_")) return `Webhook ${e.type.slice(8).toLowerCase().replaceAll("_", " ")}`;
  const t = e.type.replaceAll("_", " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export const RAIL = ["Proposed", "Agreed", "Funds held", "Evidence", "Verified", "Released"];

/** Where the deal sits on the happy-path rail, and whether it stopped off-path. */
export function railPosition(state: DealState): { current: number; stop: boolean; labels: string[] } {
  const labels = [...RAIL];
  switch (state) {
    case "DRAFT": return { current: 0, stop: false, labels };
    case "AGREED": return { current: 1, stop: false, labels };
    case "FUNDS_AUTHORIZED": return { current: 2, stop: false, labels };
    case "EVIDENCE_SUBMITTED": return { current: 3, stop: false, labels };
    case "VERIFIED": return { current: 4, stop: false, labels };
    case "CAPTURED": return { current: 6, stop: false, labels };
    case "DISPUTED": labels[4] = "Human review"; return { current: 4, stop: true, labels };
    case "EXPIRED": labels[2] = "Hold expired"; return { current: 2, stop: true, labels };
    case "REFUNDED": labels[5] = "Refunded"; return { current: 5, stop: true, labels };
  }
}

export const TERMINAL: DealState[] = ["CAPTURED", "REFUNDED"];
