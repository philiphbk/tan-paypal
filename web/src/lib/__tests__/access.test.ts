import test, { before } from "node:test";
import assert from "node:assert/strict";
import { useTempDb, call, json, keyHeader } from "./routeHelpers";

useTempDb();
process.env.RATE_LIMIT_DISABLED = "1";

type Handler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
let createDeal: (req: Request) => Promise<Response>;
let listDeals: (req: Request) => Promise<Response>;
let ledger: (req: Request) => Promise<Response>;
let accept: Handler, resolve: Handler, getDeal: Handler;

before(async () => {
  ({ POST: createDeal, GET: listDeals } = await import("../../app/api/deals/route"));
  ({ POST: accept } = await import("../../app/api/deals/[id]/accept/route"));
  ({ POST: resolve } = await import("../../app/api/deals/[id]/resolve/route"));
  ({ GET: getDeal } = await import("../../app/api/deals/[id]/route"));
  ({ GET: ledger } = await import("../../app/api/ledger/route"));
});

const body = {
  title: "Logo design", amount: "150", currency: "GBP", deliverables: ["Logo"],
  acceptanceCriteria: ["Logo delivered as SVG and PNG files"],
};

async function newDeal() {
  const res = await createDeal(new Request("http://x/api/deals", { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": "9.9.9.9" } }));
  assert.equal(res.status, 201);
  const j = await json(res);
  return { id: j.deal.id as string, keys: j.keys as Record<"buyer" | "seller" | "reviewer", string>, raw: JSON.stringify(j.deal) };
}

test("creating a deal returns three distinct tokens and never exposes hashes", async () => {
  const d = await newDeal();
  assert.equal(new Set(Object.values(d.keys)).size, 3);
  assert.ok(!d.raw.includes("access"));
  const read = await call(getDeal, d.id, { method: "GET", keys: keyHeader([d.id, d.keys.buyer]) });
  assert.ok(!JSON.stringify(await json(read)).includes(d.keys.buyer));
});

test("a role's token only unlocks that role's actions", async () => {
  const d = await newDeal();
  // The buyer link cannot accept on the seller's behalf.
  const asBuyer = await call(accept, d.id, { keys: keyHeader([d.id, d.keys.buyer]), body: { actor: "human_seller" } });
  assert.equal(asBuyer.status, 403);
  // No link at all is refused too.
  assert.equal((await call(accept, d.id, { body: {} })).status, 403);
  // The seller link works.
  const asSeller = await call(accept, d.id, { keys: keyHeader([d.id, d.keys.seller]), body: { actor: "human_seller" } });
  assert.equal(asSeller.status, 200);
  assert.equal((await json(asSeller)).deal.state, "AGREED");
});

test("a token for one deal is useless on another", async () => {
  const a = await newDeal();
  const b = await newDeal();
  const res = await call(accept, b.id, { keys: keyHeader([b.id, a.keys.seller]), body: {} });
  assert.equal(res.status, 403);
  // Guessing a token under the right id also fails.
  assert.equal((await call(accept, b.id, { keys: keyHeader([b.id, "x".repeat(32)]), body: {} })).status, 403);
});

test("only the reviewer link can resolve a deal, and only when it is disputed", async () => {
  const d = await newDeal();
  for (const role of ["buyer", "seller"] as const) {
    const res = await call(resolve, d.id, { keys: keyHeader([d.id, d.keys[role]]), body: { decision: "release" } });
    assert.equal(res.status, 403, role);
  }
  const asReviewer = await call(resolve, d.id, { keys: keyHeader([d.id, d.keys.reviewer]), body: { decision: "release" } });
  assert.equal(asReviewer.status, 409); // authorized, but the deal is not DISPUTED
});

test("reading a deal needs a link; unknown ids are 404", async () => {
  const d = await newDeal();
  assert.equal((await call(getDeal, d.id, { method: "GET" })).status, 403);
  assert.equal((await call(getDeal, d.id, { method: "GET", keys: keyHeader([d.id, d.keys.seller]) })).status, 200);
  assert.equal((await call(getDeal, "nope", { method: "GET" })).status, 404);
});

test("lists and the ledger only show deals the caller holds links for", async () => {
  const a = await newDeal();
  const b = await newDeal();
  const mine = await listDeals(new Request("http://x", { headers: { "x-deal-keys": keyHeader([a.id, a.keys.buyer]) } }));
  const ids = (await json<{ deals: { id: string }[] }>(mine)).deals.map((x) => x.id);
  assert.ok(ids.includes(a.id));
  assert.ok(!ids.includes(b.id));
  const none = await ledger(new Request("http://x"));
  assert.equal((await json<{ transactions: unknown[] }>(none)).transactions.length, 0);
});

test("a global REVIEWER_KEY grants the reviewer role everywhere", async () => {
  process.env.REVIEWER_KEY = "ops-secret";
  const d = await newDeal();
  const req = new Request("http://x", { headers: { "x-reviewer-key": "ops-secret" } });
  const list = await json<{ deals: { id: string }[] }>(await listDeals(req));
  assert.ok(list.deals.some((x) => x.id === d.id));
  const wrong = await listDeals(new Request("http://x", { headers: { "x-reviewer-key": "nope" } }));
  assert.ok(!(await json<{ deals: { id: string }[] }>(wrong)).deals.some((x) => x.id === d.id));
  delete process.env.REVIEWER_KEY;
});
