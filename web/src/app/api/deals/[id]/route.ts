import { NextResponse } from "next/server";
import { withDeal } from "@/lib/store";
import { canRead, rolesFor } from "@/lib/access";
import { sweepExpiry } from "@/lib/expiry";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await withDeal(id, async (deal) => {
    if (!canRead(rolesFor(req, id))) {
      return NextResponse.json({ error: "You need an access link for this deal." }, { status: 403 });
    }
    sweepExpiry(deal);
    return NextResponse.json({ deal });
  });
  return res ?? NextResponse.json({ error: "not found" }, { status: 404 });
}
