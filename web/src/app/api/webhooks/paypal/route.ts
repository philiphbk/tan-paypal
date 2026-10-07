import { NextResponse } from "next/server";
import { findDealByPaypalRef, markWebhookSeen, withDeal } from "@/lib/store";
import { verifyWebhook } from "@/lib/paypal";
import { applyWebhookEvent, refsOf, type PayPalEvent } from "@/lib/webhookHandler";

/**
 * PayPal webhook receiver. Verifies the signature, ignores replays by event id,
 * and applies the event to the matching deal (see webhookHandler.ts).
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 200_000) return NextResponse.json({ error: "too large" }, { status: 413 });

  let verified = false;
  try {
    verified = await verifyWebhook(req.headers, raw);
  } catch (err) {
    console.error("Webhook verification error:", err);
  }
  if (!verified) return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  const event = JSON.parse(raw) as PayPalEvent;
  if (!markWebhookSeen(event.id)) return NextResponse.json({ ok: true, duplicate: true });

  const found = refsOf(event).map(findDealByPaypalRef).find(Boolean);
  if (found) await withDeal(found.id, async (deal) => applyWebhookEvent(deal, event));
  return NextResponse.json({ ok: true, matched: Boolean(found) });
}
