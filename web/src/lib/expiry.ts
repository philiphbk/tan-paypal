import type { Deal } from "./types";
import { logEvent, transition } from "./stateMachine";
import { reauthorizeAuthorization } from "./paypal";

/**
 * PayPal authorization lifecycle (official docs, Authorization and Honor Period):
 *  - honor period: 3 days. Funds are guaranteed for capture only inside it.
 *  - valid period: 29 days. After that the authorization is gone.
 *  - reauthorization restarts the honor period (new authorization id) and is
 *    only allowed after the honor period, within the valid period.
 * The sandbox follows the same rules.
 */
export const HONOR_DAYS = 3;
export const VALID_DAYS = 29;
const DAY = 86_400_000;

/** States in which a PayPal hold is (supposed to be) live. */
const HOLDING = ["FUNDS_AUTHORIZED", "EVIDENCE_SUBMITTED", "VERIFIED", "DISPUTED"];

export class HoldExpiredError extends Error {
  constructor() {
    super("The PayPal authorization has expired; the buyer must approve a new hold");
    this.name = "HoldExpiredError";
  }
}

/** Record the honor/valid windows after an authorize or reauthorize. */
export function setAuthWindow(deal: Deal, expiresAt?: string, now = new Date()) {
  const p = deal.paypal;
  p.authorizedAt = now.toISOString();
  p.honorEndsAt = new Date(now.getTime() + HONOR_DAYS * DAY).toISOString();
  // PayPal's expiration_time is authoritative when present; otherwise assume 29 days
  // from the first authorization (reauthorization never extends the valid period).
  p.validUntil =
    expiresAt && !p.validUntil
      ? expiresAt
      : p.validUntil ?? new Date(now.getTime() + VALID_DAYS * DAY).toISOString();
}

/** Move a deal to EXPIRED if its hold has outlived the valid period. Returns true if expired. */
export function sweepExpiry(deal: Deal, now = new Date()): boolean {
  if (!HOLDING.includes(deal.state) || !deal.paypal.validUntil) return false;
  if (now.getTime() <= new Date(deal.paypal.validUntil).getTime()) return false;
  transition(deal, "EXPIRED", `Authorization ${deal.paypal.authorizationId} passed its valid period`, "system");
  return true;
}

export function honorPeriodLapsed(deal: Deal, now = new Date()): boolean {
  const end = deal.paypal.honorEndsAt;
  return Boolean(end) && now.getTime() > new Date(end as string).getTime();
}

/** Reauthorize the hold and store the new authorization id and honor window. */
export async function reauthorize(deal: Deal, actor: "system" | "buyer_agent" | "human_buyer" = "system") {
  const p = deal.paypal;
  if (!p.authorizationId) throw new Error("No authorization to reauthorize");
  const attempt = (p.reauthCount ?? 0) + 1;
  const res = await reauthorizeAuthorization({
    authorizationId: p.authorizationId,
    attempt,
    amount: deal.agreement.amount,
    currency: deal.agreement.currency,
  });
  logEvent(deal, "PAYPAL_REAUTHORIZED", `${p.authorizationId} -> ${res.authorizationId}`, "paypal");
  p.authorizationId = res.authorizationId;
  p.reauthCount = attempt;
  setAuthWindow(deal, res.expiresAt);
}

/**
 * Call immediately before every capture. Expires the deal if the hold is gone,
 * and reauthorizes if the honor period has lapsed so the capture is guaranteed.
 */
export async function ensureCapturable(deal: Deal, now = new Date()) {
  if (sweepExpiry(deal, now)) throw new HoldExpiredError();
  if (honorPeriodLapsed(deal, now)) await reauthorize(deal);
}
