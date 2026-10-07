"use client";

import { useEffect, useState } from "react";
import { money } from "@/lib/format";

interface Order { id: string; amount: { currency_code: string; value: string }; status: string }

/** Stand-in for PayPal's approval screen, shown only when PAYPAL_MODE=simulated. */
export function SimApprove() {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const token = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("token") ?? "";

  useEffect(() => {
    fetch(`/api/sim/paypal/approve?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => (j.order ? setOrder(j.order) : setError(j.error ?? "Unknown order")))
      .catch((e) => setError(String(e)));
  }, [token]);

  const go = async (action: "approve" | "cancel") => {
    const r = await fetch("/api/sim/paypal/approve", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: token, action }),
    });
    const j = await r.json();
    if (j.redirect) window.location.href = j.redirect;
    else setError(j.error ?? "Failed");
  };

  return (
    <main className="wrap page" style={{ maxWidth: 520 }}>
      <div className="callout warn" role="note" style={{ marginBottom: 16 }}>
        <strong>PayPal simulator.</strong> This is a stand-in for PayPal&apos;s approval screen, shown because the app runs with{" "}
        <span className="mono">PAYPAL_MODE=simulated</span>. No PayPal account is involved.
      </div>
      <section className="card">
        <h2>Approve payment</h2>
        {error && <div className="callout bad" role="alert" style={{ marginTop: 12 }}>{error}</div>}
        {order && (
          <>
            <p className="muted" style={{ marginTop: 10 }}>Pay as the simulated sandbox buyer. The amount is <b>authorized, not captured</b>.</p>
            <div className="amount num" style={{ margin: "12px 0" }}>{money(order.amount.value, order.amount.currency_code)}</div>
            <div className="row">
              <button className="btn primary" onClick={() => go("approve")}>Approve as simulated buyer</button>
              <button className="btn ghost" onClick={() => go("cancel")}>Cancel</button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
