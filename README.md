# TAN for PayPal: AI-assured checkout

**Money should move when a deal's conditions are met, not before.**

TAN adds a verification step to PayPal checkout. The buyer's funds are *authorized, not captured*. The seller submits proof of delivery. An AI verifier checks it against a locked agreement. Payment is captured only on a confident, complete pass. Anything uncertain goes to a human, who can release or refund. **The AI recommends; people can always overrule it.**

Built for the PayPal AI Hackathon. Everything runs on the **PayPal sandbox**. No real money moves.

- Demo video: _add YouTube link before submitting_
- Hosted demo: _add Render URL before submitting_

## How it works

| Step | What happens | Who acts |
| --- | --- | --- |
| 1. Agree | Free text becomes a structured agreement: deliverables, checkable release conditions, deadline, amount. | Buyer agent (LLM + validation) |
| 2. Accept | The proposal is reviewed and locked. Vague, unpriced or already-late terms are declined. | Seller agent or the seller |
| 3. Hold | PayPal Orders v2 with `intent=AUTHORIZE`. Funds are reserved, not captured. | Buyer + PayPal |
| 4. Prove | Seller submits evidence of delivery. | Seller or seller agent |
| 5. Verify | Each release condition is judged against the evidence. | Verifier agent |
| 6. Release | A single policy gate decides if money may move. Pass: capture, then pay the seller out via the Payouts API. Otherwise: `DISPUTED`. | Buyer agent, else a human reviewer |
| 7. Receipt | Outcome receipt with every decision, actor and PayPal reference. | |

Every action on the live timeline is attributed to the actor that took it: buyer agent, seller agent, verifier agent, a human, or PayPal.

### The human-override principle

- The verifier only recommends. It cannot move money.
- One function (`buyerAgentReleasePolicy` in [`web/src/lib/agents.ts`](web/src/lib/agents.ts)) is the only path from a verdict to a capture. It requires a `pass`, confidence of at least 0.7, **every** criterion met, no injection flag, on-time evidence, and an amount within the buyer agent's mandate (default 500).
- Anything else lands in `DISPUTED`, where a human releases or refunds.
- All state changes go through one state machine (`transition()`), so illegal jumps such as capturing before verification cannot happen.

### Evidence is untrusted input

The seller is paid if the verifier says yes, so the evidence is an attack surface. Defences:

1. Evidence and agreement text are fenced in tagged blocks, and closing tags inside them are neutralised.
2. The model is told evidence is data, and must flag evidence that addresses it.
3. Output is forced into a tool-call schema and **re-validated server-side**: the criteria list is re-anchored to the agreement's own criteria, and a `pass` with any unmet criterion is downgraded.
4. A regex pre-filter catches the obvious attacks ("ignore previous instructions", fake `"verdict":` JSON). Flagged evidence is forced to `needs_human`.

The seller view has a *Prompt-injection attempt* sample under demo helpers so you can watch this happen.

### Who can do what: access links

There are no passwords. Creating a deal issues three secret links, one per role: **buyer**, **seller** and **reviewer**. Only their hashes are stored, in a table separate from the deal, so a deal's JSON can never leak them.

