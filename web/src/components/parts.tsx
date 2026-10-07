import type { Deal, DealEvent } from "@/lib/types";
import {
  ACTOR_LABEL, STATE_META, actorTone, dateOnly, dateTime, eventTitle, money, railPosition, timeLeft,
} from "@/lib/format";

export function StateBadge({ state }: { state: Deal["state"] }) {
  const m = STATE_META[state];
  return <span className={`badge ${m.tone}`}>{m.label}</span>;
}

export function ActorChip({ actor = "system" }: { actor?: DealEvent["actor"] }) {
  const tone = actorTone(actor);
  return <span className={`badge ${tone === "agent" ? "agent" : tone === "human" ? "blue" : tone === "paypal" ? "ok" : ""}`}>{ACTOR_LABEL[actor ?? "system"]}</span>;
}

export function Rail({ state }: { state: Deal["state"] }) {
  const { current, stop, labels } = railPosition(state);
  return (
    <div className="rail" role="list" aria-label="Deal progress">
      {labels.map((label, i) => {
        const cls = i < current ? "done" : i === current ? (stop ? "stop" : "current") : "";
        return (
          <div key={label + i} role="listitem" className={`rail-step ${cls}`} aria-current={i === current ? "step" : undefined}>
            {label}
          </div>
        );
      })}
    </div>
  );
}

export function Timeline({ events }: { events: DealEvent[] }) {
  return (
    <ol className="timeline" aria-label="Deal timeline">
      {[...events].reverse().map((e, i) => (
        <li key={`${e.at}-${e.type}-${i}`} className={`tl-item ${actorTone(e.actor)}`}>
          <div className="tl-title">{eventTitle(e)}</div>
          <div className="tl-meta">
            {ACTOR_LABEL[e.actor ?? "system"]} · {dateTime(e.at)}
          </div>
          {e.detail && e.detail !== eventTitle(e) && <div className="tl-detail">{e.detail}</div>}
        </li>
      ))}
    </ol>
  );
}

export function AgreementCard({ deal }: { deal: Deal }) {
  const a = deal.agreement;
  return (
    <section className="card">
      <div className="spread">
        <h3>Agreement v{a.version}</h3>
        {a.deadline && <span className="small muted">Due {dateOnly(a.deadline)}</span>}
      </div>
      {a.description && <p className="muted">{a.description}</p>}
      <p className="eyebrow">Deliverables</p>
      <ul className="clean">
        {a.deliverables.map((d) => (
          <li key={d}>{d}</li>
        ))}
        {a.deliverables.length === 0 && <li className="muted">None listed</li>}
      </ul>
      <p className="eyebrow" style={{ marginTop: 16 }}>Release conditions</p>
      <ul className="clean">
        {a.acceptanceCriteria.map((c) => {
          const r = deal.verification?.criteria.find((x) => x.criterion === c);
          return (
            <li key={c}>
              <span className={`tick ${r ? (r.met ? "yes" : "no") : "na"}`} aria-label={r ? (r.met ? "met" : "not met") : "not checked"}>
                {r ? (r.met ? "✓" : "✕") : "–"}
              </span>
              <span>
                {c}
                {r && <span className="tl-detail" style={{ display: "block" }}>{r.note}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function VerdictCard({ deal }: { deal: Deal }) {
  const v = deal.verification;
  if (!v) return null;
  const tone = v.verdict === "pass" ? "ok" : v.verdict === "fail" ? "bad" : "warn";
  const label = v.verdict === "pass" ? "Pass" : v.verdict === "fail" ? "Fail" : "Needs a human";
  return (
    <section className={`callout ${tone}`}>
      <div className="spread">
        <strong>Verifier agent: {label}</strong>
        <span className="small">{Math.round(v.confidence * 100)}% confident · {v.verifier === "ai" ? "AI model" : "offline rules"}</span>
      </div>
      <div className="meter" style={{ margin: "8px 0" }} aria-hidden>
        <i style={{ width: `${Math.round(v.confidence * 100)}%`, background: tone === "ok" ? "var(--ok)" : tone === "bad" ? "var(--bad)" : "var(--warn)" }} />
      </div>
      <p style={{ margin: 0 }}>{v.reasoning}</p>
      {v.injectionSuspected && (
        <p className="small" style={{ margin: "8px 0 0" }}>
          ⚠ The evidence contained instructions aimed at the verifier. It was treated as data and escalated.
        </p>
      )}
    </section>
  );
}

export function HoldCard({ deal }: { deal: Deal }) {
  const p = deal.paypal;
  if (!p.authorizedAt) return null;
  const live = ["FUNDS_AUTHORIZED", "EVIDENCE_SUBMITTED", "VERIFIED", "DISPUTED"].includes(deal.state);
  return (
    <section className="card flat">
      <h3>PayPal hold</h3>
      <dl className="facts small">
        <dt>Authorization</dt><dd className="mono">{p.authorizationId}</dd>
        <dt>Honor period</dt><dd>{live ? timeLeft(p.honorEndsAt) : "—"} <span className="muted">(3 days, then reauthorized automatically)</span></dd>
        <dt>Valid until</dt><dd>{dateOnly(p.validUntil)} {live && <span className="muted">· {timeLeft(p.validUntil)}</span>}</dd>
        {!!p.reauthCount && (<><dt>Reauthorized</dt><dd>{p.reauthCount}×</dd></>)}
      </dl>
    </section>
  );
}

export function DealHeader({ deal, role }: { deal: Deal; role: string }) {
  return (
    <header className="deal-head">
      <div>
        <p className="eyebrow">{role}</p>
        <h1 style={{ fontSize: "clamp(1.6rem, 4vw, 2.4rem)" }}>{deal.agreement.title}</h1>
        <div className="row" style={{ marginTop: 10 }}>
          <StateBadge state={deal.state} />
          <span className="small muted mono">#{deal.id.slice(0, 8)}</span>
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div className="amount num">{money(deal.agreement.amount, deal.agreement.currency)}</div>
        <div className="small muted">{{ DRAFT: "proposed", AGREED: "awaiting funds", CAPTURED: "released", REFUNDED: "returned to buyer", EXPIRED: "hold lapsed" }[deal.state as string] ?? "held, not captured"}</div>
      </div>
    </header>
  );
}
