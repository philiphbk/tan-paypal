import { NextResponse } from "next/server";
import { findDealByOrderId, markWebhookSeen } from "@/lib/store";
import { logEvent } from "@/lib/stateMachine";
import { verifyWebhook } from "@/lib/paypal";

/**
 * PayPal webhook receiver. Verifies the signature, ignores replays by event id,
 * and records the event on the matching deal's log (used for the outcome receipt).
 */
export async function POST(req: Request) {
  const raw = await req.text();

  let verified = false;
  try {
    verified = await verifyWebhook(req.headers, raw);
  } catch (err) {
    console.error("Webhook verification error:", err);
  }
  if (!verified) return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  const event = JSON.parse(raw) as {
    id: string;
    event_type: string;
    resource?: {
      id?: string;
      custom_id?: string;
      supplementary_data?: { related_ids?: { order_id?: string } };
    };
  };

  if (!markWebhookSeen(event.id)) return NextResponse.json({ ok: true, duplicate: true });

  const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
  const deal = orderId ? findDealByOrderId(orderId) : undefined;
  if (deal) logEvent(deal, `WEBHOOK_${event.event_type}`, event.resource?.id, "paypal");

  return NextResponse.json({ ok: true });
}
