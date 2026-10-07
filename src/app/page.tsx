"use client";

import { useCallback, useEffect, useState } from "react";
import type { Deal } from "@/lib/types";

const card = { background: "#fff", border: "1px solid #e3e6ea", borderRadius: 10, padding: 16, marginBottom: 16 } as const;
const btn = { padding: "8px 14px", borderRadius: 8, border: "1px solid #0b5fff", background: "#0b5fff", color: "#fff", cursor: "pointer" } as const;
const input = { width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccd", boxSizing: "border-box", marginBottom: 8 } as const;

async function api<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  return json as T;
}

export default function Home() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ title: "", amount: "25.00", criteria: "" });
  const [evidence, setEvidence] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const { deals } = await api<{ deals: Deal[] }>("/api/deals");
    setDeals(deals);
  }, []);

  // After PayPal redirects back with ?deal=<id>&approved=1, finish the authorization.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const id = p.get("deal");
    (async () => {
      try {
        if (id && p.get("approved")) {
          await api(`/api/deals/${id}/authorize`, {});
          window.history.replaceState({}, "", "/");
        }
        await refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [refresh]);

  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: 24 }}>
      <h1>TAN for PayPal</h1>
      <p>Authorize funds on the PayPal sandbox, let AI verify proof of delivery, then capture or dispute.</p>
      {error && <div style={{ ...card, borderColor: "#d33", color: "#d33" }}>{error}</div>}

      <section style={card}>
        <h2>New deal</h2>
        <input style={input} placeholder="What is being delivered?" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <input style={input} placeholder="Amount (USD)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <textarea style={{ ...input, minHeight: 70 }} placeholder="Acceptance criteria, one per line" value={form.criteria} onChange={(e) => setForm({ ...form, criteria: e.target.value })} />
        <button
          style={btn}
          onClick={() =>
            run(() =>
              api("/api/deals", {
                title: form.title,
                amount: form.amount,
                acceptanceCriteria: form.criteria.split("\n").map((s) => s.trim()).filter(Boolean),
              }),
            )
          }
        >
          Lock agreement
        </button>
      </section>

      {deals.map((d) => (
        <section key={d.id} style={card}>
          <h3 style={{ marginTop: 0 }}>
            {d.agreement.title} — {d.agreement.amount} {d.agreement.currency}{" "}
            <small style={{ color: "#555" }}>[{d.state}]</small>
          </h3>
          <ul>{d.agreement.acceptanceCriteria.map((c) => <li key={c}>{c}</li>)}</ul>

          {d.state === "AGREED" && (
            <button
              style={btn}
              onClick={() =>
                run(async () => {
                  const r = await api<{ approveUrl?: string }>(`/api/deals/${d.id}/pay`, {});
                  if (r.approveUrl) window.location.href = r.approveUrl;
                })
              }
            >
              Pay with PayPal (hold funds)
            </button>
          )}

          {d.state === "FUNDS_AUTHORIZED" && (
            <>
              <textarea style={{ ...input, minHeight: 70 }} placeholder="Seller: paste proof of delivery" value={evidence[d.id] ?? ""} onChange={(e) => setEvidence({ ...evidence, [d.id]: e.target.value })} />
              <button style={btn} onClick={() => run(() => api(`/api/deals/${d.id}/evidence`, { text: evidence[d.id] ?? "" }))}>
                Submit evidence for AI check
              </button>
            </>
          )}

          {d.verification && (
            <p>
              <strong>AI verdict:</strong> {d.verification.verdict} ({d.verification.confidence}) — {d.verification.reasoning}
            </p>
          )}

          {d.state === "DISPUTED" && (
            <>
              <button style={btn} onClick={() => run(() => api(`/api/deals/${d.id}/resolve`, { decision: "release" }))}>Release payment</button>{" "}
              <button style={{ ...btn, background: "#d33", borderColor: "#d33" }} onClick={() => run(() => api(`/api/deals/${d.id}/resolve`, { decision: "dispute" }))}>Refund buyer</button>
            </>
          )}

          <details style={{ marginTop: 8 }}>
            <summary>Timeline</summary>
            <ol>{d.events.map((e, i) => <li key={i}>{e.type}{e.detail ? ` — ${e.detail}` : ""}</li>)}</ol>
          </details>
        </section>
      ))}
    </main>
  );
}
