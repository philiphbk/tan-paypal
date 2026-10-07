import { NextResponse } from "next/server";
import { isSimulated } from "@/lib/paypal";
import { approveSimulatedOrder, cancelSimulatedOrder, simulatedOrderSummary } from "@/lib/fakePaypal";
import { readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

const off = () => NextResponse.json({ error: "Not found" }, { status: 404 });

/** Simulator only: order details for the approval page. */
export async function GET(req: Request) {
  if (!isSimulated()) return off();
  const order = simulatedOrderSummary(new URL(req.url).searchParams.get("token") ?? "");
  return order ? NextResponse.json({ order }) : NextResponse.json({ error: "Unknown simulated order" }, { status: 404 });
}

/** Simulator only: the "buyer" approves or cancels, and gets the URL to return to. */
export async function POST(req: Request) {
  if (!isSimulated()) return off();
  const body = await readJson(req);
  const orderId = String(body?.orderId ?? "");
  const result = body?.action === "cancel" ? cancelSimulatedOrder(orderId) : approveSimulatedOrder(orderId);
  return result ? NextResponse.json(result) : NextResponse.json({ error: "Unknown simulated order" }, { status: 404 });
}
