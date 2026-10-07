"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function Nav() {
  const path = usePathname();
  const [simulated, setSimulated] = useState(false);
  useEffect(() => {
    fetch("/api/demo").then((r) => r.json()).then((j) => setSimulated(j.paypalMode === "simulated")).catch(() => {});
  }, []);
  const link = (href: string, label: string, match: (p: string) => boolean) => (
    <Link href={href} aria-current={match(path) ? "page" : undefined}>{label}</Link>
  );
  return (
    <nav className="nav" aria-label="Main">
      <div className="wrap">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden>TAN</span>
          <span>TAN for PayPal</span>
        </Link>
        {simulated && (
          <span className="badge warn" title="PAYPAL_MODE=simulated: a local stand-in for PayPal, not the real sandbox">PayPal simulator</span>
        )}
        <div className="nav-links">
          {link("/", "Deals", (p) => p === "/" || p.startsWith("/deals"))}
          {link("/review", "Review", (p) => p.startsWith("/review"))}
          {link("/ledger", "Ledger", (p) => p.startsWith("/ledger"))}
        </div>
      </div>
    </nav>
  );
}
