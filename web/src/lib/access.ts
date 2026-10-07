import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getAccessHashes, isSampleDeal } from "./store";

/**
 * Capability links. Creating a deal issues three secret tokens (buyer, seller,
 * reviewer). Only their SHA-256 hashes are stored, in a table apart from the
 * deal, so a deal's JSON can never leak them. A caller proves a role by sending
 * the token in the x-deal-keys header ("<dealId>.<token>,..."). A global
 * REVIEWER_KEY (env) grants the reviewer role on every deal, for an ops team.
 */
export type Role = "buyer" | "seller" | "reviewer";
export const ROLES: Role[] = ["buyer", "seller", "reviewer"];
export type Held = Set<Role | "viewer">;

const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const token = () => randomBytes(24).toString("base64url");

export function newTokens(): Record<Role, string> {
  return { buyer: token(), seller: token(), reviewer: token() };
}
export const hashTokens = (t: Record<Role, string>): Record<Role, string> => ({
  buyer: hash(t.buyer), seller: hash(t.seller), reviewer: hash(t.reviewer),
});

function safeEq(a: string, b: string): boolean {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

/** Parse "<dealId>.<token>,<dealId>.<token>" into a map. Capped to stop abuse. */
export function parseKeys(req: Request): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const raw = req.headers.get("x-deal-keys") ?? "";
  for (const part of raw.split(",").slice(0, 200)) {
    const i = part.indexOf(".");
    if (i <= 0) continue;
    const id = part.slice(0, i).trim();
    const tok = part.slice(i + 1).trim();
    if (tok.length < 16 || tok.length > 64) continue;
    out.set(id, [...(out.get(id) ?? []), tok]);
  }
  return out;
}

export function hasGlobalReviewerKey(req: Request): boolean {
  const want = process.env.REVIEWER_KEY;
  const got = req.headers.get("x-reviewer-key");
  return Boolean(want && got && safeEq(hash(want), hash(got)));
}

/** The roles this request holds on a deal ("viewer" = read-only access to a public sample). */
export function rolesFor(req: Request, dealId: string): Held {
  const held: Held = new Set();
  const hashes = getAccessHashes(dealId);
  if (hashes) {
    for (const tok of parseKeys(req).get(dealId) ?? []) {
      const h = hash(tok);
      for (const r of ROLES) if (safeEq(h, hashes[r])) held.add(r);
    }
  }
  if (hasGlobalReviewerKey(req)) held.add("reviewer");
  if (isSampleDeal(dealId)) held.add("viewer");
  return held;
}

export const canRead = (held: Held) => held.size > 0;
export const canAs = (held: Held, roles: Role[]) => roles.some((r) => held.has(r));
