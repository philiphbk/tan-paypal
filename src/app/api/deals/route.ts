import { NextResponse } from "next/server";
import { createDeal, listDeals } from "@/lib/store";
import { transition } from "@/lib/stateMachine";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ deals: listDeals() });
}

/** Create a deal and lock the agreement (DRAFT -> AGREED). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.title || !body?.amount) {
    return NextResponse.json({ error: "title and amount are required" }, { status: 400 });
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }
  const deal = createDeal({
    title: String(body.title),
    description: String(body.description ?? ""),
    deliverables: Array.isArray(body.deliverables) ? body.deliverables.map(String) : [],
    acceptanceCriteria: Array.isArray(body.acceptanceCriteria)
      ? body.acceptanceCriteria.map(String)
      : [],
    deadline: body.deadline ? String(body.deadline) : undefined,
    amount: amount.toFixed(2),
    currency: String(body.currency ?? "USD").toUpperCase(),
  });
  transition(deal, "AGREED", "Agreement locked at v1");
  return NextResponse.json({ deal }, { status: 201 });
}
