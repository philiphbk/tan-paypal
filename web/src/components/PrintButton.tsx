"use client";

export function PrintButton() {
  return <button className="btn ghost sm no-print" onClick={() => window.print()}>Print or save as PDF</button>;
}
