/**
 * PayPal SIMULATOR, for running the full flow without sandbox credentials and for
 * integration tests. It is NOT PayPal and is only active when PAYPAL_MODE=simulated;
 * the UI labels it wherever it is on. The real submission path is the PayPal sandbox.
 *
 * It implements just the endpoints this app calls and enforces the rules that matter
 * to the app, as documented by PayPal: an order must be approved before it can be
 * authorized; capture needs a live authorization inside its 3-day honor period;
 * reauthorize is refused inside the honor period and after the 29-day valid period;
 * and the PayPal-Request-Id header makes a retry return the original response.
 * Capture outside the honor period is refused here (strict) so the app's
 * reauthorize-before-capture path is exercised.
 */

const DAY = 86_400_000;

interface Order {
  id: string; status: "CREATED" | "APPROVED" | "COMPLETED"; amount: { currency_code: string; value: string };
  returnUrl: string; cancelUrl: string; appOrigin: string;
}
interface Auth {
  id: string; status: "CREATED" | "CAPTURED" | "VOIDED"; amount: { currency_code: string; value: string };
  created: number; honorEnds: number; validEnds: number;
}
interface Batch { id: string; senderBatchId: string; items: { receiver: string; amount: { value: string; currency: string } }[]; polls: number }

interface Sim {
  clockOffset: number; seq: number;
  orders: Map<string, Order>; auths: Map<string, Auth>; captures: Set<string>;
  batches: Map<string, Batch>; batchKeys: Set<string>;
  replays: Map<string, { status: number; body: unknown }>;
}
const g = globalThis as unknown as { __sim?: Sim };
const fresh = (): Sim => ({
  clockOffset: 0, seq: 0, orders: new Map(), auths: new Map(), captures: new Set(),
  batches: new Map(), batchKeys: new Set(), replays: new Map(),
});
const sim = () => (g.__sim ??= fresh());

