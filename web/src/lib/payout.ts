import type { Deal } from "./types";
import { logEvent } from "./stateMachine";
import { createPayout, getPayoutBatch } from "./paypal";

export const isEmail = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

const FAILED = ["DENIED", "CANCELED", "FAILED", "RETURNED", "BLOCKED", "REFUNDED"];

/** Refresh payout status from PayPal and record changes on the timeline. */
export async function syncPayout(deal: Deal) {
  const p = deal.payout;
  if (!p) return;
  const { batchStatus, itemStatus } = await getPayoutBatch(p.batchId);
  if (batchStatus !== p.batchStatus || itemStatus !== p.itemStatus) {
    p.batchStatus = batchStatus;
    p.itemStatus = itemStatus;
    logEvent(deal, "PAYOUT_STATUS", `${batchStatus}${itemStatus ? ` / ${itemStatus}` : ""}`, "paypal");
  }
}

/**
 * Pay the seller out after capture (freelance scenario). Never throws into the
 * deal flow: the capture already happened, so a payout problem is logged and can
 * be retried with POST /api/deals/[id]/payout.
 */
export async function payoutSeller(deal: Deal): Promise<void> {
  if (deal.state !== "CAPTURED" || !deal.paypal.captureId) return;
  if (!deal.sellerEmail) {
    logEvent(deal, "PAYOUT_SKIPPED", "No seller PayPal email on the deal", "system");
    return;
  }
  let attempt = deal.payout?.attempt ?? 1;
  try {
    if (deal.payout) {
      await syncPayout(deal);
      const failed = FAILED.includes(deal.payout.batchStatus) || FAILED.includes(deal.payout.itemStatus ?? "");
      if (!failed) return; // already paid or in flight: do not pay twice
      attempt = deal.payout.attempt + 1;
    }
    const res = await createPayout({
      dealId: deal.id,
      attempt,
      receiverEmail: deal.sellerEmail,
      amount: deal.agreement.amount,
      currency: deal.agreement.currency,
      note: `Payment for: ${deal.agreement.title}`,
    });
    deal.payout = {
      batchId: res.batchId,
      batchStatus: res.batchStatus,
      receiver: deal.sellerEmail,
      amount: deal.agreement.amount,
      currency: deal.agreement.currency,
      attempt,
    };
    logEvent(deal, "PAYOUT_SENT", `${res.batchId} (${res.batchStatus}) to ${deal.sellerEmail}`, "paypal");
  } catch (err) {
    logEvent(deal, "PAYOUT_FAILED", (err as Error).message.slice(0, 300), "paypal");
  }
}
