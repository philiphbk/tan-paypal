"use client";

import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";
import type { ColDef, GridApi, ICellRendererParams } from "ag-grid-community";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";
import { ACTOR_LABEL, STATE_META, eventTitle, money } from "@/lib/format";
import type { Actor, DealState } from "@/lib/types";

ModuleRegistry.registerModules([AllCommunityModule]);

// Theme reads the app's CSS variables so the grid follows light/dark automatically.
const theme = themeQuartz.withParams({
  backgroundColor: "var(--surface)",
  foregroundColor: "var(--ink)",
  borderColor: "var(--line)",
  headerBackgroundColor: "var(--surface-2)",
  headerTextColor: "var(--muted)",
  oddRowBackgroundColor: "var(--surface-2)",
  accentColor: "var(--accent)",
  fontFamily: "var(--sans)",
  fontSize: 14,
  headerFontWeight: 600,
  wrapperBorderRadius: 14,
  rowHoverColor: "var(--accent-soft)",
});

interface Tx { id: string; title: string; state: DealState; amount: number; currency: string; verdict: string | null; confidence: number | null; decidedBy: string | null; authorizationId: string | null; captureId: string | null; payoutStatus: string | null; createdAt: string; updatedAt: string }
interface Ev { dealId: string; title: string; criterion: string; met: boolean; note: string; verdict: string; confidence: number; verifier: string; injectionSuspected: boolean; submittedAt: string | null }
interface Au { dealId: string; title: string; at: string; type: string; actor: Actor; detail: string }
type Tab = "transactions" | "evidence" | "audit";

