import { NextResponse } from "next/server";
import { deleteDeals, listDeals, sampleDealIds } from "@/lib/store";
import { canAs, rolesFor } from "@/lib/access";

/**
 * Delete the sample deals plus any deal the caller holds a link for (needs
 * DEMO_MODE=1). It never touches other people's deals on a shared instance.
 */
export async function POST(req: Request) {
  if (process.env.DEMO_MODE !== "1") {
    return NextResponse.json({ error: "Disabled. Set DEMO_MODE=1 to enable." }, { status: 403 });
  }
  const mine = listDeals()
    .filter((d) => canAs(rolesFor(req, d.id), ["buyer", "seller", "reviewer"]))
    .map((d) => d.id);
  const ids = [...new Set([...sampleDealIds(), ...mine])];
  deleteDeals(ids);
  return NextResponse.json({ reset: true, deleted: ids.length });
}
