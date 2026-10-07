"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav() {
  const path = usePathname();
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
        <div className="nav-links">
          {link("/", "Deals", (p) => p === "/" || p.startsWith("/deals"))}
          {link("/ledger", "Ledger", (p) => p.startsWith("/ledger"))}
        </div>
      </div>
    </nav>
  );
}
