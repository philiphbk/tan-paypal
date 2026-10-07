import { NextResponse } from "next/server";
import { getDeal } from "@/lib/store";
import { sweepExpiry } from "@/lib/expiry";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const deal = getDeal(params.id);
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });
  sweepExpiry(deal);
  return NextResponse.json({ deal });
}
