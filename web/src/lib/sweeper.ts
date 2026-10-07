import { listDeals, withDeal } from "./store";
import { sweepExpiry } from "./expiry";

/** Expire every deal whose PayPal hold has outlived its valid period. Returns how many changed. */
export async function sweepAll(now = new Date()): Promise<number> {
  let changed = 0;
  for (const d of listDeals()) {
    if (!sweepExpiry(structuredClone(d), now)) continue;
    await withDeal(d.id, async (live) => {
      if (sweepExpiry(live, now)) changed += 1;
    });
  }
  return changed;
}
