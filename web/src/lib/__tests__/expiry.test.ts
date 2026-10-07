import test from "node:test";
import assert from "node:assert/strict";
import { honorPeriodLapsed, setAuthWindow, sweepExpiry } from "../expiry";
import { deal } from "./helpers";

const T0 = new Date("2026-10-01T00:00:00Z");
const day = (n: number) => new Date(T0.getTime() + n * 86_400_000);
const held = () => {
  const d = deal({ state: "FUNDS_AUTHORIZED", paypal: { authorizationId: "AUTH1" } });
  setAuthWindow(d, undefined, T0);
  return d;
};

test("honor period is 3 days, valid period 29", () => {
  const d = held();
  assert.equal(honorPeriodLapsed(d, day(2)), false);
  assert.equal(honorPeriodLapsed(d, day(4)), true);
  assert.equal(sweepExpiry(d, day(28)), false);
  assert.equal(d.state, "FUNDS_AUTHORIZED");
});

test("hold past the valid period expires the deal", () => {
  const d = held();
  assert.equal(sweepExpiry(d, day(30)), true);
  assert.equal(d.state, "EXPIRED");
  assert.equal(d.events.at(-1)?.type, "STATE_EXPIRED");
});

test("PayPal's expiration_time wins; reauthorization never extends the valid period", () => {
  const d = deal({ state: "FUNDS_AUTHORIZED" });
  setAuthWindow(d, "2026-10-20T00:00:00Z", T0);
  assert.equal(d.paypal.validUntil, "2026-10-20T00:00:00Z");
  setAuthWindow(d, "2026-12-01T00:00:00Z", day(5));
  assert.equal(d.paypal.validUntil, "2026-10-20T00:00:00Z");
  assert.equal(d.paypal.honorEndsAt, day(8).toISOString());
});

test("deals without a live hold are never swept", () => {
  const d = deal({ state: "AGREED", paypal: { validUntil: "2020-01-01T00:00:00Z" } });
  assert.equal(sweepExpiry(d, day(100)), false);
  const captured = deal({ state: "CAPTURED", paypal: { validUntil: "2020-01-01T00:00:00Z" } });
  assert.equal(sweepExpiry(captured, day(100)), false);
});
