"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { getReviewerKey, heldRoles, setReviewerKey } from "@/lib/keys";
import { dateTime, money } from "@/lib/format";
import type { Deal } from "@/lib/types";

/** Everything waiting on a human decision, among the deals this browser may see. */
export function ReviewQueue() {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [key, setKey] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const { deals } = await api<{ deals: Deal[] }>("/api/deals");
      setDeals(deals);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    setKey(getReviewerKey());
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const queue = (deals ?? []).filter((d) => d.state === "DISPUTED");
  const waiting = queue.filter((d) => heldRoles(d.id).includes("reviewer") || key);

  return (
    <main className="wrap page">
      <p className="eyebrow">Human review</p>
      <h1 style={{ fontSize: "clamp(1.6rem, 4vw, 2.4rem)" }}>Decisions waiting for a person</h1>
      <p className="muted" style={{ maxWidth: "62ch", marginTop: 10 }}>
        The AI never decides these. Each one is a deal where the verifier wasn&apos;t confident, the evidence tried to instruct it, or the release policy
        withheld payment. Open one to read the evidence and release or refund.
      </p>

      <details className="card flat" style={{ margin: "20px 0" }}>
        <summary>Reviewer key (optional)</summary>
        <p className="small muted" style={{ marginTop: 8 }}>
          If your team runs this instance with a <span className="mono">REVIEWER_KEY</span>, enter it to review every deal. Otherwise you can
          only act on deals whose reviewer link you hold.
        </p>
        <div className="row">
          <input className="input" style={{ maxWidth: 320 }} type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Reviewer key" />
          <button className="btn ghost sm" onClick={() => { setReviewerKey(key); load(); }}>Save</button>
        </div>
      </details>

      {error && <div className="callout bad" role="alert">{error}</div>}
      {deals === null && <div className="skeleton" style={{ height: 90 }} />}
      {deals && queue.length === 0 && <div className="callout ok">The queue is empty. Nothing is waiting for a person.</div>}
      <div className="deal-list">
        {queue.map((d) => {
          const can = waiting.includes(d);
          return (
            <Link key={d.id} href={`/deals/${d.id}/reviewer`} className="card deal-card">
              <div className="spread">
                <span className="badge warn">Needs a decision</span>
                <span className="small muted">{dateTime(d.updatedAt)}</span>
              </div>
              <h3 style={{ margin: "12px 0 4px" }}>{d.agreement.title}</h3>
              <div className="num muted">{money(d.agreement.amount, d.agreement.currency)}</div>
              {d.verification && (
                <p className="small" style={{ margin: "10px 0 0" }}>
                  Verifier: {d.verification.verdict.replace("_", " ")} at {Math.round(d.verification.confidence * 100)}%
                  {d.verification.injectionSuspected ? " · evidence tried to instruct it" : ""}
                </p>
              )}
              {!can && <p className="small muted" style={{ margin: "6px 0 0" }}>Read-only: you don&apos;t hold the reviewer link.</p>}
            </Link>
          );
        })}
      </div>
    </main>
  );
}
