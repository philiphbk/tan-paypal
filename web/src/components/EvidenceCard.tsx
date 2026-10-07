"use client";

import { useEffect, useState } from "react";
import { keysHeader } from "@/lib/keys";
import { dateTime } from "@/lib/format";
import type { Deal } from "@/lib/types";

/** Fetches a private attachment with the caller's access links, since <img> cannot send headers. */
function AuthImage({ dealId, id, name }: { dealId: string; id: string; name: string }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let url = "";
    let alive = true;
    fetch(`/api/deals/${dealId}/attachments/${id}`, { headers: { "x-deal-keys": keysHeader() } })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => { if (alive) { url = URL.createObjectURL(b); setSrc(url); } })
      .catch(() => alive && setFailed(true));
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [dealId, id]);
  if (failed) return <span className="small muted">Could not load {name}</span>;
  if (!src) return <div className="skeleton" style={{ width: 160, height: 110 }} />;
  return (
    <a href={src} target="_blank" rel="noreferrer" title={name}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={`Evidence: ${name}`} style={{ maxWidth: 220, maxHeight: 160, borderRadius: 8, border: "1px solid var(--line)" }} />
    </a>
  );
}

/** What the seller submitted: text, images and cited links. */
export function EvidenceCard({ deal }: { deal: Deal }) {
  const e = deal.evidence;
  if (!e) return null;
  return (
    <section className="card flat" aria-label="Submitted evidence">
      <div className="spread">
        <h3>Evidence</h3>
        <span className="small muted">{dateTime(e.submittedAt)}</span>
      </div>
      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: "10px 0 0", font: "inherit" }}>{e.text}</pre>
      {!!e.attachments?.length && (
        <div className="row" style={{ marginTop: 12, alignItems: "flex-start" }}>
          {e.attachments.map((a) => <AuthImage key={a.id} dealId={deal.id} id={a.id} name={a.name} />)}
        </div>
      )}
      {!!e.links?.length && (
        <ul className="clean" style={{ marginTop: 12 }}>
          {e.links.map((l) => (
            <li key={l.url}>
              <span className={`badge ${l.status === "fetched" ? "ok" : l.status === "recorded" ? "" : "warn"}`}>
                {l.status === "recorded" ? "not opened" : l.status}
              </span>
              <span style={{ wordBreak: "break-all" }}>
                {/* Seller-supplied: shown as text, not linked, so nobody clicks through by accident. */}
                <span className="mono">{l.url}</span>
                {l.note && l.status !== "recorded" && <span className="tl-detail" style={{ display: "block" }}>{l.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
