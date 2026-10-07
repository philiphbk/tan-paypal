"use client";

import Link from "next/link";
import { api } from "@/lib/client";
import { honorLapsed } from "@/lib/clientTime";
import { money } from "@/lib/format";
import type { PanelProps } from "./DealShell";

export function BuyerPanel({ deal, busy, act, held }: PanelProps) {
  const fund = () =>
    act(async () => {
      const r = await api<{ approveUrl?: string }>(`/api/deals/${deal.id}/pay`, {});
      if (r.approveUrl) window.location.href = r.approveUrl;
    });

  switch (deal.state) {
    case "DRAFT":
      return (
        <section className="callout">
          <strong>Waiting for the seller.</strong>
          <p className="muted" style={{ margin: "4px 0 10px" }}>
            Your proposal is locked once the seller, or their agent, accepts it. Nothing is charged yet.
          </p>
          <Link className="btn ghost sm" href={`/deals/${deal.id}/seller`}>Open the seller view</Link>
        </section>
      );
    case "AGREED":
      return (
        <section className="card">
          <h3>Hold the funds</h3>
          <p className="muted">
            PayPal will reserve {money(deal.agreement.amount, deal.agreement.currency)} on your account. It is <b>authorized, not captured</b>:
            the seller is paid only when the verifier agent confirms the release conditions are met, and you can always step in.
          </p>
          <button className="btn primary" disabled={busy} onClick={fund}>
            {busy ? "Opening PayPal…" : "Hold funds with PayPal"}
          </button>
          <p className="small muted" style={{ marginTop: 10 }}>Sandbox only. Use a sandbox personal account to approve.</p>
        </section>
      );
    case "FUNDS_AUTHORIZED":
      return (
        <section className="card">
          <h3>Funds are held</h3>
          <p className="muted">Waiting for the seller to submit proof of delivery. The buyer agent releases payment only after a confident, complete pass from the verifier.</p>
          {honorLapsed(deal) && (
            <div className="callout warn" style={{ marginBottom: 10 }}>
              The 3-day honor period has passed. The hold is reauthorized automatically before capture, or you can do it now.
              <div style={{ marginTop: 8 }}>
                <button className="btn sm" disabled={busy} onClick={() => act(() => api(`/api/deals/${deal.id}/reauthorize`, {}))}>Reauthorize hold</button>
              </div>
            </div>
          )}
        </section>
      );
    case "EVIDENCE_SUBMITTED":
      return <section className="callout agent"><strong>Verifier agent is checking the evidence…</strong></section>;
    case "VERIFIED":
    case "CAPTURED":
      return (
        <section className="callout ok">
          <strong>Delivery verified. Payment released.</strong>
          <p style={{ margin: "4px 0 10px" }}>The buyer agent requested release after every condition was met.</p>
          <Link className="btn sm" href={`/deals/${deal.id}/receipt`}>View receipt</Link>
        </section>
      );
    case "DISPUTED":
      return (
        <section className="callout warn">
          <strong>Sent to a human reviewer.</strong>
          <p style={{ margin: "4px 0 10px" }}>
            The AI was not confident enough to release the payment, so a person decides. Your funds stay held, not captured, until they do.
          </p>
          {held.includes("reviewer") && <Link className="btn sm" href={`/deals/${deal.id}/reviewer`}>Open the reviewer view</Link>}
        </section>
      );
    case "EXPIRED":
      return (
        <section className="card" style={{ borderColor: "var(--bad)" }}>
          <h3>The PayPal hold expired</h3>
          <p className="muted">PayPal authorizations last 29 days. The agreement still stands; approve a new hold to continue.</p>
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => act(async () => {
              await api(`/api/deals/${deal.id}/renew`, {});
              const r = await api<{ approveUrl?: string }>(`/api/deals/${deal.id}/pay`, {});
              if (r.approveUrl) window.location.href = r.approveUrl;
            })}
          >
            Hold funds again
          </button>
        </section>
      );
    case "REFUNDED":
      return (
        <section className="callout bad">
          <strong>Refunded.</strong> The hold was voided and your funds were never captured.{" "}
          <Link href={`/deals/${deal.id}/receipt`}>View receipt</Link>
        </section>
      );
  }
}
