"use client";

import { useState } from "react";
import { heldRoles, shareLink, type Role } from "@/lib/keys";

/** Copyable access links for each role this browser holds. */
export function SharePanel({ dealId }: { dealId: string }) {
  const [copied, setCopied] = useState<Role | null>(null);
  const roles = heldRoles(dealId);
  if (roles.length === 0) return null;
  const copy = async (r: Role) => {
    const link = shareLink(dealId, r);
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(r);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Copy this link", link);
    }
  };
  return (
    <section className="card flat">
      <h3>Invite someone</h3>
      <p className="small muted">
        Each link grants one role on this deal and nothing else. Whoever holds the seller link can act as the seller. Share it only with them.
      </p>
      <div className="row">
        {roles.map((r) => (
          <button key={r} className="btn ghost sm" onClick={() => copy(r)}>
            {copied === r ? "Copied ✓" : `Copy ${r} link`}
          </button>
        ))}
      </div>
    </section>
  );
}
