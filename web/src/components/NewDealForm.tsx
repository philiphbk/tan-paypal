"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

interface Draft {
  agreement: { title: string; description: string; amount: string; currency: string; deadline?: string; deliverables: string[]; acceptanceCriteria: string[] };
  source: "ai" | "offline-fallback";
  warnings: string[];
}

const EXAMPLE =
  "I'll design a logo for the Harbour Coffee brand for £150. Deliver SVG and PNG files plus a one-page usage guide, within 7 days. The buyer gets two rounds of revisions.";

const lines = (v: string) => v.split("\n").map((s) => s.trim()).filter(Boolean);

export function NewDealForm({ onCreated }: { onCreated: () => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState<{ source: Draft["source"]; warnings: string[] } | null>(null);
  const [f, setF] = useState<null | { title: string; description: string; amount: string; currency: string; deadline: string; deliverables: string; criteria: string; sellerEmail: string }>(null);

  const draft = async () => {
    setBusy(true); setError("");
    try {
      const r = await api<Draft>("/api/agreements/draft", { description: text });
      const a = r.agreement;
      setF((prev) => ({
        title: a.title, description: a.description, amount: a.amount, currency: a.currency, deadline: a.deadline ?? "",
        deliverables: a.deliverables.join("\n"), criteria: a.acceptanceCriteria.join("\n"), sellerEmail: prev?.sellerEmail ?? "",
      }));
      setInfo({ source: r.source, warnings: r.warnings });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const propose = async () => {
    if (!f) return;
    setBusy(true); setError("");
    try {
      const r = await api<{ deal: { id: string } }>("/api/deals", {
        title: f.title, description: f.description, amount: f.amount, currency: f.currency,
        deadline: f.deadline || undefined, sellerEmail: f.sellerEmail || undefined,
        deliverables: lines(f.deliverables), acceptanceCriteria: lines(f.criteria),
        proposer: info ? "buyer_agent" : "human_buyer",
      });
      onCreated();
      router.push(`/deals/${r.deal.id}/seller`);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };

  const set = (k: keyof NonNullable<typeof f>) => (e: { target: { value: string } }) => setF((p) => (p ? { ...p, [k]: e.target.value } : p));

  return (
    <section className="card" aria-labelledby="new-deal">
      <h2 id="new-deal">Start a deal</h2>
      <p className="muted">Describe it the way you would to a colleague. The buyer agent turns it into an agreement you can edit before proposing.</p>
      <label className="field">
        <span>What are you buying or selling?</span>
        <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLE} />
      </label>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary" disabled={busy || text.trim().length < 10} onClick={draft}>
          {busy && !f ? "Drafting…" : f ? "Redraft agreement" : "Draft the agreement"}
        </button>
        <button className="btn ghost" onClick={() => setText(EXAMPLE)}>Use an example</button>
      </div>
      {error && <div className="callout bad" role="alert" style={{ marginTop: 12 }}>{error}</div>}

      {f && info && (
        <div className="stack" style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
          <div className="row">
            <span className={`badge ${info.source === "ai" ? "agent" : ""}`}>{info.source === "ai" ? "Drafted by the buyer agent (AI)" : "Drafted by offline rules"}</span>
            <span className="small muted">Check every field. This is what the verifier will hold the seller to.</span>
          </div>
          {info.warnings.map((w) => <div key={w} className="callout warn small">{w}</div>)}
          <label className="field"><span>Title</span><input className="input" value={f.title} onChange={set("title")} /></label>
          <div className="form-grid">
            <label className="field"><span>Amount</span><input className="input num" inputMode="decimal" value={f.amount} onChange={set("amount")} /></label>
            <label className="field"><span>Currency</span><input className="input" value={f.currency} maxLength={3} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} /></label>
            <label className="field"><span>Deadline</span><input className="input" type="date" value={f.deadline} onChange={set("deadline")} /></label>
            <label className="field"><span>Seller PayPal email (payout)</span><input className="input" type="email" value={f.sellerEmail} onChange={set("sellerEmail")} placeholder="optional" /></label>
          </div>
          <label className="field"><span>Deliverables (one per line)</span><textarea className="textarea" value={f.deliverables} onChange={set("deliverables")} /></label>
          <label className="field"><span>Release conditions: payment is captured only if all hold (one per line)</span><textarea className="textarea" value={f.criteria} onChange={set("criteria")} /></label>
          <div><button className="btn primary" disabled={busy} onClick={propose}>{busy ? "Proposing…" : "Propose to the seller"}</button></div>
        </div>
      )}
    </section>
  );
}
