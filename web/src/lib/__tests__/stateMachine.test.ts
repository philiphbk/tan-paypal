import test from "node:test";
import assert from "node:assert/strict";
import { IllegalTransitionError, canTransition, transition } from "../stateMachine";
import { deal } from "./helpers";

test("happy path walks through every state", () => {
  const d = deal({ state: "DRAFT" });
  for (const s of ["AGREED", "FUNDS_AUTHORIZED", "EVIDENCE_SUBMITTED", "VERIFIED", "CAPTURED"] as const) {
    transition(d, s);
  }
  assert.equal(d.state, "CAPTURED");
  assert.equal(d.events.length, 5);
});

test("money cannot move before verification", () => {
  assert.equal(canTransition("FUNDS_AUTHORIZED", "CAPTURED"), false);
  assert.equal(canTransition("EVIDENCE_SUBMITTED", "CAPTURED"), false);
  assert.throws(() => transition(deal({ state: "AGREED" }), "CAPTURED"), IllegalTransitionError);
});

test("terminal states stay terminal; EXPIRED can only be re-funded", () => {
  assert.equal(canTransition("CAPTURED", "REFUNDED"), false);
  assert.equal(canTransition("REFUNDED", "CAPTURED"), false);
  assert.equal(canTransition("EXPIRED", "CAPTURED"), false);
  assert.equal(canTransition("EXPIRED", "AGREED"), true);
});

test("a human can release or refund a disputed deal", () => {
  assert.equal(canTransition("DISPUTED", "CAPTURED"), true);
  assert.equal(canTransition("DISPUTED", "REFUNDED"), true);
});

test("transition records the actor", () => {
  const d = deal({ state: "AGREED" });
  transition(d, "FUNDS_AUTHORIZED", "held", "human_buyer");
  assert.equal(d.events[0].actor, "human_buyer");
});
