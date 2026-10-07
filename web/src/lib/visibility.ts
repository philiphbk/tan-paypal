import type { Deal } from "./types";
import { listDeals, withDeal } from "./store";
import { canRead, rolesFor } from "./access";
import { sweepExpiry } from "./expiry";

/** Deals this request is allowed to see: ones it holds a link for, plus public samples. */
export async function visibleDeals(req: Request): Promise<Deal[]> {
  // Expire lapsed holds under each deal's lock first, so lists never show a stale hold.
  const now = new Date();
  for (const d of listDeals()) {
    if (sweepExpiry(structuredClone(d), now)) await withDeal(d.id, async (live) => sweepExpiry(live, now));
  }
  return listDeals().filter((d) => canRead(rolesFor(req, d.id)));
}
