import type { Deal } from "./types";
import { logEvent, transition } from "./stateMachine";

export interface PayPalEvent {
  id: string;
  event_type: string;
  resource?: {
    id?: string;
    status?: string;
    payout_batch_id?: string;
    transaction_status?: string;
    batch_header?: { payout_batch_id?: string; batch_status?: string };
    supplementary_data?: { related_ids?: { order_id?: string; authorization_id?: string } };
  };
}

/** Every id in an event that could identify one of our deals. */
export function refsOf(e: PayPalEvent): string[] {
  const r = e.resource ?? {};
  return [
    r.supplementary_data?.related_ids?.order_id,
    r.supplementary_data?.related_ids?.authorization_id,
    r.payout_batch_id,
    r.batch_header?.payout_batch_id,
    r.id,
  ].filter((x): x is string => Boolean(x));
}

const HOLDING = ["FUNDS_AUTHORIZED", "EVIDENCE_SUBMITTED", "VERIFIED", "DISPUTED"];
const PAYOUT_BAD = ["DENIED", "FAILED", "BLOCKED", "RETURNED", "CANCELED", "REFUNDED", "REVERSED"];

/**
 * Apply a verified PayPal webhook to a deal. PayPal is the source of truth for
 * its own objects, so when it tells us something changed outside the app (a
 * hold voided in the dashboard, a capture reversed, a payout bounced) the deal
 * reflects it instead of silently disagreeing with reality.
 */
export function applyWebhookEvent(deal: Deal, e: PayPalEvent): void {
  const r = e.resource ?? {};
  logEvent(deal, `WEBHOOK_${e.event_type}`, r.id, "paypal");

  switch (e.event_type) {
    case "PAYMENT.AUTHORIZATION.VOIDED": {
      // Our own refunds void too, but by then the deal is already REFUNDED.
      if (r.id === deal.paypal.authorizationId && HOLDING.includes(deal.state)) {
        transition(deal, "EXPIRED", "PayPal reports the authorization was voided outside the app", "paypal");
      }
      return;
    }
    case "PAYMENT.CAPTURE.COMPLETED":
    case "PAYMENT.CAPTURE.PENDING":
    case "PAYMENT.CAPTURE.DENIED":
    case "PAYMENT.CAPTURE.REFUNDED":
    case "PAYMENT.CAPTURE.REVERSED": {
      if (r.id !== deal.paypal.captureId) return;
      const status = e.event_type.split(".").pop() as string;
      deal.paypal.captureStatus = status;
      if (["DENIED", "REFUNDED", "REVERSED"].includes(status)) {
        logEvent(deal, "CAPTURE_REVERSED", `PayPal reports the capture is ${status.toLowerCase()}`, "paypal");
      }
      return;
    }
    default:
  }

  if (deal.payout && (e.event_type.startsWith("PAYMENT.PAYOUTSBATCH.") || e.event_type.startsWith("PAYMENT.PAYOUTS-ITEM."))) {
    const batch = r.batch_header?.batch_status;
    const item = r.transaction_status;
    const before = `${deal.payout.batchStatus}/${deal.payout.itemStatus ?? ""}`;
    if (batch) deal.payout.batchStatus = batch;
    if (item) deal.payout.itemStatus = item;
    if (!batch && !item) {
      const fromType = e.event_type.split(".").pop()?.replace("SUCCEEDED", "SUCCESS");
      if (fromType) deal.payout.itemStatus = fromType;
    }
    const after = `${deal.payout.batchStatus}/${deal.payout.itemStatus ?? ""}`;
    if (after !== before) {
      logEvent(deal, "PAYOUT_STATUS", after, "paypal");
      if (PAYOUT_BAD.includes(deal.payout.itemStatus ?? "") || PAYOUT_BAD.includes(deal.payout.batchStatus)) {
        logEvent(deal, "PAYOUT_FAILED", `PayPal reports the payout is ${(deal.payout.itemStatus ?? deal.payout.batchStatus).toLowerCase()}`, "paypal");
      }
    }
  }
}
