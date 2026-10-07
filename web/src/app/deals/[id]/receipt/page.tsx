import Link from "next/link";
import { notFound } from "next/navigation";
import { getDeal } from "@/lib/store";
import { ACTOR_LABEL, dateOnly, dateTime, eventTitle, money } from "@/lib/format";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

const OUTCOME: Record<string, { stamp: string; tone: "ok" | "bad" | "warn"; line: string }> = {
  CAPTURED: { stamp: "Released", tone: "ok", line: "Payment was captured and released to the seller." },
  REFUNDED: { stamp: "Refunded", tone: "bad", line: "The hold was voided. The buyer was never charged." },
  EXPIRED: { stamp: "Expired", tone: "bad", line: "The PayPal hold expired before the deal completed." },
};

export default function Receipt({ params }: { params: { id: string } }) {
  const deal = getDeal(params.id);
  if (!deal) notFound();
  const o = OUTCOME[deal.state] ?? { stamp: "In progress", tone: "warn" as const, line: "This deal has not reached a final outcome yet." };
  const v = deal.verification;
  const p = deal.paypal;
  const hd = deal.humanDecision;
  const decidedBy = hd ? "A human reviewer overruled the AI recommendation or made the call the AI escalated." : deal.state === "CAPTURED" ? "Released automatically: the verifier agent passed every condition and the buyer agent's release policy approved." : "";

  return (
    <main className="wrap page">
      <article className="receipt" aria-label="Outcome receipt">
        <div className="spread">
          <div>
            <p className="eyebrow">Outcome receipt</p>
            <h1 style={{ fontSize: "1.8rem", marginTop: 6 }}>{deal.agreement.title}</h1>
            <p className="small muted mono">Deal {deal.id}</p>
          </div>
          <span className={`stamp ${o.tone}`}>{o.stamp}</span>
        </div>
        <hr />
        <div className="spread">
          <div>
            <div className="total num">{money(deal.agreement.amount, deal.agreement.currency)}</div>
            <div className="muted">{o.line}</div>
          </div>
          <div className="small muted" style={{ textAlign: "right" }}>
            Opened {dateOnly(deal.createdAt)}<br />Last update {dateTime(deal.updatedAt)}
          </div>
        </div>
        {decidedBy && <p className="callout" style={{ marginTop: 16 }}>{decidedBy}{hd?.note ? <> Note: “{hd.note}”</> : null}</p>}
        <hr />
        <h3>Release conditions</h3>
        <ul className="clean">
          {deal.agreement.acceptanceCriteria.map((c) => {
            const r = v?.criteria.find((x) => x.criterion === c);
            return (
              <li key={c}>
                <span className={`tick ${r ? (r.met ? "yes" : "no") : "na"}`}>{r ? (r.met ? "✓" : "✕") : "–"}</span>
                <span>{c}{r && <span className="tl-detail" style={{ display: "block" }}>{r.note}</span>}</span>
              </li>
            );
          })}
        </ul>
        {v && (
          <p className="small muted" style={{ marginTop: 12 }}>
            Verifier agent ({v.verifier === "ai" ? "AI model" : "offline rules"}): <b>{v.verdict.replace("_", " ")}</b> at {Math.round(v.confidence * 100)}% confidence. {v.reasoning}
          </p>
        )}
        <hr />
        <h3>PayPal references (sandbox)</h3>
        <dl className="facts small">
          <dt>Order</dt><dd className="mono">{p.orderId ?? "—"}</dd>
          <dt>Authorization</dt><dd className="mono">{p.authorizationId ?? "—"}{p.reauthCount ? ` (reauthorized ${p.reauthCount}×)` : ""}</dd>
          <dt>Capture</dt><dd className="mono">{p.captureId ?? "—"}</dd>
          <dt>Seller payout</dt>
          <dd>{deal.payout ? <><span className="mono">{deal.payout.batchId}</span> · {deal.payout.batchStatus.toLowerCase()} · {deal.payout.receiver}</> : "—"}</dd>
        </dl>
        <hr />
        <h3>Audit trail</h3>
        <ol className="timeline" style={{ marginTop: 12 }}>
          {deal.events.map((e, i) => (
            <li key={i} className="tl-item" style={{ animation: "none" }}>
              <div className="tl-title">{eventTitle(e)}</div>
              <div className="tl-meta">{ACTOR_LABEL[e.actor ?? "system"]} · {dateTime(e.at)}</div>
              {e.detail && <div className="tl-detail">{e.detail}</div>}
            </li>
          ))}
        </ol>
        <hr />
        <div className="spread no-print">
          <div className="row small">
            <Link href={`/deals/${deal.id}/buyer`}>Buyer view</Link>
            <Link href={`/deals/${deal.id}/seller`}>Seller view</Link>
          </div>
          <PrintButton />
        </div>
        <p className="small muted" style={{ marginTop: 16 }}>
          Sandbox transaction. No real money moved. The AI recommends; people can always overrule.
        </p>
      </article>
    </main>
  );
}
