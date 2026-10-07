"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { addKeys, forgetDeals, heldRoles } from "@/lib/keys";
import { dateTime, money } from "@/lib/format";
import type { Deal } from "@/lib/types";
import { StateBadge } from "./parts";
import { NewDealForm } from "./NewDealForm";

/** Open a deal in the view that suits its state, among the roles this browser holds. */
function pickRole(d: Deal): string {
  const held = heldRoles(d.id);
  const want = d.state === "DRAFT" ? "seller" : d.state === "DISPUTED" ? "reviewer" : "buyer";
  return held.includes(want) || held.length === 0 ? want : held[0];
}

export function Home() {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [demo, setDemo] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const refresh = useCallback(async () => {
    const { deals } = await api<{ deals: Deal[] }>("/api/deals");
    setDeals(deals);
  }, []);
  useEffect(() => {
    refresh().catch(() => setDeals([]));
    api<{ enabled: boolean }>("/api/demo").then((d) => setDemo(d.enabled)).catch(() => {});
  }, [refresh]);
  const demoAction = async (path: string) => {
    setDemoBusy(true);
    try {
      if (path.endsWith("/seed")) {
        const r = await api<{ keys: Record<string, { buyer: string; seller: string; reviewer: string }> }>(path, {});
        Object.entries(r.keys).forEach(([id, k]) => addKeys(id, k));
      } else {
        const before = deals?.map((d) => d.id) ?? [];
        await api(path, {});
        forgetDeals(before);
      }
      await refresh();
    } finally {
      setDemoBusy(false);
    }
  };

  return (
    <main className="wrap page">
      <section className="hero">
        <p className="eyebrow">AI-assured checkout · PayPal sandbox</p>
        <h1 style={{ marginTop: 10 }}>
          Pay when the work is <em>proven</em>, not promised.
        </h1>
        <p className="lede">
          Funds are held on PayPal, never captured up front. An AI verifier checks the seller&apos;s proof against the agreement, and
          payment is released only when every condition is met. Anything uncertain goes to a human.
        </p>
        <div className="steps">
          <div className="step"><b>Agree</b><span>Plain English becomes checkable conditions.</span></div>
          <div className="step"><b>Hold</b><span>PayPal authorizes the funds. Nothing is captured.</span></div>
          <div className="step"><b>Prove</b><span>The seller submits evidence of delivery.</span></div>
          <div className="step"><b>Verify</b><span>An AI agent checks each condition.</span></div>
          <div className="step"><b>Release</b><span>Capture on a confident pass, else a human decides.</span></div>
        </div>
      </section>

      <NewDealForm onCreated={refresh} />

      <section style={{ marginTop: 48 }}>
        <div className="spread" style={{ marginBottom: 16 }}>
          <h2>Recent deals</h2>
          <Link href="/ledger" className="small">Open the full ledger →</Link>
        </div>
        {deals === null && <div className="skeleton" style={{ height: 90 }} />}
        {deals?.length === 0 && (
          <div className="callout">No deals yet. Describe one above to see the whole flow.</div>
        )}
        <div className="deal-list">
          {deals?.slice(0, 9).map((d) => (
            <Link key={d.id} href={`/deals/${d.id}/${pickRole(d)}`} className="card deal-card">
              <div className="spread">
                <StateBadge state={d.state} />
                <span className="small muted">{dateTime(d.updatedAt)}</span>
              </div>
              <h3 style={{ margin: "12px 0 4px" }}>{d.agreement.title}</h3>
              <div className="num muted">{money(d.agreement.amount, d.agreement.currency)}</div>
            </Link>
          ))}
        </div>
      </section>

      {demo && (
        <section className="callout" style={{ marginTop: 40 }} aria-label="Demo tools">
          <div className="spread">
            <div>
              <strong>Demo tools</strong>
              <div className="small muted">Sample deals are public, labelled SEED- and never touch PayPal. Reset removes the samples and your own deals only.</div>
            </div>
            <div className="row">
              <button className="btn ghost sm" disabled={demoBusy} onClick={() => demoAction("/api/demo/seed")}>Load sample deals</button>
              <button className="btn ghost sm" disabled={demoBusy} onClick={() => demoAction("/api/demo/reset")}>Reset all deals</button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
