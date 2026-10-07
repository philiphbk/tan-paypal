# TAN for PayPal — AI-assured checkout

Built for the PayPal AI Hackathon during the submission period (Oct 1 – Nov 12, 2026).

Money should move when a deal's conditions are met, not before. This app sits on top of the **PayPal sandbox** and adds a verification step in the middle of checkout:

1. **Agreement** — a deal is turned into a structured, versioned agreement (deliverables, deadline, acceptance criteria, amount).
2. **Hold** — the buyer approves a PayPal order created with `intent=AUTHORIZE`, so funds are reserved, not captured.
3. **Evidence** — the seller submits proof of delivery.
4. **AI verification** — an AI verifier checks the evidence against the agreement and returns `pass`, `fail` or `needs_human`, with reasoning and confidence.
5. **Release or dispute** — on `pass` the authorization is captured. Otherwise the deal is flagged for a human, who can overrule the AI either way.
6. **Receipt** — an outcome receipt is built from the deal's event log and PayPal webhook events.

## PayPal APIs used

- Orders v2: create (`AUTHORIZE`), authorize, capture the authorization
- Webhooks: signature verification and idempotent event handling
- Payouts (planned): pay the seller out in the freelance scenario

## Status

Scaffold: state machine, store, PayPal client, API routes and a minimal UI. See the roadmap below.

## Setup

Requires Node 18.18+.

```bash
npm install
cp .env.example .env.local   # fill in sandbox credentials
npm run dev
```

1. Create a free account at https://developer.paypal.com/ and open the sandbox dashboard.
2. Create a REST app, and copy its client ID and secret into `.env.local`.
3. Use the sandbox **personal (buyer)** account to approve payments.
4. (Optional) Add a webhook pointing at `<APP_BASE_URL>/api/webhooks/paypal` and set `PAYPAL_WEBHOOK_ID`. For local development, use a tunnel.
5. (Optional) Set `ANTHROPIC_API_KEY` for the AI verifier. Without it, a deterministic offline verifier is used so the flow still runs end to end.

## Roadmap

- [ ] Agreement builder (free text to structured JSON)
- [ ] Payouts to the seller
- [ ] Authorization expiry and reauthorization handling
- [ ] Buyer and seller views with a live timeline
- [ ] Outcome receipt page
- [ ] AG Grid transaction ledger
- [ ] Deploy to Render

## License

MIT. See [LICENSE](LICENSE).
