import { NextResponse } from "next/server";
import { readJson } from "@/lib/http";
import { dealRoute } from "@/lib/dealRoute";
import { logEvent } from "@/lib/stateMachine";
import { sweepExpiry } from "@/lib/expiry";

/**
 * Demo only (DEMO_MODE=1): move this deal's LOCAL authorization clocks back by N
 * days so the expiry and reauthorization paths can be shown without waiting.
 * PayPal's own clocks are unaffected, so a real reauthorize call inside PayPal's
 * honor period will still be rejected by PayPal; the EXPIRED path is fully local.
 */
export const POST = dealRoute(["buyer", "seller", "reviewer"], async (deal, req) => {
  if (process.env.DEMO_MODE !== "1") {
    return NextResponse.json({ error: "Disabled. Set DEMO_MODE=1 to enable." }, { status: 403 });
  }
  const body = await readJson(req);
  const days = Number(body?.days);
  if (!Number.isFinite(days) || days <= 0 || days > 60) {
    return NextResponse.json({ error: "days must be between 1 and 60" }, { status: 400 });
  }
  const p = deal.paypal;
  if (!p.authorizedAt) return NextResponse.json({ error: "No authorization to age" }, { status: 409 });
  const shift = (iso?: string) => (iso ? new Date(new Date(iso).getTime() - days * 86_400_000).toISOString() : iso);
  p.authorizedAt = shift(p.authorizedAt);
  p.honorEndsAt = shift(p.honorEndsAt);
  p.validUntil = shift(p.validUntil);
  logEvent(deal, "DEMO_TIME_SHIFT", `Local authorization clocks moved back ${days} day(s)`, "system");
  sweepExpiry(deal);
  return NextResponse.json({ deal });
});