const badge = (label: string, tone: string) => <span className={`badge ${tone}`}>{label}</span>;
const date = (p: { value?: string }) => (p.value ? new Date(p.value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "");

const txCols: ColDef<Tx>[] = [
  { field: "title", headerName: "Deal", flex: 2, minWidth: 200 },
  { field: "state", headerName: "Status", minWidth: 150, cellRenderer: (p: ICellRendererParams<Tx>) => p.data ? badge(STATE_META[p.data.state].label, STATE_META[p.data.state].tone) : null, filter: "agSetColumnFilter" },
  { field: "amount", headerName: "Amount", type: "rightAligned", filter: "agNumberColumnFilter", valueFormatter: (p) => p.data ? money(p.data.amount, p.data.currency) : "" },
  { field: "verdict", headerName: "Verifier", valueFormatter: (p) => (p.value ? String(p.value).replace("_", " ") : "") },
  { field: "confidence", headerName: "Confidence", type: "rightAligned", filter: "agNumberColumnFilter", valueFormatter: (p) => (p.value == null ? "" : `${Math.round(p.value * 100)}%`) },
  { field: "decidedBy", headerName: "Decided by" },
  { field: "payoutStatus", headerName: "Payout" },
  { field: "captureId", headerName: "PayPal capture", cellClass: "mono", minWidth: 170 },
  { field: "updatedAt", headerName: "Updated", sort: "desc", valueFormatter: date, minWidth: 170 },
];

const evCols: ColDef<Ev>[] = [
  { field: "title", headerName: "Deal", flex: 1, minWidth: 160 },
  { field: "criterion", headerName: "Release condition", flex: 2, minWidth: 240 },
  { field: "met", headerName: "Met", maxWidth: 110, cellRenderer: (p: ICellRendererParams<Ev>) => (p.value ? badge("Met", "ok") : badge("Not met", "bad")) },
  { field: "note", headerName: "Verifier note", flex: 2, minWidth: 220 },
  { field: "verdict", headerName: "Verdict", valueFormatter: (p) => String(p.value ?? "").replace("_", " ") },
  { field: "confidence", headerName: "Confidence", type: "rightAligned", valueFormatter: (p) => `${Math.round((p.value ?? 0) * 100)}%` },
  { field: "verifier", headerName: "Engine", valueFormatter: (p) => (p.value === "ai" ? "AI model" : "Offline rules") },
  { field: "injectionSuspected", headerName: "Injection flagged", cellRenderer: (p: ICellRendererParams<Ev>) => (p.value ? badge("Flagged", "warn") : "") },
  { field: "submittedAt", headerName: "Evidence at", valueFormatter: date, minWidth: 170 },
];

const auCols: ColDef<Au>[] = [
  { field: "at", headerName: "When", valueFormatter: date, sort: "desc", minWidth: 170 },
  { field: "title", headerName: "Deal", flex: 1, minWidth: 160 },
  { field: "actor", headerName: "Actor", minWidth: 150, valueFormatter: (p) => ACTOR_LABEL[p.value as Actor] ?? p.value, filter: "agSetColumnFilter" },
  { field: "type", headerName: "Event", flex: 1, minWidth: 200, valueFormatter: (p) => eventTitle({ at: "", type: p.value }) },
  { field: "detail", headerName: "Detail", flex: 2, minWidth: 260 },
];

export function Ledger() {
  const router = useRouter();
  const gridApi = useRef<GridApi | null>(null);
  const [tab, setTab] = useState<Tab>("transactions");
  const [data, setData] = useState<{ transactions: Tx[]; evidence: Ev[]; events: Au[] } | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    const load = () => api<{ transactions: Tx[]; evidence: Ev[]; events: Au[] }>("/api/ledger").then((d) => alive && setData(d)).catch((e) => alive && setError(e.message));
    load();
    const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const kpi = useMemo(() => {
    const tx = data?.transactions ?? [];
    const sum = (f: (t: Tx) => boolean) => tx.filter(f).reduce((s, t) => s + t.amount, 0);
    const released = tx.filter((t) => t.state === "CAPTURED");
    return {
      total: tx.length,
      held: sum((t) => ["FUNDS_AUTHORIZED", "EVIDENCE_SUBMITTED", "VERIFIED"].includes(t.state)),
      released: sum((t) => t.state === "CAPTURED"),
      auto: released.length ? Math.round((released.filter((t) => t.decidedBy === "AI + policy").length / released.length) * 100) : null,
      review: tx.filter((t) => t.state === "DISPUTED").length,
    };
  }, [data]);

  const rows = tab === "transactions" ? data?.transactions : tab === "evidence" ? data?.evidence : data?.events;
  const cols = (tab === "transactions" ? txCols : tab === "evidence" ? evCols : auCols) as ColDef[];
  const label: Record<Tab, string> = { transactions: "Transactions", evidence: "Evidence & verdicts", audit: "Audit trail" };

  return (
    <main className="wrap page">
      <div className="spread" style={{ marginBottom: 18 }}>
        <div>
          <p className="eyebrow">Ledger</p>
          <h1 style={{ fontSize: "clamp(1.6rem, 4vw, 2.4rem)" }}>Every deal, every decision</h1>
        </div>
        <button className="btn ghost sm" onClick={() => gridApi.current?.exportDataAsCsv({ fileName: `tan-${tab}.csv` })}>Export CSV</button>
      </div>

      <div className="kpis">
        <div className="kpi"><span className="small muted">Deals</span><b className="num">{kpi.total}</b></div>
        <div className="kpi"><span className="small muted">On hold (sandbox)</span><b className="num">{kpi.held.toFixed(2)}</b></div>
        <div className="kpi"><span className="small muted">Released</span><b className="num">{kpi.released.toFixed(2)}</b></div>
        <div className="kpi"><span className="small muted">Released without a human</span><b className="num">{kpi.auto == null ? "—" : `${kpi.auto}%`}</b></div>
        <div className="kpi"><span className="small muted">Awaiting human review</span><b className="num">{kpi.review}</b></div>
      </div>

      <div className="spread">
        <div className="tabs" role="tablist">
          {(Object.keys(label) as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{label[t]}</button>
          ))}
        </div>
        <input className="input" style={{ maxWidth: 260, marginBottom: 14 }} placeholder="Search this table…" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {error && <div className="callout bad">{error}</div>}
      <div className="grid-shell">
        <AgGridReact
          key={tab}
          theme={theme}
          rowData={rows ?? null}
          columnDefs={cols}
          defaultColDef={{ sortable: true, filter: true, resizable: true }}
          quickFilterText={q}
          pagination
          paginationPageSize={15}
          paginationPageSizeSelector={[15, 30, 100]}
          animateRows
          overlayNoRowsTemplate="No records yet. Create a deal to populate the ledger."
          onGridReady={(e) => { gridApi.current = e.api; }}
          onRowClicked={(e) => {
            const id = tab === "transactions" ? (e.data as Tx).id : (e.data as Ev | Au).dealId;
            if (id) router.push(`/deals/${id}/receipt`);
          }}
          getRowId={tab === "transactions" ? (p) => (p.data as Tx).id : undefined}
          rowStyle={{ cursor: "pointer" }}
        />
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>Click a row to open its receipt. Data refreshes every few seconds.</p>
    </main>
  );
}
