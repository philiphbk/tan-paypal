import test, { before } from "node:test";
import assert from "node:assert/strict";
import { applyWebhookEvent, refsOf } from "../webhookHandler";
import { deal } from "./helpers";
import { useTempDb } from "./routeHelpers";

useTempDb();
const ev = (event_type: string, resource: Record<string, unknown>, id = "WH-1") => ({ id, event_type, resource });

test("a hold voided outside the app expires the deal", () => {
  const d = deal({ state: "FUNDS_AUTHORIZED", paypal: { authorizationId: "AUTH1" } });
  applyWebhookEvent(d, ev("PAYMENT.AUTHORIZATION.VOIDED", { id: "AUTH1" }));
  assert.equal(d.state, "EXPIRED");
  assert.equal(d.events.at(-1)?.actor, "paypal");
});

test("the void caused by our own refund does not disturb a REFUNDED deal", () => {
  const d = deal({ state: "REFUNDED", paypal: { authorizationId: "AUTH1" } });
  applyWebhookEvent(d, ev("PAYMENT.AUTHORIZATION.VOIDED", { id: "AUTH1" }));
  assert.equal(d.state, "REFUNDED");
});

test("a void for some other authorization is ignored", () => {
  const d = deal({ state: "DISPUTED", paypal: { authorizationId: "AUTH1" } });
  applyWebhookEvent(d, ev("PAYMENT.AUTHORIZATION.VOIDED", { id: "OLD-AUTH" }));
  assert.equal(d.state, "DISPUTED");
});

test("a reversed capture is flagged on the deal without changing its state", () => {
  const d = deal({ state: "CAPTURED", paypal: { captureId: "CAP1" } });
  applyWebhookEvent(d, ev("PAYMENT.CAPTURE.REVERSED", { id: "CAP1" }));
  assert.equal(d.state, "CAPTURED");
  assert.equal(d.paypal.captureStatus, "REVERSED");
  assert.ok(d.events.some((e) => e.type === "CAPTURE_REVERSED"));
});

test("payout webhooks update status and surface failures", () => {
  const d = deal({
    state: "CAPTURED",
    payout: { batchId: "B1", batchStatus: "PENDING", receiver: "s@example.com", amount: "10.00", currency: "USD", attempt: 1 },
  });
  applyWebhookEvent(d, ev("PAYMENT.PAYOUTSBATCH.SUCCESS", { batch_header: { payout_batch_id: "B1", batch_status: "SUCCESS" } }));
  assert.equal(d.payout?.batchStatus, "SUCCESS");
  applyWebhookEvent(d, ev("PAYMENT.PAYOUTS-ITEM.RETURNED", { payout_batch_id: "B1", transaction_status: "RETURNED" }, "WH-2"));
  assert.equal(d.payout?.itemStatus, "RETURNED");
  assert.ok(d.events.some((e) => e.type === "PAYOUT_FAILED"));
});

test("refsOf collects every id that can identify a deal", () => {
  const refs = refsOf(ev("X", { id: "R1", payout_batch_id: "B1", supplementary_data: { related_ids: { order_id: "O1", authorization_id: "A1" } } }));
  assert.deepEqual(new Set(refs), new Set(["R1", "B1", "O1", "A1"]));
});

let store: typeof import("../store");
let sweeper: typeof import("../sweeper");
let expiry: typeof import("../expiry");
before(async () => {
  store = await import("../store");
  sweeper = await import("../sweeper");
  expiry = await import("../expiry");
});

test("the scheduled sweep expires only lapsed holds and persists the change", async () => {
  const old = store.createDeal({ title: "Old hold", description: "", deliverables: ["a"], acceptanceCriteria: ["a b c"], amount: "10.00", currency: "USD" });
  const fresh = store.createDeal({ title: "Fresh hold", description: "", deliverables: ["a"], acceptanceCriteria: ["a b c"], amount: "10.00", currency: "USD" });
  for (const [d, when] of [[old, new Date("2026-08-01")], [fresh, new Date("2026-10-05")]] as const) {
    d.state = "FUNDS_AUTHORIZED";
    d.paypal.authorizationId = `A-${d.id}`;
    expiry.setAuthWindow(d, undefined, when);
    store.saveDeal(d);
  }
  const changed = await sweeper.sweepAll(new Date("2026-10-07"));
  assert.equal(changed, 1);
  assert.equal(store.getDeal(old.id)?.state, "EXPIRED");
  assert.equal(store.getDeal(fresh.id)?.state, "FUNDS_AUTHORIZED");
  assert.equal(await sweeper.sweepAll(new Date("2026-10-07")), 0); // idempotent
});

test("findDealByPaypalRef locates a deal by any of its PayPal ids", () => {
  const d = store.createDeal({ title: "Refs", description: "", deliverables: ["a"], acceptanceCriteria: ["a b c"], amount: "10.00", currency: "USD" });
  d.paypal = { orderId: "ORD-9", authorizationId: "AUTH-9", captureId: "CAP-9" };
  d.payout = { batchId: "PAYOUT-9", batchStatus: "PENDING", receiver: "x@example.com", amount: "10.00", currency: "USD", attempt: 1 };
  store.saveDeal(d);
  for (const ref of ["ORD-9", "AUTH-9", "CAP-9", "PAYOUT-9"]) assert.equal(store.findDealByPaypalRef(ref)?.id, d.id, ref);
  assert.equal(store.findDealByPaypalRef("nope"), undefined);
});