export const resetSimulator = () => { g.__sim = fresh(); };
export const simNow = () => Date.now() + sim().clockOffset;
/** Move the simulator's clock forward (used with the demo time-shift tool and in tests). */
export const advanceSimClock = (days: number) => { sim().clockOffset += days * DAY; };
const id = (p: string) => `SIM-${p}-${(++sim().seq).toString(36).toUpperCase().padStart(4, "0")}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const iso = (ms: number) => new Date(ms).toISOString();

const reply = (status: number, body: unknown) =>
  status === 204
    ? new Response(null, { status })
    : new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fail = (status: number, name: string, issue: string, message: string) =>
  reply(status, { name, message, details: [{ issue, description: message }], debug_id: "SIMULATED" });

export function approveSimulatedOrder(orderId: string): { redirect: string } | null {
  const o = sim().orders.get(orderId);
  if (!o) return null;
  o.status = "APPROVED";
  const u = new URL(o.returnUrl);
  u.searchParams.set("token", o.id);
  u.searchParams.set("PayerID", "SIMULATEDBUYER");
  return { redirect: u.toString() };
}

export function cancelSimulatedOrder(orderId: string): { redirect: string } | null {
  const o = sim().orders.get(orderId);
  return o ? { redirect: o.cancelUrl } : null;
}

export const simulatedOrderSummary = (orderId: string) => {
  const o = sim().orders.get(orderId);
  return o ? { id: o.id, amount: o.amount, status: o.status } : null;
};

export async function simulatedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const { pathname } = new URL(url);
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  const body = typeof init.body === "string" && init.body ? JSON.parse(init.body) : {};
  const s = sim();

  if (pathname === "/v1/oauth2/token") {
    return reply(200, { access_token: "SIM-TOKEN", token_type: "Bearer", expires_in: 32400 });
  }
  if (headers.get("authorization") !== "Bearer SIM-TOKEN") {
    return fail(401, "AUTHENTICATION_FAILURE", "AUTHENTICATION_FAILURE", "Authentication failed due to invalid authentication credentials.");
  }

  // Idempotency: a retry with the same PayPal-Request-Id gets the original response.
  const requestId = headers.get("paypal-request-id");
  const replayKey = requestId ? `${method} ${pathname} ${requestId}` : null;
  if (replayKey && s.replays.has(replayKey)) {
    const r = s.replays.get(replayKey)!;
    return reply(r.status, r.body);
  }
  const done = async (res: Response) => {
    if (replayKey && res.status < 500) {
      const text = await res.clone().text();
      s.replays.set(replayKey, { status: res.status, body: text ? JSON.parse(text) : null });
    }
    return res;
  };

  let m: RegExpMatchArray | null;

  if (method === "POST" && pathname === "/v2/checkout/orders") {
    const unit = body.purchase_units?.[0];
    const ctx = body.payment_source?.paypal?.experience_context;
    if (body.intent !== "AUTHORIZE" || !unit?.amount?.value || !ctx?.return_url) {
      return done(fail(400, "INVALID_REQUEST", "INVALID_REQUEST", "Request is not well-formed (simulator expects intent AUTHORIZE, an amount and a return_url)."));
    }
    const order: Order = {
      id: id("ORD"), status: "CREATED", amount: unit.amount, returnUrl: ctx.return_url,
      cancelUrl: ctx.cancel_url ?? ctx.return_url, appOrigin: new URL(ctx.return_url).origin,
    };
    s.orders.set(order.id, order);
    return done(reply(201, {
      id: order.id, status: "PAYER_ACTION_REQUIRED",
      links: [{ rel: "payer-action", method: "GET", href: `${order.appOrigin}/sim/paypal/approve?token=${order.id}` }],
    }));
  }

  if (method === "POST" && (m = pathname.match(/^\/v2\/checkout\/orders\/([^/]+)\/authorize$/))) {
    const o = s.orders.get(m[1]);
    if (!o) return done(fail(404, "RESOURCE_NOT_FOUND", "INVALID_RESOURCE_ID", "The specified resource does not exist."));
    if (o.status === "COMPLETED") return done(fail(422, "UNPROCESSABLE_ENTITY", "ORDER_ALREADY_AUTHORIZED", "Order already authorized."));
    if (o.status !== "APPROVED") return done(fail(422, "UNPROCESSABLE_ENTITY", "ORDER_NOT_APPROVED", "Payer has not yet approved the Order for payment."));
    const now = simNow();
    const a: Auth = { id: id("AUTH"), status: "CREATED", amount: o.amount, created: now, honorEnds: now + 3 * DAY, validEnds: now + 29 * DAY };
    s.auths.set(a.id, a);
    o.status = "COMPLETED";
    return done(reply(201, {
      id: o.id, status: "COMPLETED",
      purchase_units: [{ payments: { authorizations: [{ id: a.id, status: a.status, amount: a.amount, create_time: iso(a.created), expiration_time: iso(a.validEnds) }] } }],
    }));
  }

  if (method === "GET" && (m = pathname.match(/^\/v2\/payments\/authorizations\/([^/]+)$/))) {
    const a = s.auths.get(m[1]);
    if (!a) return fail(404, "RESOURCE_NOT_FOUND", "INVALID_RESOURCE_ID", "The specified resource does not exist.");
    return reply(200, { id: a.id, status: simNow() > a.validEnds && a.status === "CREATED" ? "EXPIRED" : a.status, amount: a.amount, expiration_time: iso(a.validEnds) });
  }

  if (method === "POST" && (m = pathname.match(/^\/v2\/payments\/authorizations\/([^/]+)\/(capture|void|reauthorize)$/))) {
    const a = s.auths.get(m[1]);
    if (!a) return done(fail(404, "RESOURCE_NOT_FOUND", "INVALID_RESOURCE_ID", "The specified resource does not exist."));
    const now = simNow();
    if (m[2] === "void") {
      if (a.status === "CAPTURED") return done(fail(422, "UNPROCESSABLE_ENTITY", "AUTHORIZATION_ALREADY_CAPTURED", "Authorization already captured."));
      a.status = "VOIDED";
      return done(reply(204, {}));
    }
    if (a.status === "VOIDED") return done(fail(422, "UNPROCESSABLE_ENTITY", "AUTHORIZATION_VOIDED", "A voided authorization cannot be used."));
    if (m[2] === "capture") {
      if (a.status === "CAPTURED") return done(fail(422, "UNPROCESSABLE_ENTITY", "AUTHORIZATION_ALREADY_CAPTURED", "Authorization has already been captured."));
      if (now > a.validEnds) return done(fail(422, "UNPROCESSABLE_ENTITY", "AUTHORIZATION_EXPIRED", "The authorization has expired."));
      if (now > a.honorEnds) return done(fail(422, "UNPROCESSABLE_ENTITY", "HONOR_PERIOD_ELAPSED", "Simulator (strict): reauthorize before capturing after the 3-day honor period."));
      const cap = id("CAP");
      s.captures.add(cap);
      a.status = "CAPTURED";
      return done(reply(201, { id: cap, status: "COMPLETED", amount: a.amount, final_capture: true }));
    }
    // reauthorize
    if (now > a.validEnds) return done(fail(422, "UNPROCESSABLE_ENTITY", "AUTHORIZATION_EXPIRED", "The authorization has expired."));
    if (now <= a.honorEnds) return done(fail(400, "REAUTHORIZATION_NOT_ALLOWED", "REAUTHORIZATION_NOT_ALLOWED", "Reauthorization is not allowed inside the 3-day honor period."));
    const next: Auth = { ...a, id: id("AUTH"), status: "CREATED", created: now, honorEnds: Math.min(now + 3 * DAY, a.validEnds) };
    s.auths.set(next.id, next);
    return done(reply(201, { id: next.id, status: "CREATED", amount: next.amount, expiration_time: iso(next.validEnds) }));
  }

  if (method === "POST" && pathname === "/v1/payments/payouts") {
    const hdr = body.sender_batch_header?.sender_batch_id as string | undefined;
    const item = body.items?.[0];
    if (!hdr || !item?.receiver || !item?.amount?.value) {
      return done(fail(400, "INVALID_REQUEST", "MALFORMED_REQUEST_JSON", "Request is not well-formed."));
    }
    if (s.batchKeys.has(hdr)) return done(fail(400, "DUPLICATE_BATCH", "DUPLICATE_SENDER_BATCH_ID", "Simulator: sender_batch_id already used."));
    s.batchKeys.add(hdr);
    const b: Batch = { id: id("PAYOUT"), senderBatchId: hdr, items: [{ receiver: item.receiver, amount: item.amount }], polls: 0 };
    s.batches.set(b.id, b);
    return done(reply(201, { batch_header: { payout_batch_id: b.id, batch_status: "PENDING" } }));
  }

  if (method === "GET" && (m = pathname.match(/^\/v1\/payments\/payouts\/([^/]+)$/))) {
    const b = s.batches.get(m[1]);
    if (!b) return fail(404, "RESOURCE_NOT_FOUND", "INVALID_RESOURCE_ID", "The specified resource does not exist.");
    b.polls += 1;
    const ok = b.polls > 1; // PENDING on creation, SUCCESS on the next look
    return reply(200, {
      batch_header: { payout_batch_id: b.id, batch_status: ok ? "SUCCESS" : "PENDING" },
      items: [{ transaction_status: ok ? "SUCCESS" : "PENDING" }],
    });
  }

  if (method === "POST" && pathname === "/v1/notifications/verify-webhook-signature") {
    return reply(200, { verification_status: body.transmission_sig === "SIMULATED" ? "SUCCESS" : "FAILURE" });
  }

  return fail(404, "RESOURCE_NOT_FOUND", "INVALID_RESOURCE_ID", `Simulator does not implement ${method} ${pathname}.`);
}
