"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { money } from "@/lib/format";
import type { PanelProps } from "./DealShell";

/** The human in the loop: release or refund a deal the AI would not decide alone. */
export function ReviewerPanel({ deal, busy, act }: PanelProps) {
  const [note, setNote] = useState("");
  if (deal.state !== "DISPUTED") {
    return (
      <section className="callout">
        <strong>Nothing to review right now.</strong>
        <p className="small muted" style={{ margin: "4px 0 0" }}>
          Deals appear here when the verifier is not confident enough, or the buyer agent&apos;s release policy withholds payment.{" "}
          <Link href="/review">Back to the queue</Link>
        </p>
      </section>
    );
  }
  const withheld = [...deal.events].reverse().find((e) => e.type === "RELEASE_WITHHELD");
  return (
    <section className="card" style={{ borderColor: "var(--warn)" }}>
      <h3>Your call: release or refund</h3>
      <p className="muted">
        The AI was not confident enough to move {money(deal.agreement.amount, deal.agreement.currency)} on its own. Read the verdict and the
        evidence below, then decide. Your decision is final and goes on the receipt.
      </p>
      {withheld?.detail && <p className="callout warn small">Why it was withheld: {withheld.detail}</p>}
      <label className="field">
        <span>Note (kept on the receipt)</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why you decided this" />
      </label>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary" disabled={busy} onClick={() => act(() => api(`/api/deals/${deal.id}/resolve`, { decision: "release", note }))}>Release payment to seller</button>
        <button className="btn danger" disabled={busy} onClick={() => act(() => api(`/api/deals/${deal.id}/resolve`, { decision: "refund", note }))}>Refund the buyer</button>
      </div>
    </section>
  );
}
