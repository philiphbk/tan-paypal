/**
 * Minimal PayPal REST client for the sandbox (Orders v2 + webhook verification).
 * Uses fetch directly so there are no SDK version surprises.
 */

const BASE = process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

let cachedToken: { value: string; expiresAt: number } | undefined;

export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }
  const id = requireEnv("PAYPAL_CLIENT_ID");
  const secret = requireEnv("PAYPAL_CLIENT_SECRET");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
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
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.requestId ? { "PayPal-Request-Id": init.requestId } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`PayPal ${path} failed: ${res.status} ${text}`);
  return (text ? JSON.parse(text) : {}) as T;
}

interface PayPalLink {
  href: string;
  rel: string;
  method?: string;
}

/** Create an order with intent AUTHORIZE so funds are reserved, not captured. */
export async function createAuthorizeOrder(args: {
  dealId: string;
  amount: string;
  currency: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
}) {
  const order = await ppFetch<{ id: string; links: PayPalLink[] }>("/v2/checkout/orders", {
    method: "POST",
    requestId: `order-${args.dealId}`,
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
    { method: "POST", requestId: `capture-${dealId}`, body: { final_capture: true } },
  );
  return { captureId: res.id, status: res.status };
}

/** Void an authorization (release the hold back to the buyer). */
export async function voidAuthorization(authorizationId: string, dealId: string) {
  await ppFetch(`/v2/payments/authorizations/${authorizationId}/void`, {
    method: "POST",
    requestId: `void-${dealId}`,
  });
}

/** Verify a webhook using PayPal's verify-webhook-signature endpoint. */
export async function verifyWebhook(headers: Headers, rawBody: string): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
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
