import test from "node:test";
import assert from "node:assert/strict";
import { appBaseUrl, maxAutoReleaseAmount, modelName, positiveNumber } from "../config";

test("a blank APP_BASE_URL falls back instead of producing relative return URLs", () => {
  assert.equal(appBaseUrl({ APP_BASE_URL: "" }), "http://localhost:3000");
  assert.equal(appBaseUrl({ APP_BASE_URL: "   " }), "http://localhost:3000");
  assert.equal(appBaseUrl({ APP_BASE_URL: "", RENDER_EXTERNAL_URL: "https://tan.onrender.com" }), "https://tan.onrender.com");
});

test("the base URL is always an absolute http(s) origin", () => {
  assert.equal(appBaseUrl({ APP_BASE_URL: "https://tan.example.com/some/path/" }), "https://tan.example.com");
  assert.equal(appBaseUrl({ APP_BASE_URL: "localhost:3000" }), "http://localhost:3000"); // not a valid URL: fall through
  assert.equal(appBaseUrl({ APP_BASE_URL: "javascript:alert(1)", RENDER_EXTERNAL_URL: "https://ok.example" }), "https://ok.example");
  assert.equal(appBaseUrl({ APP_BASE_URL: "/deals" }), "http://localhost:3000");
});

test("an explicit APP_BASE_URL wins over Render's", () => {
  assert.equal(appBaseUrl({ APP_BASE_URL: "https://mine.example", RENDER_EXTERNAL_URL: "https://tan.onrender.com" }), "https://mine.example");
});

test("blank, zero or junk numbers use the default, so a blank cap can't withhold every payment", () => {
  for (const bad of ["", "  ", "0", "-5", "abc", undefined]) assert.equal(positiveNumber(bad, 500), 500, String(bad));
  assert.equal(positiveNumber("250", 500), 250);
  assert.equal(maxAutoReleaseAmount({ BUYER_AGENT_MAX_AMOUNT: "" }), 500);
  assert.equal(maxAutoReleaseAmount({ BUYER_AGENT_MAX_AMOUNT: "1000" }), 1000);
});

test("a blank AI_MODEL uses the default model", () => {
  assert.equal(modelName({ AI_MODEL: "" }), "claude-sonnet-5-5");
  assert.equal(modelName({ AI_MODEL: "claude-haiku-4-5-20251001" }), "claude-haiku-4-5-20251001");
});

import { describePayPalError } from "../paypal";

test("PayPal errors are summarised into one readable line with the issue, field and debug id", () => {
  const body = JSON.stringify({
    name: "INVALID_REQUEST", message: "Request is not well-formed", debug_id: "abc123",
    details: [{ field: "/payment_source/paypal/experience_context/return_url", issue: "INVALID_PARAMETER_SYNTAX", description: "bad format" }],
  });
  const msg = describePayPalError("/v2/checkout/orders", 400, body);
  assert.match(msg, /INVALID_REQUEST/);
  assert.match(msg, /INVALID_PARAMETER_SYNTAX at \/payment_source\/paypal\/experience_context\/return_url/);
  assert.match(msg, /debug id abc123/);
  assert.ok(msg.length < 300);
});

test("non-JSON PayPal error bodies are passed through, truncated", () => {
  assert.match(describePayPalError("/x", 502, "<html>Bad gateway</html>"), /502 <html>Bad gateway/);
  assert.ok(describePayPalError("/x", 500, "x".repeat(5000)).length < 400);
});
