import test from "node:test";
import assert from "node:assert/strict";
import { LIMITS, rateLimit, resetRateLimits } from "../rateLimit";
import { readJson } from "../http";
import { resetLlmBudget, spendLlmBudget } from "../llm";

const req = (ip: string) => new Request("http://x", { headers: { "x-forwarded-for": ip } });

test("requests over the window limit get 429 with Retry-After", () => {
  resetRateLimits();
  const { max } = LIMITS.llm;
  for (let i = 0; i < max; i++) assert.equal(rateLimit(req("1.1.1.1"), "llm", 1000), null);
  const blocked = rateLimit(req("1.1.1.1"), "llm", 1000);
  assert.equal(blocked?.status, 429);
  assert.ok(Number(blocked?.headers.get("Retry-After")) >= 1);
});

test("limits are per client and per bucket", () => {
  resetRateLimits();
  for (let i = 0; i < LIMITS.llm.max; i++) rateLimit(req("2.2.2.2"), "llm", 1000);
  assert.equal(rateLimit(req("3.3.3.3"), "llm", 1000), null);
  assert.equal(rateLimit(req("2.2.2.2"), "write", 1000), null);
});

test("the window resets", () => {
  resetRateLimits();
  for (let i = 0; i <= LIMITS.llm.max; i++) rateLimit(req("4.4.4.4"), "llm", 1000);
  assert.equal(rateLimit(req("4.4.4.4"), "llm", 1000 + LIMITS.llm.windowMs + 1), null);
});

test("the daily AI budget is a hard cap", () => {
  resetLlmBudget();
  process.env.LLM_DAILY_CAP = "3";
  const day = new Date("2026-10-07T10:00:00Z");
  for (let i = 0; i < 3; i++) spendLlmBudget(day);
  assert.throws(() => spendLlmBudget(day), /budget/);
  assert.doesNotThrow(() => spendLlmBudget(new Date("2026-10-08T00:00:01Z")));
  delete process.env.LLM_DAILY_CAP;
});

test("oversized and malformed bodies are rejected", async () => {
  const big = new Request("http://x", { method: "POST", body: JSON.stringify({ a: "x".repeat(200) }) });
  assert.equal(await readJson(big, 100), null);
  assert.equal(await readJson(new Request("http://x", { method: "POST", body: "{not json" })), null);
  assert.deepEqual(await readJson(new Request("http://x", { method: "POST", body: '{"a":1}' })), { a: 1 });
});
