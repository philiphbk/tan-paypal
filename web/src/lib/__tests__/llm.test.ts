import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { callModelForJson, resetLlmBudget } from "../llm";
import { verifyEvidence } from "../verifier";
import { buildAgreement } from "../agreementBuilder";
import { agreement } from "./helpers";

const realFetch = globalThis.fetch;
let sent: { url: string; body: any }[] = [];

/** Replace fetch with a canned Anthropic response and record what we sent. */
function stub(response: { status?: number; body: unknown }) {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url: String(url), body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(response.body), { status: response.status ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}
const toolUse = (name: string, input: unknown, extra: unknown[] = []) => ({
  stop_reason: "tool_use",
  content: [...extra, { type: "tool_use", id: "t1", name, input }],
});

beforeEach(() => {
  sent = [];
  resetLlmBudget();
  process.env.ANTHROPIC_API_KEY = "test-key";
  delete process.env.AI_MODEL;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.ANTHROPIC_API_KEY;
});

const call = () =>
  callModelForJson({ system: "sys", user: "hi", toolName: "record_x", toolDescription: "d", inputSchema: { type: "object" } });

test("the request does not force a tool: newer models reject tool_choice 'tool' and 'any'", async () => {
  stub({ body: toolUse("record_x", { ok: true }) });
  await call();
  const b = sent[0].body;
  assert.deepEqual(b.tool_choice, { type: "auto" });
  assert.match(b.system, /calling the record_x tool exactly once/);
  assert.equal(b.tools[0].name, "record_x");
  assert.ok(b.max_tokens >= 4096, "room for thinking tokens as well as the answer");
  assert.equal(b.output_config.effort, "medium");
  assert.equal(b.model, "claude-sonnet-5-5");
  assert.equal(b.thinking, undefined, "thinking is left at the model default");
});

test("the structured answer is found even when the response also carries thinking blocks", async () => {
  stub({ body: toolUse("record_x", { ok: 1 }, [{ type: "thinking", thinking: "", signature: "s" }, { type: "text", text: "Calling the tool." }]) });
  assert.deepEqual(await call(), { ok: 1 });
});

test("a blank AI_MODEL still sends a real model name", async () => {
  process.env.AI_MODEL = "";
  stub({ body: toolUse("record_x", {}) });
  await call();
  assert.equal(sent[0].body.model, "claude-sonnet-5-5");
});

test("refusal, truncation, a missing tool call and HTTP errors are reported distinctly", async () => {
  stub({ body: { stop_reason: "refusal", content: [] } });
  await assert.rejects(call(), /declined/);
  stub({ body: { stop_reason: "max_tokens", content: [{ type: "thinking", thinking: "" }] } });
  await assert.rejects(call(), /ran out of tokens/);
  stub({ body: { stop_reason: "end_turn", content: [{ type: "text", text: "plain text" }] } });
  await assert.rejects(call(), /did not return/);
  stub({ status: 400, body: { type: "error", error: { message: "tool_choice: not supported" } } });
  await assert.rejects(call(), /Model API 400/);
});

const verdict = (over: Record<string, unknown> = {}) =>
  toolUse("record_verdict", {
    verdict: "pass", confidence: 0.95, reasoning: "All good.", evidence_addresses_verifier: false,
    criteria: [{ criterion: "x", met: true, note: "ok" }, { criterion: "y", met: true, note: "ok" }],
    ...over,
  });

const GOOD = "Delivered the logo as SVG and PNG files, and a one page usage guide is included.";

test("the AI verifier's pass is accepted when every criterion is met", async () => {
  stub({ body: verdict() });
  const r = await verifyEvidence(agreement(), GOOD);
  assert.equal(r.verdict, "pass");
  assert.equal(r.verifier, "ai");
  assert.deepEqual(r.criteria.map((c) => c.criterion), agreement().acceptanceCriteria, "criteria are re-anchored to the agreement's own");
});

test("a model 'pass' with an unmet criterion is downgraded to needs_human", async () => {
  stub({ body: verdict({ criteria: [{ met: true, note: "" }, { met: false, note: "missing" }] }) });
  assert.equal((await verifyEvidence(agreement(), GOOD)).verdict, "needs_human");
});

test("the model flagging an injection escalates to a human whatever else it says", async () => {
  stub({ body: verdict({ evidence_addresses_verifier: true }) });
  const r = await verifyEvidence(agreement(), GOOD);
  assert.equal(r.verdict, "needs_human");
  assert.equal(r.injectionSuspected, true);
});

test("FAIL CLOSED: if the configured AI verifier errors, strong evidence is NOT passed by keyword rules", async () => {
  for (const failure of [
    { status: 400, body: { error: { message: "tool_choice not supported" } } },
    { status: 529, body: { error: { message: "overloaded" } } },
    { body: { stop_reason: "refusal", content: [] } },
    { body: { stop_reason: "end_turn", content: [{ type: "text", text: "pass" }] } },
  ]) {
    stub(failure);
    const r = await verifyEvidence(agreement(), GOOD);
    assert.equal(r.verdict, "needs_human", JSON.stringify(failure));
    assert.equal(r.confidence, 0);
    assert.ok(r.criteria.every((c) => !c.met));
  }
});

test("FAIL CLOSED: hitting the daily AI budget escalates to a human instead of passing", async () => {
  process.env.LLM_DAILY_CAP = "1";
  stub({ body: verdict() });
  assert.equal((await verifyEvidence(agreement(), GOOD)).verdict, "pass"); // spends the one call
  const second = await verifyEvidence(agreement(), GOOD);
  assert.equal(second.verdict, "needs_human");
  assert.match(second.reasoning, /budget/i);
  delete process.env.LLM_DAILY_CAP;
});

test("with no AI configured at all the offline rules still run (documented demo mode)", async () => {
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal((await verifyEvidence(agreement(), GOOD)).verifier, "offline-fallback");
  assert.equal((await verifyEvidence(agreement(), GOOD)).verdict, "pass");
});

test("the agreement drafter falls back to its offline rules, with a warning, when the AI errors", async () => {
  stub({ status: 400, body: { error: { message: "nope" } } });
  const r = await buildAgreement("I will design a logo for £150, delivered as SVG and PNG files, within 7 days.");
  assert.equal(r.source, "offline-fallback");
  assert.ok(r.warnings.some((w) => /AI drafter/.test(w)));
  assert.equal(r.agreement.amount, "150.00");
});

test("the AI drafter's structured answer becomes a validated agreement", async () => {
  stub({
    body: toolUse("record_agreement", {
      title: "Logo design", deliverables: ["SVG logo", "PNG logo"], acceptanceCriteria: ["Logo files are delivered in SVG and PNG"],
      amount: 150, currency: "gbp",
    }),
  });
  const r = await buildAgreement("I will design a logo for £150, delivered as SVG and PNG files.");
  assert.equal(r.source, "ai");
  assert.equal(r.agreement.currency, "GBP");
  assert.equal(r.agreement.amount, "150.00");
  assert.equal(sent[0].body.output_config.effort, "low");
});
