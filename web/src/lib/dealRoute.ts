import { NextResponse } from "next/server";
import type { Deal } from "./types";
import { withDeal } from "./store";
import { canAs, rolesFor, type Held, type Role } from "./access";
import { rateLimit, type LimitName } from "./rateLimit";

type Ctx = { params: Promise<{ id: string }> };

const NEEDS: Record<Role, string> = {
  buyer: "buyer",
  seller: "seller",
  reviewer: "reviewer",
};

/**
 * Wrap a mutating deal route. It rate-limits the caller, loads the deal under
 * its lock, checks the caller holds one of `roles`, runs the handler, and saves
 * the deal afterwards. Unknown ids answer 404; missing access answers 403.
 */
export function dealRoute(
  roles: Role[],
  handler: (deal: Deal, req: Request, held: Held) => Promise<Response>,
  limit: LimitName = "write",
) {
  return async (req: Request, { params }: Ctx): Promise<Response> => {
    const limited = rateLimit(req, limit);
    if (limited) return limited;
    const { id } = await params;
    const res = await withDeal(id, async (deal) => {
      const held = rolesFor(req, id);
      if (!canAs(held, roles)) {
        const need = roles.map((r) => NEEDS[r]).join(" or ");
        return NextResponse.json(
          { error: `This action needs the ${need} access link for this deal.` },
          { status: 403 },
        );
      }
      return handler(deal, req, held);
    });
    return res ?? NextResponse.json({ error: "not found" }, { status: 404 });
  };
}
