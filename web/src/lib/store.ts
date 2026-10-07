import { randomUUID } from "node:crypto";
import type { Actor, Agreement, Deal } from "./types";

/**
 * In-memory store, kept on globalThis so it survives Next.js dev hot reloads.
 * Swap for Postgres/SQLite before production; the interface is deliberately tiny.
 */
const g = globalThis as unknown as {
  __deals?: Map<string, Deal>;
  __webhookSeen?: Set<string>;
};
const deals = (g.__deals ??= new Map<string, Deal>());
const webhookSeen = (g.__webhookSeen ??= new Set<string>());

export function createDeal(
  agreement: Omit<Agreement, "version">,
  buyerLabel = "Buyer",
  sellerLabel = "Seller",
  proposer: Actor = "human_buyer",
): Deal {
  const now = new Date().toISOString();
  const deal: Deal = {
    id: randomUUID(),
    state: "DRAFT",
    agreement: { ...agreement, version: 1 },
    buyerLabel,
    sellerLabel,
    paypal: {},
    events: [{ at: now, type: "AGREEMENT_PROPOSED", detail: agreement.title, actor: proposer }],
    createdAt: now,
    updatedAt: now,
  };
  deals.set(deal.id, deal);
  return deal;
}

export const getDeal = (id: string) => deals.get(id);
export const listDeals = () =>
  [...deals.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export function findDealByOrderId(orderId: string): Deal | undefined {
  return [...deals.values()].find((d) => d.paypal.orderId === orderId);
}

export function findDealByPayoutBatchId(batchId: string): Deal | undefined {
  return [...deals.values()].find((d) => d.payout?.batchId === batchId);
}

/** Returns true the first time an event id is seen (idempotent webhook handling). */
export function markWebhookSeen(eventId: string): boolean {
  if (webhookSeen.has(eventId)) return false;
  webhookSeen.add(eventId);
  return true;
}
