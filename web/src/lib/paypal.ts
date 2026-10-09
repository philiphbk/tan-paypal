/**
 * Minimal PayPal REST client for the sandbox (Orders v2 + webhook verification).
 * Uses fetch directly so there are no SDK version surprises.
 */

import { simulatedFetch } from "./fakePaypal";

const BASE = process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";

/** PAYPAL_MODE=simulated swaps the network for the local simulator (see fakePaypal.ts). */
export const isSimulated = () => process.env.PAYPAL_MODE === "simulated";
const send = (url: string, init: RequestInit) => (isSimulated() ? simulatedFetch(url, init) : fetch(url, init));

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing environment variable ${name}. Add your PayPal sandbox credentials to .env.local, or set PAYPAL_MODE=simulated to try the flow without them.`,
    );
  }
  return v;
}

let cachedToken: { value: string; expiresAt: number } | undefined;

export async function getAccessToken(): Promise<string> {
  if (isSimulated()) return "SIM-TOKEN";
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }
  const id = requireEnv("PAYPAL_CLIENT_ID");
  const secret = requireEnv("PAYPAL_CLIENT_SECRET");
  const res = await send(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function ppFetch<T>(
  path: string,
  init: { method?: string; body?: unknown; requestId?: string } = {},
): Promise<T> {
  const token = await getAccessToken();
  const res = await send(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.requestId ? { "PayPal-Request-Id": init.requestId } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(describePayPalError(path, res.status, text));
  return (text ? JSON.parse(text) : {}) as T;
}

/**
 * Turn PayPal's error JSON into one readable line: what was wrong, in which field,
 * and the debug id PayPal support asks for. Falls back to the raw body if it is not JSON.
 */
export function describePayPalError(path: string, status: number, body: string): string {
  try {
    const j = JSON.parse(body) as {
      name?: string; message?: string; debug_id?: string;
      details?: { field?: string; issue?: string; description?: string }[];
    };
    const issues = (j.details ?? [])
      .map((d) => [d.issue, d.field && `at ${d.field}`, d.description && `(${d.description})`].filter(Boolean).join(" "))
      .filter(Boolean)
      .join("; ");
    const head = [j.name, issues].filter(Boolean).join(": ") || j.message || "request failed";
    return `PayPal rejected ${path} (HTTP ${status}). ${head}${j.debug_id ? ` [debug id ${j.debug_id}]` : ""}`;
  } catch {
    return `PayPal ${path} failed: ${status} ${body.slice(0, 300)}`;
  }
}

interface PayPalLink {
  href: string;
  rel: string;
  method?: string;
}

/** Create an order with intent AUTHORIZE so funds are reserved, not captured. */
export async function createAuthorizeOrder(args: {
  dealId: string;
  /** Funding attempt number; a new idempotency key is needed after an expired hold. */
  attempt: number;
  amount: string;
  currency: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
}) {
  const order = await ppFetch<{ id: string; links: PayPalLink[] }>("/v2/checkout/orders", {
    method: "POST",
    requestId: `order-${args.dealId}-${args.attempt}`,
    body: {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: args.dealId,
          custom_id: args.dealId,
          description: args.description.slice(0, 127),
          amount: { currency_code: args.currency, value: args.amount },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: args.returnUrl,
            cancel_url: args.cancelUrl,
            user_action: "PAY_NOW",
          },
        },
      },
    },
  });
  const approveUrl = order.links.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
  return { orderId: order.id, approveUrl };
}

/** After the buyer approves, authorize the order to place the hold. */
export async function authorizeOrder(orderId: string) {
  const res = await ppFetch<{
    status: string;
    purchase_units: { payments: { authorizations: { id: string; status: string; expiration_time?: string }[] } }[];
  }>(`/v2/checkout/orders/${orderId}/authorize`, {
    method: "POST",
    requestId: `authorize-${orderId}`,
  });
  const auth = res.purchase_units[0]?.payments.authorizations[0];
  if (!auth) throw new Error("No authorization returned by PayPal");
  return { authorizationId: auth.id, status: auth.status, expiresAt: auth.expiration_time };
}

/** Capture a previously authorized payment (release funds). */
export async function captureAuthorization(authorizationId: string, dealId: string) {
  const res = await ppFetch<{ id: string; status: string }>(
    `/v2/payments/authorizations/${authorizationId}/capture`,
    { method: "POST", requestId: `capture-${authorizationId}`, body: { final_capture: true } },
  );
  return { captureId: res.id, status: res.status };
}

/**
 * Reauthorize after the 3-day honor period (allowed any time within the 29-day
 * valid period, not inside the honor period). Returns a NEW authorization id and
 * restarts the honor period. See
 * https://developer.paypal.com/docs/checkout/standard/customize/authorization/
 */
export async function reauthorizeAuthorization(args: {
  authorizationId: string;
  attempt: number;
  amount: string;
  currency: string;
}) {
  const res = await ppFetch<{ id: string; status: string; expiration_time?: string }>(
    `/v2/payments/authorizations/${args.authorizationId}/reauthorize`,
    {
      method: "POST",
      // Idempotent per source authorization: retries cannot double-reauthorize.
      requestId: `reauth-${args.authorizationId}-${args.attempt}`,
      body: { amount: { currency_code: args.currency, value: args.amount } },
    },
  );
  return { authorizationId: res.id, status: res.status, expiresAt: res.expiration_time };
}

/** Void an authorization (release the hold back to the buyer). */
export async function voidAuthorization(authorizationId: string, dealId: string) {
  await ppFetch(`/v2/payments/authorizations/${authorizationId}/void`, {
    method: "POST",
    requestId: `void-${authorizationId}`,
  });
}

/** Verify a webhook using PayPal's verify-webhook-signature endpoint. */
export async function verifyWebhook(headers: Headers, rawBody: string): Promise<boolean> {
  const webhookId = isSimulated() ? "SIMULATED" : process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false;
  const res = await ppFetch<{ verification_status: string }>(
    "/v1/notifications/verify-webhook-signature",
    {
      method: "POST",
      body: {
        auth_algo: headers.get("paypal-auth-algo"),
        cert_url: headers.get("paypal-cert-url"),
        transmission_id: headers.get("paypal-transmission-id"),
        transmission_sig: headers.get("paypal-transmission-sig"),
        transmission_time: headers.get("paypal-transmission-time"),
        webhook_id: webhookId,
        webhook_event: JSON.parse(rawBody),
      },
    },
  );
  return res.verification_status === "SUCCESS";
}

/**
 * Payouts v1: send the captured funds on to the seller. Two layers of
 * idempotency: the PayPal-Request-Id header and a unique sender_batch_id.
 */
export async function createPayout(args: {
  dealId: string;
  attempt: number;
  receiverEmail: string;
  amount: string;
  currency: string;
  note: string;
}) {
  const batchKey = `tan-${args.dealId}-${args.attempt}`;
  const res = await ppFetch<{ batch_header: { payout_batch_id: string; batch_status: string } }>(
    "/v1/payments/payouts",
    {
      method: "POST",
      requestId: `payout-${args.dealId}-${args.attempt}`,
      body: {
        sender_batch_header: {
          sender_batch_id: batchKey,
          email_subject: "You have been paid for a verified delivery",
          email_message: args.note.slice(0, 1000),
        },
        items: [
          {
            recipient_type: "EMAIL",
            receiver: args.receiverEmail,
            amount: { value: args.amount, currency: args.currency },
            note: args.note.slice(0, 4000),
            sender_item_id: batchKey,
          },
        ],
      },
    },
  );
  return { batchId: res.batch_header.payout_batch_id, batchStatus: res.batch_header.batch_status };
}

export async function getPayoutBatch(batchId: string) {
  const res = await ppFetch<{
    batch_header: { payout_batch_id: string; batch_status: string };
    items?: { transaction_status?: string }[];
  }>(`/v1/payments/payouts/${batchId}`);
  return {
    batchStatus: res.batch_header.batch_status,
    itemStatus: res.items?.[0]?.transaction_status,
  };
}