| Action | Needs |
| --- | --- |
| Accept the proposal, submit evidence | seller link |
| Hold funds, reauthorize, re-fund an expired hold | buyer link |
| **Release or refund a disputed deal** | **reviewer link** (or the instance's `REVIEWER_KEY`) |
| Read a deal, its receipt or its evidence images | any of the three |

Lists, the ledger and the receipt only show deals you hold a link for. The sample deals are public read-only. Share a link from a deal's *Invite someone* panel. In this demo the creator's browser holds all three, so one person can walk through every role; in real use you would send each link to its own party.

### Reviewer queue

`/review` lists every deal waiting on a person: the verifier wasn't confident, the evidence tried to instruct it, or the release policy withheld payment. Open one to read the evidence (text, images, links) and the verdict, then release or refund with a note that goes on the receipt.

### Rate limits and cost caps

Per-IP limits (AI endpoints 10/min, writes 40/min, deal creation 20/hour, uploads 10/min), JSON body caps, and a hard daily ceiling on model calls (`LLM_DAILY_CAP`, default 300) after which the offline rules take over. Limits are in-memory, which is right for one instance; a multi-instance deployment would move them to Redis.

### Evidence beyond text

Sellers can attach up to 3 images and cite links. Images are identified by their magic bytes (not their claimed type), resized in the browser, stored apart from the deal, served only to link holders with a locked-down content policy, and shown to the vision model as untrusted. Links are recorded for the reviewer and are **not opened** by default. Setting `EVIDENCE_FETCH_LINKS=1` lets the verifier read them, behind SSRF guards re-checked on every redirect hop (see the notes in `web/src/lib/linkFetch.ts` before enabling it on a host that can reach private networks).

## PayPal APIs used

- **Orders v2**: create (`AUTHORIZE`), authorize
- **Payments v2**: capture, void, **reauthorize**, authorization details
- **Payouts v1**: pay the seller out after capture (freelance scenario)
- **Webhooks**: signature verification, idempotent handling, and they change deal state: a hold voided outside the app expires the deal, a reversed capture or a bounced payout is flagged on the timeline, and payout status updates land on the receipt
- Every PayPal write carries a `PayPal-Request-Id` idempotency key (per deal, per funding attempt, per authorization).

### Authorization expiry

From the [PayPal docs](https://developer.paypal.com/docs/checkout/standard/customize/authorization/): the **honor period is 3 days** (capture is guaranteed) and the **valid period is 29 days**. Reauthorization is allowed only *after* the honor period and gives a new authorization ID.

- Before every capture the app reauthorizes if the honor period has lapsed.
- If the 29 days pass, the deal moves to `EXPIRED`. The agreement stands and the buyer can approve a new hold (new idempotency key).
- A background sweep (every 10 minutes, plus `/api/cron/sweep` behind `CRON_SECRET` for an external scheduler) expires holds nobody opens.
- With `DEMO_MODE=1`, `POST /api/deals/:id/simulate-time` ages the *local* clocks to show these paths. With the real sandbox, PayPal's own clocks are unaffected, so a real reauthorize call inside PayPal's honor period is still refused by PayPal. With the simulator the simulator's clock moves too.

## Run it

Requires Node 20.9+ (22 recommended).

```bash
git clone <this repo>
cd tan-paypal/web
npm install
cp .env.example .env.local
npm run dev            # http://localhost:3000
```

**With no credentials at all** the app starts, the AI features use deterministic offline rules, and *Load sample deals* on the home page fills the ledger so you can explore every screen.

**To run the whole flow without PayPal credentials**, set `PAYPAL_MODE=simulated` in `.env.local`. The app then talks to a local stand-in for PayPal (`web/src/lib/fakePaypal.ts`) that enforces the rules this app depends on: approval before authorization, the 3-day honor period, 29-day validity, reauthorization timing, and `PayPal-Request-Id` idempotency. It is clearly labelled in the UI (a "Simulator" badge and a banner on the approval page) and exists for evaluation and for the end-to-end tests. **It is not PayPal.** The real submission path is the sandbox:

1. Create a free account at https://developer.paypal.com/ and open **Apps & Credentials** (Sandbox).
2. Create a REST app. Enable **Payouts** on it. Copy the client ID and secret into `web/.env.local`.
3. In the sandbox accounts list, note a **personal** account (the buyer) and a second account whose email will receive payouts (the seller).
4. *(Optional)* Add a webhook for `<APP_BASE_URL>/api/webhooks/paypal` and set `PAYPAL_WEBHOOK_ID`. Locally this needs a tunnel.
5. *(Optional)* Set `ANTHROPIC_API_KEY` for the AI drafter and verifier.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Sandbox REST app credentials |
| `PAYPAL_API_BASE` | Defaults to `https://api-m.sandbox.paypal.com` |
| `PAYPAL_WEBHOOK_ID` | Enables webhook signature verification |
| `APP_BASE_URL` | Public URL for PayPal return links (Render's URL is used if unset) |
| `ANTHROPIC_API_KEY`, `AI_MODEL` | AI drafter and verifier; offline rules if blank |
| `BUYER_AGENT_MAX_AMOUNT` | Largest amount the buyer agent may release without a human |
| `DEMO_MODE` | `1` shows sample-data, reset and time-shift tools |
| `DATABASE_PATH` | SQLite file, default `web/data/tan.db` |
| `PAYPAL_MODE` | `simulated` runs against the local PayPal stand-in; blank uses the real sandbox |
| `REVIEWER_KEY` | Optional: grants the reviewer role on every deal |
| `LLM_DAILY_CAP` | Hard daily ceiling on AI calls (default 300) |
| `EVIDENCE_FETCH_LINKS` | `1` lets the verifier open links in evidence (SSRF risk; off by default) |
| `CRON_SECRET` | Enables `/api/cron/sweep` for an external scheduler |

Secrets live in `.env.local`, which is git-ignored. Never commit them.

### Tests

```bash
cd web && npm test
```

71 tests, all offline and credential-free:

- **Unit:** the state machine, the release policy (every way a verdict can fail to release money), the injection defences, the agreement validator, the expiry windows, webhook handling, the sweeper, evidence file validation and the SSRF guards.
- **Route-level:** access control against the real handlers (a buyer link cannot resolve a dispute, a token for one deal is useless on another) and rate limits.
- **End to end:** nine scenarios driving the real routes, store and PayPal client against the simulator: happy path with payout, injection never auto-releases, reviewer refund voids the hold, reauthorization after the honor period, expiry and re-funding, webhooks, image evidence, and rate limiting. Breaking the reviewer-only rule or the pre-capture reauthorization makes them fail.

### A 3-minute walkthrough

1. Home: describe a deal in plain English, review the drafted agreement, propose it.
2. Seller view: *Seller agent: review & accept*.
3. Buyer view: *Hold funds with PayPal*, approve with the sandbox buyer. Funds are held, not captured.
4. Seller view: submit evidence (try *Strong evidence*, then a fresh deal with *Prompt-injection attempt*).
5. Watch the live timeline: verdict, release policy, capture, payout.
6. Open the receipt, then the **Ledger** (AG Grid: transactions, evidence & verdicts, audit trail, CSV export).

## Postman

Import [`postman/tan-paypal-sandbox.postman_collection.json`](postman/tan-paypal-sandbox.postman_collection.json). It has two folders: the app's API in flow order, and the underlying PayPal sandbox calls (token, order, authorize, reauthorize, capture, void, payout). Set `paypalClientId` and `paypalClientSecret` as collection variables with sandbox values only.

## Deploy to Render

[`render.yaml`](render.yaml) is a Blueprint. In Render choose **New → Blueprint**, point it at this repo, and fill in the secrets it asks for (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, optionally `PAYPAL_WEBHOOK_ID` and `ANTHROPIC_API_KEY`). The free plan's disk is ephemeral, so the SQLite database resets on redeploy; use *Load sample deals* to refill it, or attach a disk (see comments in the file).

## Architecture

```
web/src
  lib/stateMachine.ts      all deal transitions
  lib/agents.ts            agent mandates: seller review, buyer release policy
  lib/verifier.ts          verifier agent (LLM + offline), injection defences
  lib/agreementBuilder.ts  free text -> validated agreement
  lib/expiry.ts            honor period, reauthorization, EXPIRED
  lib/payout.ts            seller payout after capture
  lib/paypal.ts            PayPal REST client (fetch, idempotency keys)
  lib/store.ts             SQLite store with per-deal locking
  lib/access.ts            capability links (buyer, seller, reviewer)
  lib/rateLimit.ts         per-IP limits; llm.ts holds the daily AI budget
  lib/webhookHandler.ts    applies PayPal webhooks to deal state
  lib/sweeper.ts           scheduled expiry sweep
  lib/fakePaypal.ts        the opt-in PayPal simulator
  lib/evidenceFiles.ts     image/link validation; linkFetch.ts is the SSRF-guarded fetcher
  app/api/**               routes
  app/deals/[id]/**        buyer, seller, reviewer and receipt pages
  app/review               reviewer queue
  app/ledger               AG Grid ledger
```

Stack: Next.js 16 (App Router), TypeScript, SQLite (better-sqlite3), AG Grid Community. No UI framework; the design system is plain CSS with light and dark themes.

## How this was built during the submission period

The repository's history is the record. The first commit is dated 2026-10-07 and each step below is its own commit.

1. Scaffold: state machine, PayPal sandbox client, verifier, API routes.
2. Agreement builder with validation and an offline fallback.
3. Buyer, seller and verifier agent roles with an actor-attributed timeline and a single release policy.
4. Authorization expiry: honor-period reauthorization and `EXPIRED` re-funding, written from the PayPal docs.
5. Payouts API integration for the freelance scenario.
6. SQLite persistence with per-deal locking.
7. UI pass: buyer and seller views, live timeline, receipt, AG Grid ledger.
8. Submission readiness: demo seed and reset, Render Blueprint, Postman collection, this README.
9. Hardening and extras: per-deal access links and a reviewer role, rate limits and an AI cost cap, webhook-driven state and a scheduled expiry sweep, a PayPal simulator with end-to-end tests, image and link evidence, a reviewer queue, and a mobile and contrast pass checked with real screenshots and computed WCAG ratios.

The project was developed with Claude Code (Anthropic) as a coding assistant, and the product itself uses an LLM for agreement drafting and evidence verification.

## Limitations

- Sandbox only. Access is by secret link, not by account: whoever holds a link holds that role. There is no sign-in, no password reset and no way to revoke a link. A production version would bind each action to an authenticated party and email the links.
- The creator's browser holds all three links so one person can demo every role.
- Rate limits and the AI budget are in-memory and per instance.
- The offline verifier is keyword matching, a demo fallback and not a substitute for the AI verifier. It does not look at images.
- The PayPal simulator is an approximation written from PayPal's documentation. Where it is stricter than PayPal (it refuses a capture after the honor period), that is deliberate so the reauthorization path is exercised. Confirm behaviour on the real sandbox.
- Payout requires Payouts to be enabled on the sandbox app.
- The DNS-rebinding window in link fetching is documented in `linkFetch.ts`; keep `EVIDENCE_FETCH_LINKS` off unless that is acceptable.

## License

MIT. See [LICENSE](LICENSE).
