import { NextResponse } from "next/server";
import type { Deal } from "./types";
import { withDeal } from "./store";

type Ctx = { params: { id: string } };

/**
 * Wrap a mutating deal route: loads the deal under its lock, saves it when the
 * handler finishes, and answers 404 for unknown ids.
 */
export function dealRoute(handler: (deal: Deal, req: Request) => Promise<Response>) {
  return async (req: Request, { params }: Ctx): Promise<Response> => {
    const res = await withDeal(params.id, (deal) => handler(deal, req));
    return res ?? NextResponse.json({ error: "not found" }, { status: 404 });
  };
}
