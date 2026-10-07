"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { api, useDeal } from "@/lib/client";
import type { Deal } from "@/lib/types";
import { AgreementCard, DealHeader, HoldCard, Rail, Timeline, VerdictCard } from "./parts";
import { BuyerPanel } from "./BuyerPanel";
import { SellerPanel } from "./SellerPanel";

export interface PanelProps {
  deal: Deal;
  busy: boolean;
  act: (fn: () => Promise<unknown>) => Promise<void>;
}

export function DealShell({ id, role }: { id: string; role: "buyer" | "seller" }) {
  const { deal, error, setError, busy, act } = useDeal(id);
  const returned = useRef(false);

  // PayPal sends the buyer back with ?approved=1; finish the authorization once.
  useEffect(() => {
    if (role !== "buyer" || returned.current) return;
    const p = new URLSearchParams(window.location.search);
    if (p.get("approved")) {
      returned.current = true;
      act(async () => {
        await api(`/api/deals/${id}/authorize`, {});
        window.history.replaceState({}, "", `/deals/${id}/buyer`);
      });
    } else if (p.get("cancelled")) {
      returned.current = true;
      setError("You cancelled the PayPal approval. No funds were held.");
      window.history.replaceState({}, "", `/deals/${id}/buyer`);
    }
  }, [role, id, act, setError]);

  if (!deal) {
    return (
      <main className="wrap page">
        {error ? <div className="callout bad">{error}</div> : <div className="stack"><div className="skeleton" style={{ width: "40%", height: 40 }} /><div className="skeleton" /><div className="skeleton" style={{ width: "70%" }} /></div>}
      </main>
    );
  }

  const other = role === "buyer" ? "seller" : "buyer";
  return (
    <main className="wrap page">
      <DealHeader deal={deal} role={role === "buyer" ? "Buyer view" : "Seller view"} />
      <div className="card flat" style={{ marginBottom: 20 }}>
        <Rail state={deal.state} />
      </div>
      {error && (
        <div className="callout bad" role="alert" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}
      <div className="grid-2">
        <div className="stack">
          {role === "buyer" ? <BuyerPanel deal={deal} busy={busy} act={act} /> : <SellerPanel deal={deal} busy={busy} act={act} />}
          <VerdictCard deal={deal} />
          <AgreementCard deal={deal} />
        </div>
        <aside className="stack">
          <section className="card">
            <div className="spread">
              <h3>Live timeline</h3>
              <span className="live">LIVE</span>
            </div>
            <Timeline events={deal.events} />
          </section>
          <HoldCard deal={deal} />
          <div className="row small">
            <Link href={`/deals/${id}/${other}`}>Switch to {other} view →</Link>
            <Link href={`/deals/${id}/receipt`}>Receipt</Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
