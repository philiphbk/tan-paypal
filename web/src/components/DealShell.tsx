"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, useDeal } from "@/lib/client";
import { absorbKeyFromUrl, heldRoles, type Role } from "@/lib/keys";
import type { Deal } from "@/lib/types";
import { AgreementCard, DealHeader, HoldCard, Rail, Timeline, VerdictCard } from "./parts";
import { BuyerPanel } from "./BuyerPanel";
import { SellerPanel } from "./SellerPanel";
import { ReviewerPanel } from "./ReviewerPanel";
import { SharePanel } from "./SharePanel";
import { EvidenceCard } from "./EvidenceCard";

export interface PanelProps {
  deal: Deal;
  busy: boolean;
  held: Role[];
  act: (fn: () => Promise<unknown>) => Promise<void>;
}

const ROLE_LABEL: Record<Role, string> = { buyer: "Buyer view", seller: "Seller view", reviewer: "Reviewer view" };

/** Reads any ?k= access link from the URL before the deal is first requested. */
export function DealShell({ id, role }: { id: string; role: Role }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    absorbKeyFromUrl(id);
    setReady(true);
  }, [id]);
  if (!ready) return <main className="wrap page"><div className="skeleton" style={{ width: "40%", height: 40 }} /></main>;
  return <DealView id={id} role={role} />;
}

function DealView({ id, role }: { id: string; role: Role }) {
  const { deal, error, setError, busy, act } = useDeal(id);
  const returned = useRef(false);
  const held = heldRoles(id);

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
        {error ? (
          <div className="callout bad" role="alert">
            <strong>{error}</strong>
            <p className="small" style={{ margin: "6px 0 0" }}>
              Deals are private. Open the link you were given for this deal (it ends in <span className="mono">?k=…</span>), or{" "}
              <Link href="/">start a new deal</Link>.
            </p>
          </div>
        ) : (
          <div className="stack"><div className="skeleton" style={{ width: "40%", height: 40 }} /><div className="skeleton" /><div className="skeleton" style={{ width: "70%" }} /></div>
        )}
      </main>
    );
  }

  const has = held.includes(role);
  const props: PanelProps = { deal, busy, act, held };
  const others = (["buyer", "seller", "reviewer"] as Role[]).filter((r) => r !== role && held.includes(r));
  return (
    <main className="wrap page">
      <DealHeader deal={deal} role={ROLE_LABEL[role]} />
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
          {!has && (
            <section className="callout warn" role="status">
              <strong>You&apos;re viewing this deal read-only.</strong>
              <p className="small" style={{ margin: "4px 0 0" }}>
                Acting as the {role} needs the {role} link. Actions will be refused without it.
              </p>
            </section>
          )}
          {role === "buyer" && <BuyerPanel {...props} />}
          {role === "seller" && <SellerPanel {...props} />}
          {role === "reviewer" && <ReviewerPanel {...props} />}
          <EvidenceCard deal={deal} />
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
          <SharePanel dealId={id} />
          <div className="row small">
            {others.map((r) => (
              <Link key={r} href={`/deals/${id}/${r}`}>Switch to {r} view →</Link>
            ))}
            <Link href={`/deals/${id}/receipt`}>Receipt</Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
